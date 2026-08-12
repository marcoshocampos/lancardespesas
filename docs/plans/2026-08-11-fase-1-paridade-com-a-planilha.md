# Fase 1 — Paridade com a planilha · Plano de implementação

> **Para quem executa com agente:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** entregar um sistema em que Nardy e Nick consigam abandonar a planilha — lançar
despesas de cartão e de contas externas, com parcelas geradas sozinhas, rateio do conjunto,
a matriz de totais e a conferência da fatura contra o extrato.

**Arquitetura:** as regras de cálculo vivem em `src/domain/`, como funções puras sem nenhum
I/O, e são desenvolvidas por TDD antes de existir banco ou tela. Acima delas, `src/server/`
faz a ponte com o Prisma através de server actions validadas com Zod, e `src/app/` renderiza
com React Server Components. A ordem das tarefas é deliberada: domínio primeiro, porque é
onde moram os bugs caros e onde o teste é mais barato.

**Stack:** Next.js 15 (App Router), TypeScript estrito, Prisma, Postgres no Neon, Auth.js v5
com Google, Tailwind, shadcn/ui, TanStack Table, Vitest, Playwright.

## Restrições globais

Valem para todas as tarefas, sem exceção.

- **Dinheiro é `number` inteiro em centavos.** Nenhum `float`, nenhum `Decimal`, em nenhuma
  camada. O tipo é `Centavos`, definido na Tarefa 2.
- **Datas no domínio são strings `AAAA-MM-DD`** (tipo `DataISO`). **Não use `Date` dentro de
  `src/domain/`** — é o que elimina a classe inteira de bugs de fuso horário. Timezone da
  aplicação: `America/Sao_Paulo`.
- **`src/domain/` não importa nada de `src/server/`, `src/app/`, Prisma, `fetch` ou
  `Date.now()`.** Funções puras, argumentos entram, valor sai.
- **Toda gravação de lançamento usa lock otimista** com `WHERE versao = ?`.
- **Nada é apagado**: `deletadoEm`, nunca `DELETE`.
- **Identificadores em português sem acento** para o domínio (`competencia`, `rateio`,
  `lancamento`, `parcela`, `fatura`, `conta`), inglês para termos técnicos (`repository`,
  `schema`, `handler`). Comentários e commits em português.
- **Nunca commitar sem autorização do usuário.** Onde o plano diz "commit", significa:
  preparar as alterações, descrever o que mudou e a mensagem proposta, e **esperar o
  "pode commitar"**. Vale para `push`, `--amend`, branch e PR.
- **Fixture obrigatória:** os números reais de agosto, em
  [`docs/regras-de-negocio.md`](../regras-de-negocio.md#4-totais-do-mês). Se os totais não
  reproduzirem `R$ 1.025,51` de fatura, `R$ 474,25` e `R$ 551,26` de total geral, o
  cálculo está errado.
- **Segredos** vêm de `.env.local`, a partir do `.env.example`. Nunca escreva um valor real
  em arquivo versionado, em log ou em conversa.

---

## Estrutura de arquivos

Criados ao longo da Fase 1, com a responsabilidade de cada um:

```
src/domain/
  money.ts             tipo Centavos, conversão e formatação BRL
  data.ts              tipo DataISO, aritmética de datas sem fuso
  competencia.ts       data + conta → competência; avançar meses
  parcelamento.ts      geração de parcelas e arredondamento
  rateio.ts            divisão do conjunto e resto de centavos
  totais.ts            matriz pessoas × contas
src/server/
  db.ts                cliente Prisma singleton
  auth.ts              Auth.js v5, provider Google, allowlist
  repositorios/
    lancamento.ts      leitura e gravação com lock otimista
    resumo.ts          carrega parcelas da competência para o domínio
    fatura.ts          fatura, valor real e conferência
  actions/
    lancamento.ts      criar, editar, excluir; validação Zod
    fatura.ts          registrar valor real do extrato
src/app/
  layout.tsx           shell, tema, sessão
  (auth)/entrar/       tela de login
  despesas/            grade do mês, layout B
  resumo/              matriz pessoas × contas
prisma/
  schema.prisma        modelo físico
  seed.ts              membros da allowlist, C6, conta externa, 8 categorias
scripts/
  importar-planilha.ts uso único, CSV da aba do mês
```

Cada arquivo de `src/domain/` tem um `.test.ts` irmão. Os testes de domínio rodam sem banco,
sem rede e sem browser.

---

## Tarefa 1 — Scaffold, TypeScript estrito e Vitest

**Arquivos:**
- Criar: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Modificar: `.gitignore` (já preparado pelo usuário — conferir, não reescrever)

**Interfaces:**
- Consome: nada
- Produz: `npm test`, `npm run dev`, `npm run build` funcionando; alias `@/` para `src/`

- [ ] **Passo 1: Criar o projeto Next.js**

Rode na raiz do repositório, que já contém `README.md`, `CLAUDE.md` e `docs/`:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Quando perguntar sobre sobrescrever arquivos existentes, **preserve** `README.md` e
`.gitignore`.

- [ ] **Passo 2: Endurecer o TypeScript**

Em `tsconfig.json`, dentro de `compilerOptions`, garanta:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "exactOptionalPropertyTypes": true,
  "forceConsistentCasingInFileNames": true
}
```

`noUncheckedIndexedAccess` é o que mais paga aqui: acessar `parcelas[i]` passa a exigir
tratar `undefined`, e é exatamente onde erros de índice em geração de parcelas se escondem.

- [ ] **Passo 3: Instalar e configurar o Vitest**

```bash
npm install -D vitest vite-tsconfig-paths
```

Nada de `@vitejs/plugin-react` aqui: a Fase 1 não tem teste de componente — os testes de
domínio são `.test.ts` puros e os de UI são Playwright, na Tarefa 11. Ele entra quando o
primeiro teste de componente existir, não antes.

Crie `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

Em `package.json`, adicione aos `scripts`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Passo 4: Verificar que a toolchain responde**

```bash
npm run build
```

Esperado: build conclui sem erro.

```bash
npm test
```

Esperado: `No test files found` — e **código de saída 0**. Se sair diferente de zero, ajuste
`include` antes de seguir; a Tarefa 2 depende disso.

- [ ] **Passo 5: Commit (pedir autorização antes)**

Descreva ao usuário: scaffold do Next.js, TypeScript estrito, Vitest configurado. Mensagem
proposta:

```
Cria o esqueleto do projeto com TypeScript estrito e Vitest
```

---

## Tarefa 2 — `domain/money.ts` e `domain/data.ts`

Os dois tipos-base de que todo o resto depende. Juntos numa tarefa porque nenhum dos dois
sozinho é revisável de forma útil.

**Arquivos:**
- Criar: `src/domain/money.ts`, `src/domain/money.test.ts`
- Criar: `src/domain/data.ts`, `src/domain/data.test.ts`

**Interfaces:**
- Consome: nada
- Produz:
  - `type Centavos = number`
  - `reaisParaCentavos(texto: string): Centavos`
  - `formatarBRL(v: Centavos): string`
  - `type DataISO = string`
  - `partesDaData(d: DataISO): { ano: number; mes: number; dia: number }`
  - `ultimoDiaDoMes(ano: number, mes: number): number`

- [ ] **Passo 1: Escrever os testes de money que falham**

`src/domain/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatarBRL, reaisParaCentavos } from './money';

describe('reaisParaCentavos', () => {
  it('converte o formato brasileiro com milhar e decimal', () => {
    expect(reaisParaCentavos('1.025,51')).toBe(102551);
    expect(reaisParaCentavos('432,10')).toBe(43210);
    expect(reaisParaCentavos('88,00')).toBe(8800);
  });

  it('aceita valor sem centavos', () => {
    expect(reaisParaCentavos('65')).toBe(6500);
    expect(reaisParaCentavos('65,0')).toBe(6500);
  });

  it('aceita prefixo de moeda e espaco', () => {
    expect(reaisParaCentavos('R$ 474,25')).toBe(47425);
  });

  it('aceita valor negativo, usado em estorno', () => {
    expect(reaisParaCentavos('-100,00')).toBe(-10000);
  });

  it('recusa texto que nao e valor', () => {
    expect(() => reaisParaCentavos('abc')).toThrow('Valor invalido');
    expect(() => reaisParaCentavos('')).toThrow('Valor invalido');
  });
});

describe('formatarBRL', () => {
  it('formata com milhar e duas casas', () => {
    expect(formatarBRL(102551)).toBe('R$ 1.025,51');
    expect(formatarBRL(6500)).toBe('R$ 65,00');
    expect(formatarBRL(0)).toBe('R$ 0,00');
  });

  it('formata negativo com o sinal antes da moeda', () => {
    expect(formatarBRL(-10000)).toBe('-R$ 100,00');
  });

  it('sobrevive a ida e volta', () => {
    expect(reaisParaCentavos(formatarBRL(47425))).toBe(47425);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/money.test.ts
```

Esperado: FAIL, `Failed to resolve import "./money"`.

- [ ] **Passo 3: Implementar `money.ts`**

```ts
/** Dinheiro sempre em centavos, inteiro. Nunca use float para valor. */
export type Centavos = number;

const NAO_NUMERICO = /[^\d,-]/g;

/** Converte texto no formato brasileiro ("474,25", "R$ 65", "-100,00") em centavos. */
export function reaisParaCentavos(texto: string): Centavos {
  const limpo = texto.trim().replace(NAO_NUMERICO, '');
  if (limpo === '' || limpo === '-') throw new Error(`Valor invalido: ${texto}`);

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;
  const [inteira = '', decimal = ''] = semSinal.split(',');

  if (inteira === '' || !/^\d+$/.test(inteira)) throw new Error(`Valor invalido: ${texto}`);
  if (decimal !== '' && !/^\d{1,2}$/.test(decimal)) throw new Error(`Valor invalido: ${texto}`);

  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, '0'));
  return negativo ? -centavos : centavos;
}

/** Formata centavos como moeda brasileira: 102551 vira "R$ 1.025,51". */
export function formatarBRL(valor: Centavos): string {
  const negativo = valor < 0;
  const absoluto = Math.abs(valor);
  const inteira = Math.trunc(absoluto / 100).toLocaleString('pt-BR');
  const decimal = String(absoluto % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}R$ ${inteira},${decimal}`;
}
```

O ponto do `replace(NAO_NUMERICO)` é aceitar o que a pessoa realmente digita na grade: com
`R$`, sem `R$`, com ponto de milhar, sem.

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run src/domain/money.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Passo 5: Escrever os testes de data que falham**

`src/domain/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { partesDaData, ultimoDiaDoMes } from './data';

describe('partesDaData', () => {
  it('decompoe sem envolver fuso horario', () => {
    expect(partesDaData('2026-08-04')).toEqual({ ano: 2026, mes: 8, dia: 4 });
    expect(partesDaData('2026-01-31')).toEqual({ ano: 2026, mes: 1, dia: 31 });
  });

  it('recusa formato diferente de AAAA-MM-DD', () => {
    expect(() => partesDaData('04/08/2026')).toThrow('Data invalida');
    expect(() => partesDaData('2026-8-4')).toThrow('Data invalida');
  });

  it('recusa data que nao existe no calendario', () => {
    expect(() => partesDaData('2026-02-30')).toThrow('Data invalida');
    expect(() => partesDaData('2026-13-01')).toThrow('Data invalida');
  });
});

describe('ultimoDiaDoMes', () => {
  it('conhece os meses de 30 e 31 dias', () => {
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
  });

  it('trata fevereiro e ano bissexto', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(ultimoDiaDoMes(2000, 2)).toBe(29);
    expect(ultimoDiaDoMes(1900, 2)).toBe(28);
  });
});
```

- [ ] **Passo 6: Rodar e ver falhar**

```bash
npx vitest run src/domain/data.test.ts
```

Esperado: FAIL, `Failed to resolve import "./data"`.

- [ ] **Passo 7: Implementar `data.ts`**

```ts
/** Data sem hora, no formato AAAA-MM-DD. Nunca use Date no dominio. */
export type DataISO = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function ultimoDiaDoMes(ano: number, mes: number): number {
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dias[mes - 1] ?? 31;
}

export function partesDaData(data: DataISO): { ano: number; mes: number; dia: number } {
  const casou = FORMATO.exec(data);
  if (!casou) throw new Error(`Data invalida: ${data}`);

  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  const dia = Number(casou[3]);

  if (mes < 1 || mes > 12) throw new Error(`Data invalida: ${data}`);
  if (dia < 1 || dia > ultimoDiaDoMes(ano, mes)) throw new Error(`Data invalida: ${data}`);

  return { ano, mes, dia };
}
```

- [ ] **Passo 8: Rodar a suíte inteira**

```bash
npm test
```

Esperado: PASS, 13 testes em 2 arquivos.

- [ ] **Passo 9: Commit (pedir autorização antes)**

```
Adiciona os tipos base de dinheiro e data do dominio

Centavos como inteiro e data como string AAAA-MM-DD, sem Date, que e o
que elimina bugs de fuso antes de eles existirem.
```

---

## Tarefa 3 — `domain/competencia.ts`

**Arquivos:**
- Criar: `src/domain/competencia.ts`, `src/domain/competencia.test.ts`

**Interfaces:**
- Consome: `DataISO`, `partesDaData`, `ultimoDiaDoMes` de `./data`
- Produz:
  - `type Competencia = string` (`AAAA-MM`)
  - `competenciaDeCartao(dataCompra: DataISO, diaFechamento: number): Competencia`
  - `competenciaDeContaExterna(dataPagamento: DataISO): Competencia`
  - `avancarCompetencia(c: Competencia, meses: number): Competencia`
  - `compararCompetencias(a: Competencia, b: Competencia): number`

- [ ] **Passo 1: Escrever o teste que falha**

`src/domain/competencia.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  avancarCompetencia,
  compararCompetencias,
  competenciaDeCartao,
  competenciaDeContaExterna,
} from './competencia';

// C6: fecha dia 4, vence dia 10. A competencia e o mes do vencimento.
const C6_FECHAMENTO = 4;

describe('competenciaDeCartao', () => {
  it('coloca a compra do proprio dia do fechamento na fatura que fecha naquele dia', () => {
    expect(competenciaDeCartao('2026-08-04', C6_FECHAMENTO)).toBe('2026-08');
  });

  it('joga a compra do dia seguinte ao fechamento para a fatura seguinte', () => {
    expect(competenciaDeCartao('2026-08-05', C6_FECHAMENTO)).toBe('2026-09');
  });

  it('coloca a compra do meio do ciclo na fatura que fecha depois dela', () => {
    expect(competenciaDeCartao('2026-07-20', C6_FECHAMENTO)).toBe('2026-08');
  });

  it('vira o ano quando a compra e depois do fechamento de dezembro', () => {
    expect(competenciaDeCartao('2026-12-28', C6_FECHAMENTO)).toBe('2027-01');
  });

  it('usa o ultimo dia do mes quando o fechamento nao existe naquele mes', () => {
    // Fechamento 31 em fevereiro de 2026, que termina no dia 28.
    expect(competenciaDeCartao('2026-02-28', 31)).toBe('2026-02');
    expect(competenciaDeCartao('2026-03-01', 31)).toBe('2026-03');
  });

  it('recusa dia de fechamento fora do intervalo valido', () => {
    expect(() => competenciaDeCartao('2026-08-04', 0)).toThrow('Dia de fechamento invalido');
    expect(() => competenciaDeCartao('2026-08-04', 32)).toThrow('Dia de fechamento invalido');
  });
});

describe('competenciaDeContaExterna', () => {
  it('usa o mes do pagamento, sem fechamento nenhum', () => {
    expect(competenciaDeContaExterna('2026-08-28')).toBe('2026-08');
    expect(competenciaDeContaExterna('2026-08-01')).toBe('2026-08');
  });
});

describe('avancarCompetencia', () => {
  it('avanca dentro do mesmo ano', () => {
    expect(avancarCompetencia('2026-08', 1)).toBe('2026-09');
  });

  it('vira o ano', () => {
    expect(avancarCompetencia('2026-08', 5)).toBe('2027-01');
    expect(avancarCompetencia('2026-12', 1)).toBe('2027-01');
  });

  it('cobre o parcelamento do moto: parcela 2 em agosto, parcela 12 em junho de 2027', () => {
    expect(avancarCompetencia('2026-08', 10)).toBe('2027-06');
  });

  it('aceita zero e valores negativos', () => {
    expect(avancarCompetencia('2026-08', 0)).toBe('2026-08');
    expect(avancarCompetencia('2026-01', -1)).toBe('2025-12');
  });

  it('recusa competencia mal formada', () => {
    expect(() => avancarCompetencia('2026-8', 1)).toThrow('Competencia invalida');
    expect(() => avancarCompetencia('2026-13', 1)).toThrow('Competencia invalida');
  });
});

describe('compararCompetencias', () => {
  it('ordena cronologicamente', () => {
    expect(compararCompetencias('2026-08', '2026-09')).toBeLessThan(0);
    expect(compararCompetencias('2027-01', '2026-12')).toBeGreaterThan(0);
    expect(compararCompetencias('2026-08', '2026-08')).toBe(0);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/competencia.test.ts
```

Esperado: FAIL, `Failed to resolve import "./competencia"`.

- [ ] **Passo 3: Implementar `competencia.ts`**

```ts
import { partesDaData, ultimoDiaDoMes, type DataISO } from './data';

/** Mes ao qual um lancamento pertence, no formato AAAA-MM. */
export type Competencia = string;

const FORMATO = /^(\d{4})-(\d{2})$/;

function montar(ano: number, mes: number): Competencia {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

function partesDaCompetencia(c: Competencia): { ano: number; mes: number } {
  const casou = FORMATO.exec(c);
  if (!casou) throw new Error(`Competencia invalida: ${c}`);
  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  if (mes < 1 || mes > 12) throw new Error(`Competencia invalida: ${c}`);
  return { ano, mes };
}

/**
 * Competencia de uma compra no cartao, a partir do dia de fechamento.
 *
 * A compra feita ATE o dia do fechamento entra na fatura que fecha naquele mes;
 * depois disso, na seguinte. Quando o mes nao tem o dia configurado — fechamento
 * 31 em fevereiro —, vale o ultimo dia do mes.
 */
export function competenciaDeCartao(dataCompra: DataISO, diaFechamento: number): Competencia {
  if (!Number.isInteger(diaFechamento) || diaFechamento < 1 || diaFechamento > 31) {
    throw new Error(`Dia de fechamento invalido: ${diaFechamento}`);
  }

  const { ano, mes, dia } = partesDaData(dataCompra);
  const fechamentoEfetivo = Math.min(diaFechamento, ultimoDiaDoMes(ano, mes));

  return dia <= fechamentoEfetivo ? montar(ano, mes) : avancarCompetencia(montar(ano, mes), 1);
}

/** Competencia de uma conta externa: o mes do proprio pagamento. */
export function competenciaDeContaExterna(dataPagamento: DataISO): Competencia {
  const { ano, mes } = partesDaData(dataPagamento);
  return montar(ano, mes);
}

/** Avanca (ou recua, com valor negativo) uma quantidade de meses. */
export function avancarCompetencia(c: Competencia, meses: number): Competencia {
  const { ano, mes } = partesDaCompetencia(c);
  const total = ano * 12 + (mes - 1) + meses;
  return montar(Math.floor(total / 12), (total % 12) + 1);
}

/** Negativo se a vem antes de b, zero se iguais, positivo se depois. */
export function compararCompetencias(a: Competencia, b: Competencia): number {
  partesDaCompetencia(a);
  partesDaCompetencia(b);
  return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS, todos os arquivos.

- [ ] **Passo 5: Commit (pedir autorização antes)**

```
Calcula a competencia a partir da data e do fechamento da conta

O dia do fechamento e inclusive: compra em 04/08 no C6 cai na fatura de
agosto, compra em 05/08 cai na de setembro.
```

---

## Tarefa 4 — `domain/parcelamento.ts`

**Arquivos:**
- Criar: `src/domain/parcelamento.ts`, `src/domain/parcelamento.test.ts`

**Interfaces:**
- Consome: `Centavos` de `./money`; `Competencia`, `avancarCompetencia` de `./competencia`
- Produz:
  - `type OrigemValor = 'POR_PARCELA' | 'TOTAL'`
  - `type ParcelaGerada = { numero: number; valorCentavos: Centavos; competencia: Competencia }`
  - `gerarParcelas(entrada: EntradaParcelamento): ParcelaGerada[]`
  - `type EntradaParcelamento = { valorCentavos: Centavos; origem: OrigemValor; numeroParcelas: number; competenciaBase: Competencia }`

- [ ] **Passo 1: Escrever o teste que falha**

`src/domain/parcelamento.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gerarParcelas } from './parcelamento';

describe('gerarParcelas', () => {
  it('gera uma unica parcela para compra a vista', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 8800,
      origem: 'POR_PARCELA',
      numeroParcelas: 1,
      competenciaBase: '2026-08',
    });

    expect(parcelas).toEqual([{ numero: 1, valorCentavos: 8800, competencia: '2026-08' }]);
  });

  it('repete o valor quando a pessoa digita o valor da parcela', () => {
    // moto: R$ 432,10 por parcela, 12x, comecando em julho de 2026.
    const parcelas = gerarParcelas({
      valorCentavos: 43210,
      origem: 'POR_PARCELA',
      numeroParcelas: 12,
      competenciaBase: '2026-07',
    });

    expect(parcelas).toHaveLength(12);
    expect(parcelas.every((p) => p.valorCentavos === 43210)).toBe(true);
    expect(parcelas[1]).toEqual({ numero: 2, valorCentavos: 43210, competencia: '2026-08' });
    expect(parcelas[11]).toEqual({ numero: 12, valorCentavos: 43210, competencia: '2027-06' });
  });

  it('joga a sobra de centavos na ultima parcela quando o valor digitado e o total', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 10000,
      origem: 'TOTAL',
      numeroParcelas: 3,
      competenciaBase: '2026-08',
    });

    expect(parcelas.map((p) => p.valorCentavos)).toEqual([3333, 3333, 3334]);
  });

  it('mantem a soma das parcelas igual ao total, sempre', () => {
    for (const total of [10000, 10001, 99999, 102551, 1]) {
      for (const n of [1, 2, 3, 7, 12, 24]) {
        const parcelas = gerarParcelas({
          valorCentavos: total,
          origem: 'TOTAL',
          numeroParcelas: n,
          competenciaBase: '2026-08',
        });
        const soma = parcelas.reduce((acc, p) => acc + p.valorCentavos, 0);
        expect(soma, `total ${total} em ${n}x`).toBe(total);
      }
    }
  });

  it('avanca a competencia um mes por parcela, virando o ano', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 30000,
      origem: 'TOTAL',
      numeroParcelas: 6,
      competenciaBase: '2026-11',
    });

    expect(parcelas.map((p) => p.competencia)).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04',
    ]);
  });

  it('funciona com estorno, que tem valor negativo e uma parcela so', () => {
    const parcelas = gerarParcelas({
      valorCentavos: -10000,
      origem: 'POR_PARCELA',
      numeroParcelas: 1,
      competenciaBase: '2026-09',
    });

    expect(parcelas).toEqual([{ numero: 1, valorCentavos: -10000, competencia: '2026-09' }]);
  });

  it('recusa numero de parcelas invalido', () => {
    const base = { valorCentavos: 10000, origem: 'TOTAL' as const, competenciaBase: '2026-08' };
    expect(() => gerarParcelas({ ...base, numeroParcelas: 0 })).toThrow('Numero de parcelas invalido');
    expect(() => gerarParcelas({ ...base, numeroParcelas: -1 })).toThrow('Numero de parcelas invalido');
    expect(() => gerarParcelas({ ...base, numeroParcelas: 1.5 })).toThrow('Numero de parcelas invalido');
  });

  it('recusa parcelar valor negativo, porque estorno parcelado nao existe', () => {
    expect(() =>
      gerarParcelas({
        valorCentavos: -10000,
        origem: 'TOTAL',
        numeroParcelas: 3,
        competenciaBase: '2026-08',
      }),
    ).toThrow('Estorno nao pode ser parcelado');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/parcelamento.test.ts
```

Esperado: FAIL, `Failed to resolve import "./parcelamento"`.

- [ ] **Passo 3: Implementar `parcelamento.ts`**

```ts
import { avancarCompetencia, type Competencia } from './competencia';
import type { Centavos } from './money';

/** Se o valor digitado pela pessoa e o de cada parcela ou o total da compra. */
export type OrigemValor = 'POR_PARCELA' | 'TOTAL';

export type EntradaParcelamento = {
  valorCentavos: Centavos;
  origem: OrigemValor;
  numeroParcelas: number;
  competenciaBase: Competencia;
};

export type ParcelaGerada = {
  numero: number;
  valorCentavos: Centavos;
  competencia: Competencia;
};

/**
 * Gera as parcelas de um lancamento.
 *
 * Com origem TOTAL, a divisao e em centavos e a diferenca de arredondamento vai
 * na ULTIMA parcela, de modo que a soma seja sempre exatamente o total.
 */
export function gerarParcelas(entrada: EntradaParcelamento): ParcelaGerada[] {
  const { valorCentavos, origem, numeroParcelas, competenciaBase } = entrada;

  if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1) {
    throw new Error(`Numero de parcelas invalido: ${numeroParcelas}`);
  }
  if (valorCentavos < 0 && numeroParcelas > 1) {
    throw new Error('Estorno nao pode ser parcelado');
  }

  const valores: Centavos[] = [];
  if (origem === 'POR_PARCELA') {
    for (let i = 0; i < numeroParcelas; i += 1) valores.push(valorCentavos);
  } else {
    const base = Math.trunc(valorCentavos / numeroParcelas);
    for (let i = 0; i < numeroParcelas - 1; i += 1) valores.push(base);
    valores.push(valorCentavos - base * (numeroParcelas - 1));
  }

  return valores.map((valor, indice) => ({
    numero: indice + 1,
    valorCentavos: valor,
    competencia: avancarCompetencia(competenciaBase, indice),
  }));
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS. O teste de invariante da soma cobre 30 combinações.

- [ ] **Passo 5: Commit (pedir autorização antes)**

```
Gera as parcelas de um lancamento

A soma das parcelas e sempre exatamente o valor total: a diferenca de
arredondamento vai na ultima. Estorno parcelado e recusado.
```

---

## Tarefa 5 — `domain/rateio.ts`

**Arquivos:**
- Criar: `src/domain/rateio.ts`, `src/domain/rateio.test.ts`

**Interfaces:**
- Consome: `Centavos` de `./money`
- Produz:
  - `type PesoRateio = { membroId: string; percentual: number }`
  - `type Cota = { membroId: string; valorCentavos: Centavos }`
  - `ratear(valorCentavos: Centavos, pesos: PesoRateio[]): Cota[]`
  - `pesosMeioAMeio(membroIds: string[]): PesoRateio[]`

- [ ] **Passo 1: Escrever o teste que falha**

`src/domain/rateio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pesosMeioAMeio, ratear } from './rateio';

const NARDY = 'membro-nardy';
const NICK = 'membro-nick';

describe('pesosMeioAMeio', () => {
  it('divide igualmente entre duas pessoas', () => {
    expect(pesosMeioAMeio([NARDY, NICK])).toEqual([
      { membroId: NARDY, percentual: 50 },
      { membroId: NICK, percentual: 50 },
    ]);
  });
});

describe('ratear', () => {
  it('divide o caso real do fone sem sobra', () => {
    const cotas = ratear(10101, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 5050 },
      { membroId: NICK, valorCentavos: 5050 },
    ]);
  });

  it('da a sobra de centavos ao primeiro peso, sempre o mesmo', () => {
    const cotas = ratear(10001, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 5001 },
      { membroId: NICK, valorCentavos: 5000 },
    ]);
  });

  it('respeita percentuais diferentes de 50/50', () => {
    const cotas = ratear(10000, [
      { membroId: NARDY, percentual: 30 },
      { membroId: NICK, percentual: 70 },
    ]);
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 3000 },
      { membroId: NICK, valorCentavos: 7000 },
    ]);
  });

  it('mantem a soma das cotas igual ao valor rateado, sempre', () => {
    for (const valor of [1, 3, 10001, 10101, 99999, 102551]) {
      const cotas = ratear(valor, pesosMeioAMeio([NARDY, NICK]));
      const soma = cotas.reduce((acc, c) => acc + c.valorCentavos, 0);
      expect(soma, `valor ${valor}`).toBe(valor);
    }
  });

  it('rateia estorno, mantendo o sinal negativo', () => {
    const cotas = ratear(-10000, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas.map((c) => c.valorCentavos)).toEqual([-5000, -5000]);
    expect(cotas.reduce((a, c) => a + c.valorCentavos, 0)).toBe(-10000);
  });

  it('recusa percentuais que nao somam 100', () => {
    expect(() =>
      ratear(10000, [
        { membroId: NARDY, percentual: 30 },
        { membroId: NICK, percentual: 30 },
      ]),
    ).toThrow('Percentuais devem somar 100');
  });

  it('recusa lista de pesos vazia', () => {
    expect(() => ratear(10000, [])).toThrow('Rateio exige ao menos um membro');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/rateio.test.ts
```

Esperado: FAIL, `Failed to resolve import "./rateio"`.

- [ ] **Passo 3: Implementar `rateio.ts`**

```ts
import type { Centavos } from './money';

export type PesoRateio = { membroId: string; percentual: number };
export type Cota = { membroId: string; valorCentavos: Centavos };

/** Divisao igual entre os membros informados, na ordem em que vierem. */
export function pesosMeioAMeio(membroIds: string[]): PesoRateio[] {
  const percentual = 100 / membroIds.length;
  return membroIds.map((membroId) => ({ membroId, percentual }));
}

/**
 * Divide um valor entre membros conforme os percentuais.
 *
 * O resto de centavos vai para o PRIMEIRO peso da lista — por convencao, o membro
 * mais antigo por ordem de cadastro. Sempre o mesmo, para que o resultado nao
 * dependa do historico e possa ser conferido na mao.
 */
export function ratear(valorCentavos: Centavos, pesos: PesoRateio[]): Cota[] {
  if (pesos.length === 0) throw new Error('Rateio exige ao menos um membro');

  const soma = pesos.reduce((acc, p) => acc + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-9) {
    throw new Error(`Percentuais devem somar 100, somaram ${soma}`);
  }

  const negativo = valorCentavos < 0;
  const absoluto = Math.abs(valorCentavos);

  const cotas = pesos.map((peso) => ({
    membroId: peso.membroId,
    valorCentavos: Math.trunc((absoluto * peso.percentual) / 100),
  }));

  const distribuido = cotas.reduce((acc, c) => acc + c.valorCentavos, 0);
  const primeira = cotas[0];
  if (primeira) primeira.valorCentavos += absoluto - distribuido;

  return negativo
    ? cotas.map((c) => ({ ...c, valorCentavos: -c.valorCentavos }))
    : cotas;
}
```

Trabalhar sobre o valor absoluto e reaplicar o sinal no fim evita que `Math.trunc` arredonde
para lados diferentes em valores negativos, que é como a soma deixaria de fechar em estornos.

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS.

- [ ] **Passo 5: Commit (pedir autorização antes)**

```
Rateia lancamentos de escopo conjunto

A soma das cotas e sempre igual ao valor rateado. A sobra de centavos vai
sempre para o mesmo membro, para o resultado ser conferivel na mao.
```

---

## Tarefa 6 — `domain/totais.ts`, a matriz

O coração da Fase 1. É esta tarefa que prova que o sistema reproduz a planilha.

**Arquivos:**
- Criar: `src/domain/totais.ts`, `src/domain/totais.test.ts`
- Criar: `src/domain/fixtures/agosto-2026.ts`

**Interfaces:**
- Consome: `Centavos` de `./money`; `Cota` de `./rateio`
- Produz:
  - `const COLUNA_TOTAL = 'TOTAL'`
  - `type ParcelaResumo = { contaId: string; escopo: 'PESSOAL' | 'CONJUNTO'; membroId?: string; valorCentavos: Centavos; cotas?: Cota[] }`
  - `type LinhaMatriz = Record<string, Centavos>` (contaId → valor, incluindo `COLUNA_TOTAL`)
  - `type ResumoMes = { contas: string[]; pessoal: Record<string, LinhaMatriz>; conjunto: LinhaMatriz; metade: Record<string, LinhaMatriz>; totalGeral: Record<string, LinhaMatriz>; somado: LinhaMatriz }`
  - `calcularResumo(parcelas: ParcelaResumo[], membroIds: string[], contaIds: string[]): ResumoMes`

- [ ] **Passo 1: Criar a fixture com os dados reais de agosto**

`src/domain/fixtures/agosto-2026.ts`:

```ts
import type { ParcelaResumo } from '../totais';

export const NARDY = 'membro-nardy';
export const NICK = 'membro-nick';
export const C6 = 'conta-c6';
export const EXTERNA = 'conta-externa';

function pessoal(contaId: string, membroId: string, valorCentavos: number): ParcelaResumo {
  return { contaId, escopo: 'PESSOAL', membroId, valorCentavos };
}

function conjunto(contaId: string, valorCentavos: number): ParcelaResumo {
  const metade = valorCentavos / 2;
  return {
    contaId,
    escopo: 'CONJUNTO',
    valorCentavos,
    cotas: [
      { membroId: NARDY, valorCentavos: metade },
      { membroId: NICK, valorCentavos: metade },
    ],
  };
}

/**
 * Competencia 2026-08 da planilha real, mais o "manutencao da moto" como despesa
 * externa de Nick. Os totais estao em docs/regras-de-negocio.md, secao 4.
 */
export const PARCELAS_AGOSTO_2026: ParcelaResumo[] = [
  // Nardy, no C6 — soma 423,75
  pessoal(C6, NARDY, 10000), // aparelho 6/12
  pessoal(C6, NARDY, 2500),  // loja online 4/4
  pessoal(C6, NARDY, 2689),  // loja online 3/3
  pessoal(C6, NARDY, 4165),  // loja online 3/3
  pessoal(C6, NARDY, 6500),  // salão 2/2
  pessoal(C6, NARDY, 14033), // controlados 3/3
  pessoal(C6, NARDY, 11184), // presente dia dos pais
  pessoal(C6, NARDY, 8800),  // google
  pessoal(C6, NARDY, 1900),  // resistencia
  pessoal(C6, NARDY, 1983),  // acessório
  pessoal(C6, NARDY, 1690),  // bucha
  pessoal(C6, NARDY, 1511),  // fita adesiva
  pessoal(C6, NARDY, 12433), // loja online

  // Nick, no C6 — soma 500,75
  pessoal(C6, NICK, 30000),  // fone bluetooth 4/5
  pessoal(C6, NICK, 7382),   // steam 3/3
  pessoal(C6, NICK, 43210),  // moto 2/12
  pessoal(C6, NICK, 2970),   // alargador 2/3
  pessoal(C6, NICK, 9500),  // seguro anual
  pessoal(C6, NICK, 12312),  // ml 04/08

  // Conjunto, no C6 — 101,01
  conjunto(C6, 10101),       // fone + suporte 2/3

  // Nick, fora do cartao — 80,00
  pessoal(EXTERNA, NICK, 8000), // manutencao da moto 2/4
];
```

- [ ] **Passo 2: Escrever o teste que falha**

`src/domain/totais.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { C6, EXTERNA, NARDY, NICK, PARCELAS_AGOSTO_2026 } from './fixtures/agosto-2026';
import { COLUNA_TOTAL, calcularResumo } from './totais';

const MEMBROS = [NARDY, NICK];
const CONTAS = [C6, EXTERNA];

describe('calcularResumo, com os dados reais de agosto de 2026', () => {
  const resumo = calcularResumo(PARCELAS_AGOSTO_2026, MEMBROS, CONTAS);

  it('reproduz os totais pessoais da planilha na coluna do C6', () => {
    expect(resumo.pessoal[NARDY]?.[C6]).toBe(42375);
    expect(resumo.pessoal[NICK]?.[C6]).toBe(50075);
  });

  it('reproduz o total do conjunto e a metade', () => {
    expect(resumo.conjunto[C6]).toBe(10101);
    expect(resumo.metade[NARDY]?.[C6]).toBe(5050);
    expect(resumo.metade[NICK]?.[C6]).toBe(5050);
  });

  it('reproduz o TOTAL GERAL de cada pessoa no C6', () => {
    expect(resumo.totalGeral[NARDY]?.[C6]).toBe(47425);
    expect(resumo.totalGeral[NICK]?.[C6]).toBe(55126);
  });

  it('reproduz a fatura do C6, que e o somado daquela coluna', () => {
    expect(resumo.somado[C6]).toBe(102551);
  });

  it('separa a despesa externa na coluna dela', () => {
    expect(resumo.pessoal[NICK]?.[EXTERNA]).toBe(8000);
    expect(resumo.pessoal[NARDY]?.[EXTERNA]).toBe(0);
    expect(resumo.somado[EXTERNA]).toBe(8000);
  });

  it('soma cartao e conta externa na coluna de total', () => {
    expect(resumo.pessoal[NICK]?.[COLUNA_TOTAL]).toBe(58075);
    expect(resumo.totalGeral[NICK]?.[COLUNA_TOTAL]).toBe(63126);
    expect(resumo.totalGeral[NARDY]?.[COLUNA_TOTAL]).toBe(47425);
    expect(resumo.somado[COLUNA_TOTAL]).toBe(110551);
  });

  it('mantem a identidade contabil: somado e a soma dos dois totais gerais', () => {
    const soma =
      (resumo.totalGeral[NARDY]?.[COLUNA_TOTAL] ?? 0) +
      (resumo.totalGeral[NICK]?.[COLUNA_TOTAL] ?? 0);
    expect(soma).toBe(resumo.somado[COLUNA_TOTAL]);
  });

  it('expoe as contas na ordem pedida, para as colunas da tela', () => {
    expect(resumo.contas).toEqual([C6, EXTERNA]);
  });
});

describe('calcularResumo, casos de borda', () => {
  it('devolve zeros quando o mes nao tem lancamento', () => {
    const resumo = calcularResumo([], MEMBROS, CONTAS);
    expect(resumo.somado[COLUNA_TOTAL]).toBe(0);
    expect(resumo.totalGeral[NARDY]?.[C6]).toBe(0);
  });

  it('reduz os totais quando ha estorno', () => {
    const resumo = calcularResumo(
      [
        { contaId: C6, escopo: 'PESSOAL', membroId: NICK, valorCentavos: 10000 },
        { contaId: C6, escopo: 'PESSOAL', membroId: NICK, valorCentavos: -2500 },
      ],
      MEMBROS,
      CONTAS,
    );
    expect(resumo.pessoal[NICK]?.[C6]).toBe(7500);
    expect(resumo.somado[C6]).toBe(7500);
  });

  it('recusa parcela pessoal sem membro', () => {
    expect(() =>
      calcularResumo([{ contaId: C6, escopo: 'PESSOAL', valorCentavos: 100 }], MEMBROS, CONTAS),
    ).toThrow('Parcela pessoal sem membro');
  });

  it('recusa parcela de conjunto sem cotas', () => {
    expect(() =>
      calcularResumo([{ contaId: C6, escopo: 'CONJUNTO', valorCentavos: 100 }], MEMBROS, CONTAS),
    ).toThrow('Parcela de conjunto sem rateio');
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
npx vitest run src/domain/totais.test.ts
```

Esperado: FAIL, `Failed to resolve import "./totais"`.

- [ ] **Passo 4: Implementar `totais.ts`**

```ts
import type { Centavos } from './money';
import type { Cota } from './rateio';

/** Chave da coluna que soma todas as contas. */
export const COLUNA_TOTAL = 'TOTAL';

export type ParcelaResumo = {
  contaId: string;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroId?: string;
  valorCentavos: Centavos;
  cotas?: Cota[];
};

/** Uma linha da matriz: contaId para valor, mais a coluna COLUNA_TOTAL. */
export type LinhaMatriz = Record<string, Centavos>;

export type ResumoMes = {
  contas: string[];
  pessoal: Record<string, LinhaMatriz>;
  conjunto: LinhaMatriz;
  metade: Record<string, LinhaMatriz>;
  totalGeral: Record<string, LinhaMatriz>;
  somado: LinhaMatriz;
};

function linhaZerada(contaIds: string[]): LinhaMatriz {
  const linha: LinhaMatriz = { [COLUNA_TOTAL]: 0 };
  for (const contaId of contaIds) linha[contaId] = 0;
  return linha;
}

function acumular(linha: LinhaMatriz, contaId: string, valor: Centavos): void {
  linha[contaId] = (linha[contaId] ?? 0) + valor;
  linha[COLUNA_TOTAL] = (linha[COLUNA_TOTAL] ?? 0) + valor;
}

/**
 * Matriz de pessoas por contas para uma competencia.
 *
 * As linhas seguem a escada da planilha: TOTAL de cada pessoa, TOTAL do conjunto,
 * METADE, TOTAL GERAL por pessoa e SOMADO. Cada linha e aberta por conta, com uma
 * coluna de total. Para uma conta de cartao, o SOMADO daquela coluna e a fatura.
 */
export function calcularResumo(
  parcelas: ParcelaResumo[],
  membroIds: string[],
  contaIds: string[],
): ResumoMes {
  const pessoal: Record<string, LinhaMatriz> = {};
  const metade: Record<string, LinhaMatriz> = {};
  const totalGeral: Record<string, LinhaMatriz> = {};
  for (const membroId of membroIds) {
    pessoal[membroId] = linhaZerada(contaIds);
    metade[membroId] = linhaZerada(contaIds);
    totalGeral[membroId] = linhaZerada(contaIds);
  }
  const conjunto = linhaZerada(contaIds);
  const somado = linhaZerada(contaIds);
  const contasValidas = new Set(contaIds);

  for (const parcela of parcelas) {
    if (!contasValidas.has(parcela.contaId)) {
      throw new Error(`Conta desconhecida no resumo: ${parcela.contaId}`);
    }
    if (parcela.escopo === 'PESSOAL') {
      const membroId = parcela.membroId;
      if (!membroId) throw new Error('Parcela pessoal sem membro');
      const linha = pessoal[membroId];
      if (!linha) throw new Error(`Membro desconhecido no resumo: ${membroId}`);
      acumular(linha, parcela.contaId, parcela.valorCentavos);
    } else {
      const cotas = parcela.cotas;
      if (!cotas || cotas.length === 0) throw new Error('Parcela de conjunto sem rateio');
      const somaCotas = cotas.reduce((acc, cota) => acc + cota.valorCentavos, 0);
      if (somaCotas !== parcela.valorCentavos) {
        throw new Error('Rateio nao fecha com o valor da parcela');
      }
      acumular(conjunto, parcela.contaId, parcela.valorCentavos);
      for (const cota of cotas) {
        const linha = metade[cota.membroId];
        if (!linha) throw new Error(`Membro desconhecido no rateio: ${cota.membroId}`);
        acumular(linha, parcela.contaId, cota.valorCentavos);
      }
    }
    acumular(somado, parcela.contaId, parcela.valorCentavos);
  }

  const colunas = [...contaIds, COLUNA_TOTAL];
  for (const membroId of membroIds) {
    for (const coluna of colunas) {
      const destino = totalGeral[membroId];
      if (!destino) continue;
      destino[coluna] = (pessoal[membroId]?.[coluna] ?? 0) + (metade[membroId]?.[coluna] ?? 0);
    }
  }

  return { contas: [...contaIds], pessoal, conjunto, metade, totalGeral, somado };
}
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS. **Se qualquer número da fixture de agosto não bater, pare e investigue antes
de seguir** — este é o teste que garante paridade com a planilha.

Além dos casos de borda listados acima, cubra quatro situações de entrada incoerente, que a
revisão desta tarefa mostrou serem silenciosas se não forem testadas: parcela pessoal com
conta fora de `contaIds`; parcela de conjunto com conta fora de `contaIds`; cotas somando
menos que o valor da parcela; e a identidade contábil com rateio assimétrico 70/30, que deve
se manter — ela depende das cotas fecharem com o valor, não de o rateio ser 50/50.

- [ ] **Passo 6: Commit (pedir autorização antes)**

```
Calcula a matriz de totais de pessoas por contas

Os testes usam os numeros reais de agosto como fixture: se a coluna do C6
nao reproduzir a planilha, o calculo esta errado.
```

---

## Tarefa 7 — Schema do Prisma, migration e seed

**Arquivos:**
- Criar: `prisma/schema.prisma`, `prisma/seed.ts`, `src/server/db.ts`
- Modificar: `package.json` (script `db:seed`, bloco `prisma`)

**Interfaces:**
- Consome: variáveis `DATABASE_URL`, `DIRECT_URL`, `EMAILS_AUTORIZADOS` do `.env.local`
- Produz: cliente `prisma` exportado de `@/server/db`; tabelas `Membro`, `Conta`, `Categoria`,
  `Lancamento`, `Parcela`, `Rateio`, `Fatura`, `Auditoria`

**Pré-requisito do usuário:** projeto criado no Neon e `.env.local` preenchido a partir do
`.env.example`. Sem isso esta tarefa não roda.

- [ ] **Passo 1: Instalar o Prisma**

```bash
npm install @prisma/client
npm install -D prisma tsx
npx prisma init --datasource-provider postgresql
```

- [ ] **Passo 2: Escrever o schema**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum TipoConta {
  CARTAO
  EXTERNA
}

enum MeioPagamento {
  PIX
  DEBITO
  BOLETO
  DINHEIRO
}

enum EscopoLancamento {
  PESSOAL
  CONJUNTO
}

enum OrigemValor {
  POR_PARCELA
  TOTAL
}

enum StatusFatura {
  ABERTA
  CONFERIDA
  TRAVADA
}

enum StatusReembolso {
  PENDENTE
  RECEBIDO
}

model Membro {
  id        String   @id @default(cuid())
  nome      String
  email     String   @unique
  cor       String
  ativo     Boolean  @default(true)
  criadoEm  DateTime @default(now())

  lancamentos Lancamento[]
  rateios     Rateio[]

  @@index([ativo])
}

model Conta {
  id             String    @id @default(cuid())
  nome           String
  tipo           TipoConta
  cor            String
  ativa          Boolean   @default(true)
  diaFechamento  Int?
  diaVencimento  Int?
  ordem          Int       @default(0)

  lancamentos Lancamento[]
  faturas     Fatura[]

  @@index([ativa, ordem])
}

model Categoria {
  id        String  @id @default(cuid())
  nome      String  @unique
  cor       String
  icone     String?
  arquivada Boolean @default(false)

  lancamentos Lancamento[]
}

model Lancamento {
  id              String            @id @default(cuid())
  descricao       String
  valorCentavos   Int
  origemValor     OrigemValor       @default(POR_PARCELA)
  dataCompra      String            // AAAA-MM-DD, sem fuso
  numeroParcelas  Int               @default(1)
  escopo          EscopoLancamento
  meioPagamento   MeioPagamento?
  devedorNome     String?
  statusReembolso StatusReembolso?
  versao          Int               @default(1)
  deletadoEm      DateTime?
  criadoEm        DateTime          @default(now())
  atualizadoEm    DateTime          @updatedAt

  contaId     String
  categoriaId String
  membroId    String?

  conta     Conta      @relation(fields: [contaId], references: [id])
  categoria Categoria  @relation(fields: [categoriaId], references: [id])
  membro    Membro?    @relation(fields: [membroId], references: [id])
  parcelas  Parcela[]
  rateios   Rateio[]

  @@index([deletadoEm])
  @@index([contaId, deletadoEm])
}

model Parcela {
  id            String  @id @default(cuid())
  numero        Int
  valorCentavos Int
  competencia   String  // AAAA-MM
  cancelada     Boolean @default(false)

  lancamentoId String
  lancamento   Lancamento @relation(fields: [lancamentoId], references: [id], onDelete: Cascade)

  @@unique([lancamentoId, numero])
  @@index([competencia, cancelada])
}

model Rateio {
  id         String @id @default(cuid())
  percentual Float

  lancamentoId String
  membroId     String
  lancamento   Lancamento @relation(fields: [lancamentoId], references: [id], onDelete: Cascade)
  membro       Membro     @relation(fields: [membroId], references: [id])

  @@unique([lancamentoId, membroId])
}

model Fatura {
  id                 String       @id @default(cuid())
  competencia        String       // AAAA-MM
  dataFechamento     String       // AAAA-MM-DD
  dataVencimento     String       // AAAA-MM-DD
  valorRealCentavos  Int?
  status             StatusFatura @default(ABERTA)
  travadaEm          DateTime?
  travadaPorMembroId String?

  contaId String
  conta   Conta  @relation(fields: [contaId], references: [id])

  @@unique([contaId, competencia])
}

model Auditoria {
  id         String   @id @default(cuid())
  tabela     String
  registroId String
  acao       String
  membroId   String?
  diff       Json
  criadoEm   DateTime @default(now())

  @@index([tabela, registroId])
  @@index([criadoEm])
}
```

Duas decisões visíveis aqui. `dataCompra` e `competencia` são `String`, não `DateTime` — é o
que garante que nenhuma camada aplique fuso e mova a compra do dia 04 para o dia 03. E
`Parcela` tem `onDelete: Cascade` no lançamento, mas isso só dispara em limpeza definitiva:
o caminho normal é `deletadoEm`.

- [ ] **Passo 3: Criar o cliente Prisma**

`src/server/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalParaPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalParaPrisma.prisma = prisma;
```

O singleton evita esgotar o pool de conexões no hot reload do `next dev`.

- [ ] **Passo 4: Rodar a migration**

```bash
npx prisma migrate dev --name modelo-inicial
```

Esperado: migration criada em `prisma/migrations/` e aplicada no Neon.

- [ ] **Passo 5: Escrever o seed**

`prisma/seed.ts`:

```ts
import { PrismaClient, TipoConta } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIAS = [
  { nome: 'Veículo', cor: '#1B7C90' },
  { nome: 'Compra Online', cor: '#A8710F' },
  { nome: 'Beleza', cor: '#9C4275' },
  { nome: 'Medicação', cor: '#4F7A16' },
  { nome: 'Presente', cor: '#B33A2B' },
  { nome: 'Assinatura', cor: '#5A4FCF' },
  { nome: 'Jogo', cor: '#2F6FB3' },
  { nome: 'Terceiros', cor: '#7A7A7A' },
];

const CORES_MEMBRO = ['#A8710F', '#9C4275'];

async function main() {
  const emails = (process.env.EMAILS_AUTORIZADOS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error('EMAILS_AUTORIZADOS vazio. Preencha .env.local antes de rodar o seed.');
  }

  for (const [indice, email] of emails.entries()) {
    const nomeDerivado = email.split('@')[0] ?? email;
    await prisma.membro.upsert({
      where: { email },
      update: {},
      create: {
        email,
        nome: nomeDerivado.charAt(0).toUpperCase() + nomeDerivado.slice(1),
        cor: CORES_MEMBRO[indice] ?? '#666666',
      },
    });
  }

  await prisma.conta.upsert({
    where: { id: 'conta-c6' },
    update: {},
    create: {
      id: 'conta-c6',
      nome: 'C6',
      tipo: TipoConta.CARTAO,
      cor: '#1B1B1B',
      diaFechamento: 4,
      diaVencimento: 10,
      ordem: 1,
    },
  });

  await prisma.conta.upsert({
    where: { id: 'conta-externa' },
    update: {},
    create: {
      id: 'conta-externa',
      nome: 'Externa',
      tipo: TipoConta.EXTERNA,
      cor: '#4F7A16',
      ordem: 2,
    },
  });

  for (const categoria of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome: categoria.nome },
      update: {},
      create: categoria,
    });
  }
}

main()
  .then(() => console.log('Seed concluido.'))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

O nome do membro é derivado do e-mail justamente para que **nenhum dado pessoal fique em
arquivo versionado** — depois vocês corrigem "Nick" e "Nardy" pela tela de configurações.

- [ ] **Passo 6: Registrar o seed no `package.json`**

```json
{
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "scripts": { "db:seed": "prisma db seed" }
}
```

- [ ] **Passo 7: Rodar o seed e conferir**

```bash
npm run db:seed
npx prisma studio
```

Esperado: dois membros, duas contas (C6 com fechamento 4 e vencimento 10, e Externa) e oito
categorias.

- [ ] **Passo 8: Commit (pedir autorização antes)**

```
Modela o banco e semeia contas, categorias e membros

Datas ficam como string AAAA-MM-DD no banco, para que nenhuma camada
aplique fuso e mova a compra do dia do fechamento. Os membros saem de
EMAILS_AUTORIZADOS, entao nenhum e-mail real fica versionado.
```

---

## Tarefa 8 — Autenticação com Google e allowlist

**Arquivos:**
- Criar: `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`,
  `src/middleware.ts`, `src/app/(auth)/entrar/page.tsx`
- Criar: `src/server/auth.test.ts`

**Interfaces:**
- Consome: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `EMAILS_AUTORIZADOS`
- Produz: `auth()`, `signIn()`, `signOut()` de `@/server/auth`;
  `emailAutorizado(email: string | null | undefined, lista: string): boolean`

**Pré-requisito do usuário:** credenciais OAuth criadas no Google Cloud Console, com os URIs
de redirecionamento que estão documentados no `.env.example`.

- [ ] **Passo 1: Escrever o teste da allowlist que falha**

A regra de autorização é pura e merece teste próprio, separado do Auth.js.

`src/server/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { emailAutorizado } from './auth-regras';

const LISTA = 'nardy@exemplo.com,nick@exemplo.com';

describe('emailAutorizado', () => {
  it('aceita e-mail que esta na lista', () => {
    expect(emailAutorizado('nick@exemplo.com', LISTA)).toBe(true);
  });

  it('ignora diferenca de caixa e espaco em volta', () => {
    expect(emailAutorizado('  NICK@Exemplo.com ', LISTA)).toBe(true);
    expect(emailAutorizado('nick@exemplo.com', ' nardy@exemplo.com , nick@exemplo.com ')).toBe(true);
  });

  it('recusa conta Google valida que nao esta na lista', () => {
    expect(emailAutorizado('estranho@gmail.com', LISTA)).toBe(false);
  });

  it('recusa quando nao ha e-mail', () => {
    expect(emailAutorizado(null, LISTA)).toBe(false);
    expect(emailAutorizado(undefined, LISTA)).toBe(false);
    expect(emailAutorizado('', LISTA)).toBe(false);
  });

  it('recusa todo mundo quando a lista esta vazia, em vez de liberar geral', () => {
    expect(emailAutorizado('nick@exemplo.com', '')).toBe(false);
    expect(emailAutorizado('nick@exemplo.com', '   ')).toBe(false);
  });
});
```

O último teste é o que importa: uma variável de ambiente esquecida não pode virar porta
aberta.

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/server/auth.test.ts
```

Esperado: FAIL, `Failed to resolve import "./auth-regras"`.

- [ ] **Passo 3: Implementar a regra**

`src/server/auth-regras.ts`:

```ts
/** Confere um e-mail contra a allowlist. Lista vazia recusa todo mundo. */
export function emailAutorizado(email: string | null | undefined, lista: string): boolean {
  if (!email) return false;

  const autorizados = lista
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (autorizados.length === 0) return false;

  return autorizados.includes(email.trim().toLowerCase());
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run src/server/auth.test.ts
```

Esperado: PASS, 5 testes.

- [ ] **Passo 5: Configurar o Auth.js**

```bash
npm install next-auth@beta
```

`src/server/auth.ts`:

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { emailAutorizado } from './auth-regras';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/entrar' },
  callbacks: {
    signIn({ profile }) {
      return emailAutorizado(profile?.email, process.env.EMAILS_AUTORIZADOS ?? '');
    },
  },
});
```

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
export { GET, POST } from '@/server/auth';
```

- [ ] **Passo 6: Proteger todas as rotas**

`src/middleware.ts`:

```ts
export { auth as middleware } from '@/server/auth';

export const config = {
  matcher: ['/((?!api/auth|entrar|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Passo 7: Criar a tela de login**

`src/app/(auth)/entrar/page.tsx`:

```tsx
import { signIn } from '@/server/auth';

export default function Entrar() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="mt-1 text-sm text-neutral-500">Acesso restrito.</p>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/despesas' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50"
          >
            Entrar com Google
          </button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Passo 8: Verificar na mão**

```bash
npm run dev
```

Confira, nesta ordem:

1. Abrir `http://localhost:3000/despesas` sem sessão redireciona para `/entrar`.
2. Entrar com um e-mail **da** allowlist leva a `/despesas`.
3. Entrar com um e-mail **fora** da allowlist é recusado e volta para `/entrar`.

O passo 3 é o que não pode falhar. Teste com uma conta Google que não seja de vocês.

- [ ] **Passo 9: Commit (pedir autorização antes)**

```
Restringe o acesso ao login Google com allowlist

A regra de autorizacao fica isolada e testada: lista vazia recusa todo
mundo, em vez de liberar geral quando a variavel de ambiente falta.
```

---

## Tarefa 9 — Gravação de lançamento com lock otimista

**Arquivos:**
- Criar: `src/server/repositorios/lancamento.ts`, `src/server/actions/lancamento.ts`
- Criar: `src/server/repositorios/lancamento.test.ts`

**Interfaces:**
- Consome: `prisma` de `@/server/db`; `gerarParcelas` de `@/domain/parcelamento`;
  `ratear`, `pesosMeioAMeio` de `@/domain/rateio`; `competenciaDeCartao`,
  `competenciaDeContaExterna` de `@/domain/competencia`
- Produz:
  - `criarLancamento(entrada: EntradaLancamento): Promise<{ id: string }>`
  - `editarLancamento(id: string, versao: number, entrada: EntradaLancamento): Promise<ResultadoGravacao>`
  - `excluirLancamento(id: string, versao: number): Promise<ResultadoGravacao>`
  - `type ResultadoGravacao = { ok: true } | { ok: false; motivo: 'CONFLITO' | 'FATURA_TRAVADA'; atual?: unknown }`

- [ ] **Passo 1: Escrever o teste do conflito de versão**

Este teste usa banco real, então roda separado dos testes de domínio. Adicione ao
`vitest.config.ts` um segundo projeto ou rode com `--dir`; o simples é um arquivo dedicado
que só roda quando `DATABASE_URL` existe.

`src/server/repositorios/lancamento.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarLancamento, editarLancamento } from './lancamento';

const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)('gravacao com lock otimista', () => {
  let categoriaId: string;
  let membroId: string;

  beforeEach(async () => {
    await prisma.parcela.deleteMany();
    await prisma.rateio.deleteMany();
    await prisma.lancamento.deleteMany();
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    membroId = (await prisma.membro.findFirstOrThrow()).id;
  });

  const entrada = () => ({
    descricao: 'loja online',
    valorCentavos: 2500,
    origemValor: 'POR_PARCELA' as const,
    dataCompra: '2026-08-01',
    numeroParcelas: 1,
    escopo: 'PESSOAL' as const,
    contaId: 'conta-c6',
    categoriaId,
    membroId,
  });

  it('grava e gera as parcelas na competencia certa', async () => {
    const { id } = await criarLancamento(entrada());
    const parcelas = await prisma.parcela.findMany({ where: { lancamentoId: id } });

    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]?.competencia).toBe('2026-08');
  });

  it('recusa a segunda gravacao concorrente em vez de sobrescrever', async () => {
    const { id } = await criarLancamento(entrada());

    // Duas pessoas carregaram a versao 1 ao mesmo tempo.
    const primeira = await editarLancamento(id, 1, { ...entrada(), descricao: 'loja online (Nick)' });
    const segunda = await editarLancamento(id, 1, { ...entrada(), descricao: 'loja online (Nardy)' });

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.descricao).toBe('loja online (Nick)');
    expect(salvo.versao).toBe(2);
  });

  it('recusa editar lancamento com parcela em fatura travada', async () => {
    const { id } = await criarLancamento(entrada());
    await prisma.fatura.create({
      data: {
        contaId: 'conta-c6',
        competencia: '2026-08',
        dataFechamento: '2026-08-04',
        dataVencimento: '2026-08-10',
        status: 'TRAVADA',
        travadaEm: new Date(),
      },
    });

    const resultado = await editarLancamento(id, 1, { ...entrada(), descricao: 'outro' });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('FATURA_TRAVADA');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/server/repositorios/lancamento.test.ts
```

Esperado: FAIL, `Failed to resolve import "./lancamento"`.

- [ ] **Passo 3: Implementar o repositório**

`src/server/repositorios/lancamento.ts`:

```ts
import { competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import { gerarParcelas } from '@/domain/parcelamento';
import { pesosMeioAMeio } from '@/domain/rateio';
import { prisma } from '../db';

export type EntradaLancamento = {
  descricao: string;
  valorCentavos: number;
  origemValor: 'POR_PARCELA' | 'TOTAL';
  dataCompra: string;
  numeroParcelas: number;
  escopo: 'PESSOAL' | 'CONJUNTO';
  contaId: string;
  categoriaId: string;
  membroId?: string;
  competenciaManual?: string;
};

export type ResultadoGravacao =
  | { ok: true }
  | { ok: false; motivo: 'CONFLITO' | 'FATURA_TRAVADA'; atual?: unknown };

async function competenciaBaseDe(entrada: EntradaLancamento): Promise<string> {
  if (entrada.competenciaManual) return entrada.competenciaManual;

  const conta = await prisma.conta.findUniqueOrThrow({ where: { id: entrada.contaId } });
  if (conta.tipo === 'CARTAO') {
    if (conta.diaFechamento === null) {
      throw new Error(`Conta de cartao sem dia de fechamento: ${conta.nome}`);
    }
    return competenciaDeCartao(entrada.dataCompra, conta.diaFechamento);
  }
  return competenciaDeContaExterna(entrada.dataCompra);
}

async function competenciasTravadas(lancamentoId: string): Promise<boolean> {
  const parcelas = await prisma.parcela.findMany({
    where: { lancamentoId },
    select: { competencia: true, lancamento: { select: { contaId: true } } },
  });
  if (parcelas.length === 0) return false;

  const travada = await prisma.fatura.findFirst({
    where: {
      status: 'TRAVADA',
      OR: parcelas.map((p) => ({
        contaId: p.lancamento.contaId,
        competencia: p.competencia,
      })),
    },
  });
  return travada !== null;
}

async function gravarFilhos(lancamentoId: string, entrada: EntradaLancamento): Promise<void> {
  const competenciaBase = await competenciaBaseDe(entrada);

  const parcelas = gerarParcelas({
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  });

  await prisma.parcela.deleteMany({ where: { lancamentoId } });
  await prisma.parcela.createMany({
    data: parcelas.map((p) => ({ ...p, lancamentoId })),
  });

  await prisma.rateio.deleteMany({ where: { lancamentoId } });
  if (entrada.escopo === 'CONJUNTO') {
    const membros = await prisma.membro.findMany({
      where: { ativo: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    // Gravamos apenas os percentuais. O valor de cada cota e calculado por
    // ratear() na leitura, sobre o valor DA PARCELA — ver Tarefa 10.
    const pesos = pesosMeioAMeio(membros.map((m) => m.id));
    await prisma.rateio.createMany({
      data: pesos.map((p) => ({ lancamentoId, membroId: p.membroId, percentual: p.percentual })),
    });
  }
}

export async function criarLancamento(entrada: EntradaLancamento): Promise<{ id: string }> {
  const lancamento = await prisma.lancamento.create({
    data: {
      descricao: entrada.descricao,
      valorCentavos: entrada.valorCentavos,
      origemValor: entrada.origemValor,
      dataCompra: entrada.dataCompra,
      numeroParcelas: entrada.numeroParcelas,
      escopo: entrada.escopo,
      contaId: entrada.contaId,
      categoriaId: entrada.categoriaId,
      membroId: entrada.escopo === 'PESSOAL' ? entrada.membroId : null,
    },
  });

  await gravarFilhos(lancamento.id, entrada);
  return { id: lancamento.id };
}

export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
): Promise<ResultadoGravacao> {
  if (await competenciasTravadas(id)) return { ok: false, motivo: 'FATURA_TRAVADA' };

  const alteradas = await prisma.lancamento.updateMany({
    where: { id, versao, deletadoEm: null },
    data: {
      descricao: entrada.descricao,
      valorCentavos: entrada.valorCentavos,
      origemValor: entrada.origemValor,
      dataCompra: entrada.dataCompra,
      numeroParcelas: entrada.numeroParcelas,
      escopo: entrada.escopo,
      contaId: entrada.contaId,
      categoriaId: entrada.categoriaId,
      membroId: entrada.escopo === 'PESSOAL' ? entrada.membroId : null,
      versao: { increment: 1 },
    },
  });

  if (alteradas.count === 0) {
    const atual = await prisma.lancamento.findUnique({ where: { id } });
    return { ok: false, motivo: 'CONFLITO', atual };
  }

  await gravarFilhos(id, entrada);
  return { ok: true };
}

export async function excluirLancamento(id: string, versao: number): Promise<ResultadoGravacao> {
  if (await competenciasTravadas(id)) return { ok: false, motivo: 'FATURA_TRAVADA' };

  const alteradas = await prisma.lancamento.updateMany({
    where: { id, versao, deletadoEm: null },
    data: { deletadoEm: new Date(), versao: { increment: 1 } },
  });

  if (alteradas.count === 0) {
    const atual = await prisma.lancamento.findUnique({ where: { id } });
    return { ok: false, motivo: 'CONFLITO', atual };
  }
  return { ok: true };
}
```

O `updateMany` com `where: { id, versao }` é o lock: se outra pessoa gravou no meio,
`count` volta zero e nada foi sobrescrito.

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run src/server/repositorios/lancamento.test.ts
```

Esperado: PASS, 3 testes.

- [ ] **Passo 5: Criar a server action com validação**

`src/server/actions/lancamento.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { criarLancamento, editarLancamento, excluirLancamento } from '../repositorios/lancamento';

const esquema = z.object({
  descricao: z.string().trim().min(1, 'Descrição obrigatória').max(120),
  valorCentavos: z.number().int('Valor deve ser inteiro em centavos'),
  origemValor: z.enum(['POR_PARCELA', 'TOTAL']),
  dataCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
  numeroParcelas: z.number().int().min(1).max(72),
  escopo: z.enum(['PESSOAL', 'CONJUNTO']),
  contaId: z.string().min(1),
  categoriaId: z.string().min(1),
  membroId: z.string().optional(),
  competenciaManual: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

async function exigirSessao() {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');
  return sessao;
}

export async function acaoCriarLancamento(dados: unknown) {
  await exigirSessao();
  const entrada = esquema.parse(dados);
  const resultado = await criarLancamento(entrada);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoEditarLancamento(id: string, versao: number, dados: unknown) {
  await exigirSessao();
  const entrada = esquema.parse(dados);
  const resultado = await editarLancamento(id, versao, entrada);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoExcluirLancamento(id: string, versao: number) {
  await exigirSessao();
  const resultado = await excluirLancamento(id, versao);
  revalidatePath('/despesas');
  return resultado;
}
```

Instale o Zod se ainda não estiver: `npm install zod`.

- [ ] **Passo 6: Commit (pedir autorização antes)**

```
Grava lancamentos com lock otimista e parcelas automaticas

O update usa WHERE versao para que duas pessoas conferindo a mesma fatura
nao sobrescrevam uma a outra em silencio. Edicao em fatura travada e
recusada com motivo proprio.
```

---

## Tarefa 10 — Tela de despesas: leitura da grade

**Arquivos:**
- Criar: `src/server/repositorios/resumo.ts`, `src/app/despesas/page.tsx`,
  `src/components/grade-lancamentos.tsx`, `src/components/chips-conta.tsx`

**Interfaces:**
- Consome: `calcularResumo` de `@/domain/totais`; `formatarBRL` de `@/domain/money`
- Produz:
  - `carregarParcelasDaCompetencia(competencia: string): Promise<ParcelaResumo[]>`
  - `carregarLinhasDaGrade(competencia: string, contaId?: string): Promise<LinhaGrade[]>`
  - `type LinhaGrade = { parcelaId: string; lancamentoId: string; versao: number; dataCompra: string; descricao: string; escopo: 'PESSOAL' | 'CONJUNTO'; membroNome: string | null; categoriaNome: string; numero: number; numeroParcelas: number; valorCentavos: number; contaNome: string; ehReembolso: boolean }`

- [ ] **Passo 1: Implementar a leitura**

`src/server/repositorios/resumo.ts`:

```ts
import { ratear } from '@/domain/rateio';
import type { ParcelaResumo } from '@/domain/totais';
import { prisma } from '../db';

export type LinhaGrade = {
  parcelaId: string;
  lancamentoId: string;
  versao: number;
  dataCompra: string;
  descricao: string;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroNome: string | null;
  categoriaNome: string;
  numero: number;
  numeroParcelas: number;
  valorCentavos: number;
  contaNome: string;
  ehReembolso: boolean;
};

const PARCELA_VISIVEL = { cancelada: false, lancamento: { deletadoEm: null } };

export async function carregarParcelasDaCompetencia(
  competencia: string,
): Promise<ParcelaResumo[]> {
  const parcelas = await prisma.parcela.findMany({
    where: { competencia, ...PARCELA_VISIVEL },
    include: {
      lancamento: {
        select: {
          contaId: true,
          escopo: true,
          membroId: true,
          rateios: { select: { membroId: true, percentual: true } },
        },
      },
    },
  });

  return parcelas.map((p) => {
    const { lancamento } = p;
    if (lancamento.escopo === 'PESSOAL') {
      return {
        contaId: lancamento.contaId,
        escopo: 'PESSOAL' as const,
        membroId: lancamento.membroId ?? undefined,
        valorCentavos: p.valorCentavos,
      };
    }
    // O rateio e calculado sobre o valor DA PARCELA, nao do lancamento: um
    // parcelado de conjunto rateia 101,01 por mes, nao o total da compra.
    return {
      contaId: lancamento.contaId,
      escopo: 'CONJUNTO' as const,
      valorCentavos: p.valorCentavos,
      cotas: ratear(p.valorCentavos, lancamento.rateios),
    };
  });
}

export async function carregarLinhasDaGrade(
  competencia: string,
  contaId?: string,
): Promise<LinhaGrade[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      competencia,
      ...PARCELA_VISIVEL,
      ...(contaId ? { lancamento: { contaId, deletadoEm: null } } : {}),
    },
    include: {
      lancamento: {
        include: {
          membro: { select: { nome: true } },
          categoria: { select: { nome: true } },
          conta: { select: { nome: true } },
        },
      },
    },
    orderBy: [{ lancamento: { dataCompra: 'asc' } }, { numero: 'asc' }],
  });

  return parcelas.map((p) => ({
    parcelaId: p.id,
    lancamentoId: p.lancamentoId,
    versao: p.lancamento.versao,
    dataCompra: p.lancamento.dataCompra,
    descricao: p.lancamento.descricao,
    escopo: p.lancamento.escopo,
    membroNome: p.lancamento.membro?.nome ?? null,
    categoriaNome: p.lancamento.categoria.nome,
    numero: p.numero,
    numeroParcelas: p.lancamento.numeroParcelas,
    valorCentavos: p.valorCentavos,
    contaNome: p.lancamento.conta.nome,
    ehReembolso: p.lancamento.statusReembolso !== null,
  }));
}
```

O comentário no meio da função é o ponto que não pode ser perdido: o rateio é calculado sobre
o valor da parcela, não do lançamento. Sem isso, um parcelado de conjunto rateia o total
inteiro da compra em todo mês, e a linha `METADE` fica errada por meses seguidos.

- [ ] **Passo 2: Escrever a grade**

`src/components/grade-lancamentos.tsx`:

```tsx
import { formatarBRL } from '@/domain/money';
import type { LinhaGrade } from '@/server/repositorios/resumo';

const CABECALHOS = ['Data', 'Descrição', 'De quem', 'Categoria', 'Parc.', 'Valor'];

function rotuloParcela(linha: LinhaGrade): string {
  return linha.numeroParcelas > 1 ? `${linha.numero}/${linha.numeroParcelas}` : '—';
}

function deQuem(linha: LinhaGrade): string {
  return linha.escopo === 'CONJUNTO' ? 'Conjunto' : (linha.membroNome ?? '—');
}

export function GradeLancamentos({ linhas }: { linhas: LinhaGrade[] }) {
  if (linhas.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        Nenhum lançamento nesta competência.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
            {CABECALHOS.map((c) => (
              <th key={c} className={c === 'Valor' ? 'px-3 py-2 text-right' : 'px-3 py-2 text-left'}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.parcelaId} className="border-b last:border-0">
              <td className="px-3 py-1.5">{linha.dataCompra.slice(8, 10)}/{linha.dataCompra.slice(5, 7)}</td>
              <td className="px-3 py-1.5">
                {linha.descricao}
                {linha.ehReembolso && <span className="ml-2 text-xs text-amber-700">a receber</span>}
              </td>
              <td className="px-3 py-1.5">{deQuem(linha)}</td>
              <td className="px-3 py-1.5 text-neutral-600">{linha.categoriaNome}</td>
              <td className="px-3 py-1.5 text-neutral-600">{rotuloParcela(linha)}</td>
              <td className="px-3 py-1.5 text-right">{formatarBRL(linha.valorCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Passo 3: Montar a página com os chips de conta**

`src/app/despesas/page.tsx`:

```tsx
import { GradeLancamentos } from '@/components/grade-lancamentos';
import { prisma } from '@/server/db';
import { carregarLinhasDaGrade } from '@/server/repositorios/resumo';

type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

function competenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;

  const [contas, linhas] = await Promise.all([
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    carregarLinhasDaGrade(competencia, conta),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-semibold">Despesas · {competencia}</h1>

      <nav className="mt-4 flex gap-2">
        <a
          href={`/despesas?competencia=${competencia}`}
          className={`rounded-full border px-3 py-1 text-sm ${!conta ? 'bg-neutral-900 text-white' : ''}`}
        >
          Todos
        </a>
        {contas.map((c) => (
          <a
            key={c.id}
            href={`/despesas?competencia=${competencia}&conta=${c.id}`}
            className={`rounded-full border px-3 py-1 text-sm ${conta === c.id ? 'bg-neutral-900 text-white' : ''}`}
          >
            {c.nome}
          </a>
        ))}
      </nav>

      <div className="mt-4 rounded-md border">
        <GradeLancamentos linhas={linhas} />
      </div>
    </main>
  );
}
```

`competenciaAtual()` usa `Date` de propósito — é fronteira de aplicação, não domínio. Nenhuma
regra de cálculo depende dela.

- [ ] **Passo 4: Verificar na mão**

Crie dois ou três lançamentos pelo `npx prisma studio` e confira em
`http://localhost:3000/despesas`:

1. A grade lista as parcelas da competência, ordenadas por data.
2. Clicar num chip filtra por conta; "Todos" volta a mostrar tudo.
3. Mês sem lançamento mostra a mensagem vazia, não uma tabela quebrada.

- [ ] **Passo 5: Commit (pedir autorização antes)**

```
Lista as parcelas do mes com filtro por conta

A grade mostra parcela, nunca lancamento, que e o que faz um parcelado
aparecer uma vez por mes. O rateio do conjunto e calculado sobre o valor
da parcela.
```

---

## Tarefa 11 — Digitação inline na grade

**Arquivos:**
- Criar: `src/components/linha-nova.tsx`
- Modificar: `src/app/despesas/page.tsx` (incluir o formulário abaixo da grade)

**Interfaces:**
- Consome: `acaoCriarLancamento` de `@/server/actions/lancamento`;
  `reaisParaCentavos` de `@/domain/money`
- Produz: componente `<LinhaNova contas categorias membros competencia />`

- [ ] **Passo 1: Escrever o componente**

`src/components/linha-nova.tsx`:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { reaisParaCentavos } from '@/domain/money';
import { acaoCriarLancamento } from '@/server/actions/lancamento';

type Opcao = { id: string; nome: string };

type Props = {
  contas: Opcao[];
  categorias: Opcao[];
  membros: Opcao[];
};

export function LinhaNova({ contas, categorias, membros }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const primeiroCampo = useRef<HTMLInputElement>(null);

  function enviar(dados: FormData) {
    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valor') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    const escopo = String(dados.get('escopo'));
    iniciar(async () => {
      try {
        await acaoCriarLancamento({
          descricao: String(dados.get('descricao') ?? ''),
          valorCentavos,
          origemValor: 'POR_PARCELA',
          dataCompra: String(dados.get('dataCompra') ?? ''),
          numeroParcelas: Number(dados.get('numeroParcelas') ?? 1),
          escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
          contaId: String(dados.get('contaId') ?? ''),
          categoriaId: String(dados.get('categoriaId') ?? ''),
          ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
        });
        primeiroCampo.current?.form?.reset();
        primeiroCampo.current?.focus();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 border-t bg-neutral-50 p-2">
      <input ref={primeiroCampo} name="dataCompra" type="date" required className="rounded border px-2 py-1 text-sm" />
      <input name="descricao" placeholder="Descrição" required className="min-w-40 flex-1 rounded border px-2 py-1 text-sm" />
      <select name="escopo" required className="rounded border px-2 py-1 text-sm">
        {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        <option value="CONJUNTO">Conjunto</option>
      </select>
      <select name="categoriaId" required className="rounded border px-2 py-1 text-sm">
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <select name="contaId" required className="rounded border px-2 py-1 text-sm">
        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input name="numeroParcelas" type="number" min={1} max={72} defaultValue={1} className="w-16 rounded border px-2 py-1 text-sm" />
      <input name="valor" placeholder="0,00" required inputMode="decimal" className="w-28 rounded border px-2 py-1 text-right text-sm tabular-nums" />
      <button type="submit" disabled={pendente} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50">
        {pendente ? 'Salvando…' : 'Adicionar'}
      </button>
      {erro && <p role="alert" className="w-full text-sm text-red-700">{erro}</p>}
    </form>
  );
}
```

O `reset()` seguido de `focus()` no primeiro campo é o que faz a digitação em sequência
funcionar: salvou, o cursor já está pronto para a próxima linha.

- [ ] **Passo 2: Ligar na página**

Em `src/app/despesas/page.tsx`, carregue categorias e membros junto das contas e renderize
`<LinhaNova contas={contas} categorias={categorias} membros={membros} />` logo abaixo de
`<GradeLancamentos />`, dentro da mesma `div` com borda.

- [ ] **Passo 3: Escrever o teste de fluxo com Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

`e2e/lancar-parcelado.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('lanca uma compra parcelada e ela aparece nos meses seguintes', async ({ page }) => {
  await page.goto('/despesas?competencia=2026-08');

  await page.getByPlaceholder('Descrição').fill('fone bluetooth');
  await page.locator('input[name="dataCompra"]').fill('2026-08-01');
  await page.locator('input[name="numeroParcelas"]').fill('5');
  await page.getByPlaceholder('0,00').fill('327,87');
  await page.getByRole('button', { name: 'Adicionar' }).click();

  await expect(page.getByText('fone bluetooth')).toBeVisible();
  await expect(page.getByText('1/5')).toBeVisible();

  await page.goto('/despesas?competencia=2026-12');
  await expect(page.getByText('fone bluetooth')).toBeVisible();
  await expect(page.getByText('5/5')).toBeVisible();
});
```

Esse é o teste que prova a dor principal resolvida: lançar uma vez, aparecer nos cinco meses.

- [ ] **Passo 4: Rodar**

```bash
npx playwright test
```

Esperado: PASS. Se falhar por sessão, configure `storageState` com um login autenticado.

- [ ] **Passo 5: Commit (pedir autorização antes)**

```
Permite lancar despesas direto na grade do mes

Salvar limpa o formulario e devolve o foco ao primeiro campo, para a
fatura inteira ser digitada em sequencia.
```

---

## Tarefa 12 — Tela de resumo: a matriz

**Arquivos:**
- Criar: `src/app/resumo/page.tsx`, `src/components/matriz-resumo.tsx`

**Interfaces:**
- Consome: `calcularResumo`, `COLUNA_TOTAL` de `@/domain/totais`;
  `carregarParcelasDaCompetencia` de `@/server/repositorios/resumo`
- Produz: página `/resumo`

- [ ] **Passo 1: Escrever o componente da matriz**

`src/components/matriz-resumo.tsx`:

```tsx
import { formatarBRL } from '@/domain/money';
import { COLUNA_TOTAL, type ResumoMes } from '@/domain/totais';

type Props = {
  resumo: ResumoMes;
  nomesDeConta: Record<string, string>;
  nomesDeMembro: Record<string, string>;
  membroIds: string[];
};

export function MatrizResumo({ resumo, nomesDeConta, nomesDeMembro, membroIds }: Props) {
  const colunas = [...resumo.contas, COLUNA_TOTAL];

  const linhas: { rotulo: string; valores: Record<string, number>; forte?: boolean }[] = [
    ...membroIds.map((id) => ({
      rotulo: nomesDeMembro[id] ?? id,
      valores: resumo.pessoal[id] ?? {},
    })),
    { rotulo: 'Conjunto', valores: resumo.conjunto },
    ...membroIds.map((id) => ({
      rotulo: `Metade · ${nomesDeMembro[id] ?? id}`,
      valores: resumo.metade[id] ?? {},
    })),
    ...membroIds.map((id) => ({
      rotulo: `${nomesDeMembro[id] ?? id} total`,
      valores: resumo.totalGeral[id] ?? {},
      forte: true,
    })),
    { rotulo: 'Somado', valores: resumo.somado, forte: true },
  ];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2 text-left">&nbsp;</th>
            {colunas.map((coluna) => (
              <th key={coluna} className="px-3 py-2 text-right">
                {coluna === COLUNA_TOTAL ? 'Total' : (nomesDeConta[coluna] ?? coluna)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.rotulo} className={`border-b last:border-0 ${linha.forte ? 'font-semibold' : ''}`}>
              <td className="px-3 py-1.5 text-left">{linha.rotulo}</td>
              {colunas.map((coluna) => (
                <td key={coluna} className="px-3 py-1.5 text-right">
                  {formatarBRL(linha.valores[coluna] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Passo 2: Montar a página**

`src/app/resumo/page.tsx`:

```tsx
import { MatrizResumo } from '@/components/matriz-resumo';
import { calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';

type Props = { searchParams: Promise<{ competencia?: string }> };

function competenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export default async function Resumo({ searchParams }: Props) {
  const { competencia = competenciaAtual() } = await searchParams;

  const [membros, contas, parcelas] = await Promise.all([
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    carregarParcelasDaCompetencia(competencia),
  ]);

  const membroIds = membros.map((m) => m.id);
  const resumo = calcularResumo(parcelas, membroIds, contas.map((c) => c.id));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Resumo · {competencia}</h1>
      <MatrizResumo
        resumo={resumo}
        membroIds={membroIds}
        nomesDeConta={Object.fromEntries(contas.map((c) => [c.id, c.nome]))}
        nomesDeMembro={Object.fromEntries(membros.map((m) => [m.id, m.nome]))}
      />
    </main>
  );
}
```

- [ ] **Passo 3: Verificar contra a planilha**

Com os lançamentos de agosto carregados, `/resumo?competencia=2026-08` precisa mostrar
`R$ 423,75`, `R$ 500,75`, `R$ 101,01`, `R$ 50,50`, `R$ 474,25`, `R$ 551,26` e
`R$ 1.025,51` na coluna do C6. **Se algum número divergir, o bug é de leitura, não de
cálculo** — a Tarefa 6 já provou o cálculo.

- [ ] **Passo 4: Commit (pedir autorização antes)**

```
Mostra a matriz de totais de pessoas por contas

Uma coluna por conta mais uma de total, para "quanto o Nick gastou no mes
inteiro" ser leitura horizontal e "quanto essa conta somou" ser vertical.
```

---

## Tarefa 13 — Fatura e conferência contra o extrato

**Arquivos:**
- Criar: `src/domain/conferencia.ts`, `src/domain/conferencia.test.ts`
- Criar: `src/server/repositorios/fatura.ts`, `src/server/actions/fatura.ts`
- Modificar: `src/app/resumo/page.tsx` (bloco de conferência por conta de cartão)

**Interfaces:**
- Consome: `Centavos` de `@/domain/money`
- Produz:
  - `type Conferencia = { somado: Centavos; real: Centavos | null; diferenca: Centavos | null; situacao: 'SEM_EXTRATO' | 'BATE' | 'FALTA_LANCAR' | 'SOBRA_LANCAMENTO' }`
  - `conferir(somado: Centavos, real: Centavos | null): Conferencia`
  - `registrarValorReal(contaId: string, competencia: string, valorCentavos: number): Promise<void>`

- [ ] **Passo 1: Escrever o teste que falha**

`src/domain/conferencia.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conferir } from './conferencia';

describe('conferir', () => {
  it('nao opina quando o extrato ainda nao foi informado', () => {
    expect(conferir(102551, null)).toEqual({
      somado: 102551,
      real: null,
      diferenca: null,
      situacao: 'SEM_EXTRATO',
    });
  });

  it('reconhece o mes que fecha exato', () => {
    const resultado = conferir(102551, 102551);
    expect(resultado.diferenca).toBe(0);
    expect(resultado.situacao).toBe('BATE');
  });

  it('aponta que falta lancar quando o extrato e maior', () => {
    const resultado = conferir(250000, 102551);
    expect(resultado.diferenca).toBe(6062);
    expect(resultado.situacao).toBe('FALTA_LANCAR');
  });

  it('aponta lancamento sobrando quando o extrato e menor', () => {
    const resultado = conferir(102551, 250000);
    expect(resultado.diferenca).toBe(-6062);
    expect(resultado.situacao).toBe('SOBRA_LANCAMENTO');
  });

  it('lida com estorno que deixa a fatura negativa', () => {
    const resultado = conferir(-5000, -5000);
    expect(resultado.situacao).toBe('BATE');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run src/domain/conferencia.test.ts
```

Esperado: FAIL, `Failed to resolve import "./conferencia"`.

- [ ] **Passo 3: Implementar**

`src/domain/conferencia.ts`:

```ts
import type { Centavos } from './money';

export type SituacaoConferencia = 'SEM_EXTRATO' | 'BATE' | 'FALTA_LANCAR' | 'SOBRA_LANCAMENTO';

export type Conferencia = {
  somado: Centavos;
  real: Centavos | null;
  diferenca: Centavos | null;
  situacao: SituacaoConferencia;
};

/** Compara o que o sistema somou com o valor real do extrato. */
export function conferir(somado: Centavos, real: Centavos | null): Conferencia {
  if (real === null) {
    return { somado, real: null, diferenca: null, situacao: 'SEM_EXTRATO' };
  }

  const diferenca = real - somado;
  const situacao: SituacaoConferencia =
    diferenca === 0 ? 'BATE' : diferenca > 0 ? 'FALTA_LANCAR' : 'SOBRA_LANCAMENTO';

  return { somado, real, diferenca, situacao };
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS.

- [ ] **Passo 5: Persistir o valor real**

`src/server/repositorios/fatura.ts`:

```ts
import { prisma } from '../db';

function diaNaCompetencia(competencia: string, dia: number): string {
  return `${competencia}-${String(dia).padStart(2, '0')}`;
}

export async function registrarValorReal(
  contaId: string,
  competencia: string,
  valorCentavos: number,
): Promise<void> {
  const conta = await prisma.conta.findUniqueOrThrow({ where: { id: contaId } });
  if (conta.tipo !== 'CARTAO') throw new Error('Conferencia so existe em conta de cartao');
  if (conta.diaFechamento === null || conta.diaVencimento === null) {
    throw new Error(`Conta de cartao sem fechamento ou vencimento: ${conta.nome}`);
  }

  await prisma.fatura.upsert({
    where: { contaId_competencia: { contaId, competencia } },
    update: { valorRealCentavos: valorCentavos },
    create: {
      contaId,
      competencia,
      valorRealCentavos: valorCentavos,
      dataFechamento: diaNaCompetencia(competencia, conta.diaFechamento),
      dataVencimento: diaNaCompetencia(competencia, conta.diaVencimento),
    },
  });
}

export async function carregarValorReal(
  contaId: string,
  competencia: string,
): Promise<number | null> {
  const fatura = await prisma.fatura.findUnique({
    where: { contaId_competencia: { contaId, competencia } },
  });
  return fatura?.valorRealCentavos ?? null;
}
```

`src/server/actions/fatura.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { registrarValorReal } from '../repositorios/fatura';

const esquema = z.object({
  contaId: z.string().min(1),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  valorCentavos: z.number().int(),
});

export async function acaoRegistrarValorReal(dados: unknown) {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');

  const { contaId, competencia, valorCentavos } = esquema.parse(dados);
  await registrarValorReal(contaId, competencia, valorCentavos);
  revalidatePath('/resumo');
}
```

- [ ] **Passo 6: Mostrar a conferência no resumo**

Em `src/app/resumo/page.tsx`, para cada conta de tipo `CARTAO`, carregue o valor real e
renderize abaixo da matriz:

```tsx
{contas
  .filter((c) => c.tipo === 'CARTAO')
  .map((c) => {
    const resultado = conferir(resumo.somado[c.id] ?? 0, valoresReais[c.id] ?? null);
    return (
      <p key={c.id} className="mt-3 text-sm">
        <strong>{c.nome}</strong>{' '}
        {resultado.situacao === 'SEM_EXTRATO' && 'aguardando o valor do extrato.'}
        {resultado.situacao === 'BATE' && 'bate com o extrato.'}
        {resultado.situacao === 'FALTA_LANCAR' &&
          `falta lançar ${formatarBRL(resultado.diferenca ?? 0)}.`}
        {resultado.situacao === 'SOBRA_LANCAMENTO' &&
          `tem ${formatarBRL(Math.abs(resultado.diferenca ?? 0))} a mais que o extrato.`}
      </p>
    );
  })}
```

- [ ] **Passo 7: Commit (pedir autorização antes)**

```
Confere a fatura contra o valor real do extrato

A conferencia so aponta a diferenca; corrigir e trabalho de quem confere.
Diferenca positiva significa lancamento faltando.
```

---

## Tarefa 14 — Importação da planilha

**Arquivos:**
- Criar: `scripts/importar-planilha.ts`, `scripts/importar-planilha.test.ts`

**Interfaces:**
- Consome: `reaisParaCentavos` de `@/domain/money`; `criarLancamento` do repositório
- Produz: `interpretarLinha(colunas: string[]): LinhaPlanilha | null`;
  `type LinhaPlanilha = { descricao: string; valorCentavos: number; parcelaAtual: number; totalParcelas: number; categoria: string }`

- [ ] **Passo 1: Escrever o teste da interpretação**

O parsing é puro e é onde a importação erra. Testado sozinho, sem banco.

`scripts/importar-planilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { interpretarLinha } from './importar-planilha';

describe('interpretarLinha', () => {
  it('interpreta uma linha parcelada', () => {
    expect(interpretarLinha(['aparelho', 'R$100,00', '6/12', 'Terceiros'])).toEqual({
      descricao: 'aparelho',
      valorCentavos: 10000,
      parcelaAtual: 6,
      totalParcelas: 12,
      categoria: 'Terceiros',
    });
  });

  it('interpreta uma linha a vista, sem parcela', () => {
    expect(interpretarLinha(['google', 'R$88,00', '', 'Assinatura'])).toEqual({
      descricao: 'google',
      valorCentavos: 8800,
      parcelaAtual: 1,
      totalParcelas: 1,
      categoria: 'Assinatura',
    });
  });

  it('interpreta valor com separador de milhar', () => {
    const linha = interpretarLinha(['moto', 'R$432,10', '2/12', 'Veículo']);
    expect(linha?.valorCentavos).toBe(43210);
    expect(linha?.totalParcelas).toBe(12);
  });

  it('ignora linha vazia da planilha', () => {
    expect(interpretarLinha(['', '', '', ''])).toBeNull();
    expect(interpretarLinha([])).toBeNull();
  });

  it('ignora as linhas de total', () => {
    expect(interpretarLinha(['TOTAL:', 'R$423,75', '', ''])).toBeNull();
    expect(interpretarLinha(['TOTAL GERAL:', 'R$474,25', '', ''])).toBeNull();
    expect(interpretarLinha(['FATURA:', 'R$1.025,51', '', ''])).toBeNull();
  });

  it('recusa parcela mal formada em vez de adivinhar', () => {
    expect(() => interpretarLinha(['x', 'R$10,00', '6-12', 'Jogo'])).toThrow('Parcela invalida');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: FAIL, `Failed to resolve import "./importar-planilha"`.

- [ ] **Passo 3: Implementar a interpretação**

`scripts/importar-planilha.ts`:

```ts
import { reaisParaCentavos } from '@/domain/money';

export type LinhaPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
};

const ROTULOS_DE_TOTAL = ['total:', 'total geral:', 'fatura:', 'metade:'];
const PARCELA = /^(\d+)\/(\d+)$/;

/** Interpreta uma linha do CSV da aba do mes. Devolve null para linha que nao e lancamento. */
export function interpretarLinha(colunas: string[]): LinhaPlanilha | null {
  const [descricaoBruta = '', valorBruto = '', parcelaBruta = '', categoria = ''] = colunas;
  const descricao = descricaoBruta.trim();

  if (descricao === '' || valorBruto.trim() === '') return null;
  if (ROTULOS_DE_TOTAL.includes(descricao.toLowerCase())) return null;

  const parcela = parcelaBruta.trim();
  let parcelaAtual = 1;
  let totalParcelas = 1;

  if (parcela !== '') {
    const casou = PARCELA.exec(parcela);
    if (!casou) throw new Error(`Parcela invalida: ${parcela}`);
    parcelaAtual = Number(casou[1]);
    totalParcelas = Number(casou[2]);
  }

  return {
    descricao,
    valorCentavos: reaisParaCentavos(valorBruto),
    parcelaAtual,
    totalParcelas,
    categoria: categoria.trim(),
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
npx vitest run scripts/importar-planilha.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Passo 5: Escrever a rotina de importação**

Acrescente ao mesmo arquivo uma função `importar(caminhoCsv, competencia, contaId)` que:

1. lê o CSV com `node:fs`, separando por bloco de pessoa (Nardy, Nick, Conjunto);
2. chama `interpretarLinha` em cada linha, pulando os `null`;
3. converte `parcelaAtual`/`totalParcelas` na competência base — a competência da parcela 1 é
   `avancarCompetencia(competencia, -(parcelaAtual - 1))`;
4. chama `criarLancamento` com `origemValor: 'POR_PARCELA'`;
5. ao final, imprime a soma importada por bloco.

A conferência é o total: se a soma não bater com o `FATURA` da planilha, **apague tudo e
refaça**, não corrija na mão.

- [ ] **Passo 6: Rodar contra a aba real**

```bash
npx tsx scripts/importar-planilha.ts ./dados-privados/agosto.csv 2026-08 conta-c6
```

Esperado: soma impressa igual a `R$ 1.025,51`, e `/resumo?competencia=2026-08` reproduzindo
os sete números da planilha.

O arquivo fica em `/dados-privados/`, que está no `.gitignore`. **Não versione o CSV.**

- [ ] **Passo 7: Commit (pedir autorização antes)**

```
Importa o mes corrente e as parcelas em aberto da planilha

Script de uso unico. A interpretacao da linha e testada sozinha, porque e
onde a importacao erra; a conferencia final e o total bater com a fatura.
```

---

## Auto-revisão do plano

**Cobertura da spec (Fase 1).** Auth e allowlist: Tarefa 8. Cadastros de conta e categoria:
Tarefa 7 via seed — a tela de configurações para criar e editar categorias **não está na
Fase 1** e precisa ser feita antes do primeiro mês em que vocês quiserem uma categoria nova;
até lá o `prisma studio` resolve. Grade do mês no layout B: Tarefas 10 e 11. Parcelamento:
Tarefa 4. Rateio: Tarefa 5. Totais: Tarefas 6 e 12. Estornos: cobertos por Tarefas 4, 5 e 6
(valor negativo aceito, parcelamento recusado) e visíveis na grade sem tela própria. Contas
externas: Tarefas 3, 7 e 10. Faturas com conferência: Tarefa 13. Lock otimista: Tarefa 9.
Importação: Tarefa 14.

**Lacuna conhecida e assumida:** a UI de conflito de edição simultânea. O repositório devolve
`{ ok: false, motivo: 'CONFLITO', atual }` (Tarefa 9) e a action propaga, mas nenhuma tela da
Fase 1 desenha o comparativo — hoje o erro apenas aparece como mensagem. A proteção contra
sobrescrita existe desde a Fase 1, que era o objetivo; a tela de resolução fica para a Fase 3
junto do histórico de alterações.

**Consistência de tipos.** `Centavos` (Tarefa 2) atravessa tudo. `Competencia` (Tarefa 3) é
consumida por `gerarParcelas` (4) e pelos repositórios (9, 10, 13). `Cota` (5) é produzida
por `ratear` e consumida por `ParcelaResumo.cotas` (6). `ParcelaResumo` (6) é produzida por
`carregarParcelasDaCompetencia` (10) e consumida por `calcularResumo` (12). `LinhaGrade` (10)
é consumida por `GradeLancamentos` (10) e `LinhaNova` (11). `Conferencia` (13) é consumida
pela página de resumo.

---

## Depois da Fase 1

Fases 2 e 3 continuam como estão descritas na
[spec](../specs/2026-08-08-sistema-despesas-casal-design.md#9-fases-de-entrega) e ganham plano
detalhado só quando a Fase 1 estiver rodando com dados reais. Escrever agora os passos de
telas que dependem de como vocês realmente usarem a grade seria adivinhação cara: metade das
decisões de layout A, de recorrentes e de busca vai mudar depois do primeiro fechamento de
mês de verdade.

Antes de começar a Fase 2, revisite os **15 pontos `[a confirmar]`** de
[`docs/regras-de-negocio.md`](../regras-de-negocio.md) — vários deles ficam óbvios depois
de um mês de uso.
