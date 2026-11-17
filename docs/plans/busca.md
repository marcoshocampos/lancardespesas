# Busca de lançamentos — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os
> passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** uma barra de busca no Despesas que acha lançamentos de todos os meses por texto
(descrição e nome do terceiro, sem acento nem caixa) ou por valor exato (parcela ou total), e
leva ao mês com a linha destacada.

**Arquitetura:** a regra inteira é pura, em `src/domain/busca.ts`. O repositório carrega os
lançamentos não excluídos e filtra em memória com ela — sem `ILIKE`, que não ignora acento, e
sem migration. A página do Despesas lê `?q=` e, com termo, troca recorrentes, chips e grade pela
lista de resultados; `?destaque=` desce até a linha da grade, que realça e rola.

**Stack:** Next.js 16 App Router (Server Components, `next/form`), React 19, TypeScript estrito
(`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Prisma 6, Vitest, Tailwind 4.

**Desenho:** [`docs/specs/2026-11-17-busca-design.md`](../specs/2026-11-17-busca-design.md).
Leia antes de começar; este plano diz **como**, o desenho diz **o quê** e **por quê**.

## Restrições globais

- Dinheiro é `number` inteiro em centavos. Nenhum `float`, nunca.
- `src/domain/` é puro: nada de Prisma, `fetch`, `Date.now()` ou `new Date()` ali.
- Identificadores de domínio em português sem acento (`busca`, `competencia`, `lancamento`);
  termos técnicos em inglês. Comentários e textos de tela em português — **textos de tela com
  acento**, comentários de código sem acento (convenção do repositório).
- `exactOptionalPropertyTypes` está ligado: prop opcional que pode receber `undefined` se
  declara `campo?: T | undefined`.
- **Sem migration.** O schema não muda.
- Testes de banco **só** por `npm run test:banco`. **Nunca** ligue `TESTE_DESTRUTIVO=1` à mão.
- Commits em português, no imperativo, explicando o porquê, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Na branch de trabalho os commits
  por tarefa estão liberados; **merge na `main` e push só com a palavra do usuário**.
- `git` só pela ferramenta Bash (não está no PATH do PowerShell nesta máquina).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/domain/busca.ts` | criar | Normalizar texto, interpretar o termo, decidir correspondência, escolher o mês de destino |
| `src/domain/busca.test.ts` | criar | Os casos de borda da regra |
| `src/server/repositorios/busca.ts` | criar | `buscarLancamentos`: lê, filtra com o domínio, ordena, corta |
| `src/server/repositorios/busca.test.ts` | criar | Testes de banco do repositório |
| `src/components/despesas/barra-busca.tsx` | criar | O formulário da busca |
| `src/components/despesas/resultados-busca.tsx` | criar | A lista de resultados |
| `src/app/(app)/despesas/page.tsx` | modificar | Lê `q` e `destaque`, escolhe entre grade e resultados |
| `src/components/despesas/grade-lancamentos.tsx` | modificar | Repassa `destaque` |
| `src/components/despesas/secao-pessoa.tsx` | modificar | Realça e rola a linha destacada |
| `docs/*`, `CLAUDE.md`, `README.md` | modificar | Regra, decisão, arquitetura, estado, roteiro, correções de texto |

---

### Tarefa 1: A regra da busca, pura

**Arquivos:**
- Criar: `src/domain/busca.ts`
- Teste: `src/domain/busca.test.ts`

**Interfaces:**
- Consome: `reaisParaCentavos`, `Centavos` de `./money`; `Competencia`, `compararCompetencias`
  de `./competencia`.
- Produz:
  - `type Busca = { palavras: string[]; centavos: Centavos | null }`
  - `type CandidatoDaBusca = { descricao: string; devedorNome: string | null; parcelas: readonly { valorCentavos: number; cancelada: boolean }[] }`
  - `normalizarTexto(texto: string): string`
  - `interpretarBusca(termo: string): Busca | null` — `null` quer dizer "não busque"
  - `correspondeABusca(busca: Busca, candidato: CandidatoDaBusca): boolean`
  - `competenciaDeDestino(competenciasAtivas: readonly Competencia[], origem: Competencia): Competencia | null`

- [ ] **Passo 1: Escrever os testes que falham**

Criar `src/domain/busca.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  competenciaDeDestino,
  correspondeABusca,
  interpretarBusca,
  normalizarTexto,
  type CandidatoDaBusca,
} from './busca';

const candidato = (extras: Partial<CandidatoDaBusca> = {}): CandidatoDaBusca => ({
  descricao: 'Farmácia São João',
  devedorNome: null,
  parcelas: [{ valorCentavos: 4590, cancelada: false }],
  ...extras,
});

const parcelas = (...valores: number[]) =>
  valores.map((valorCentavos) => ({ valorCentavos, cancelada: false }));

function acha(termo: string, c: CandidatoDaBusca): boolean {
  const busca = interpretarBusca(termo);
  if (!busca) throw new Error(`termo que nao busca: "${termo}"`);
  return correspondeABusca(busca, c);
}

describe('normalizarTexto', () => {
  it('tira acento e caixa', () => {
    expect(normalizarTexto('Farmácia São João AÇÚCAR')).toBe('farmacia sao joao acucar');
  });
});

describe('interpretarBusca', () => {
  it('termo vazio ou so de espacos nao busca', () => {
    expect(interpretarBusca('')).toBeNull();
    expect(interpretarBusca('   ')).toBeNull();
  });

  it('separa as palavras, normalizadas', () => {
    expect(interpretarBusca('  Uber   VIAGEM ')?.palavras).toEqual(['uber', 'viagem']);
  });

  it('le valor quando o termo inteiro tem forma de valor', () => {
    expect(interpretarBusca('89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('R$ 89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('r$89,90')?.centavos).toBe(8990);
    expect(interpretarBusca('89')?.centavos).toBe(8900);
    expect(interpretarBusca('1.025,51')?.centavos).toBe(102551);
    expect(interpretarBusca('-50,00')?.centavos).toBe(-5000);
  });

  it('nao le valor de texto com numero no meio', () => {
    // reaisParaCentavos descarta letras antes de ler: sem a guarda de forma,
    // "uber 89" viraria R$ 89,00 e "12x" viraria R$ 12,00.
    expect(interpretarBusca('uber 89')?.centavos).toBeNull();
    expect(interpretarBusca('12x')?.centavos).toBeNull();
  });

  it('ponto sem virgula e ambiguo, e vale so como texto', () => {
    expect(interpretarBusca('89.90')).toEqual({ palavras: ['89.90'], centavos: null });
  });
});

describe('correspondeABusca — por texto', () => {
  it('ignora acento e caixa', () => {
    expect(acha('farmacia', candidato())).toBe(true);
    expect(acha('SÃO JOÃO', candidato())).toBe(true);
  });

  it('acha pedaco de palavra', () => {
    expect(acha('farm', candidato())).toBe(true);
  });

  it('exige todas as palavras, em qualquer ordem', () => {
    const c = candidato({ descricao: 'Viagem Uber' });
    expect(acha('uber viagem', c)).toBe(true);
    expect(acha('uber taxi', c)).toBe(false);
  });

  it('procura tambem no nome do terceiro', () => {
    const c = candidato({ descricao: 'Ingresso show', devedorNome: 'Joana' });
    expect(acha('joana', c)).toBe(true);
    expect(acha('ingresso joana', c)).toBe(true);
  });
});

describe('correspondeABusca — por valor', () => {
  const geladeira = candidato({ descricao: 'Geladeira', parcelas: parcelas(8990, 8990, 8990) });

  it('acha pelo valor da parcela', () => {
    expect(acha('89,90', geladeira)).toBe(true);
  });

  it('acha pelo total, que e a soma das parcelas', () => {
    expect(acha('269,70', geladeira)).toBe(true);
  });

  it('nao acha valor so parecido', () => {
    expect(acha('89,91', geladeira)).toBe(false);
  });

  it('compara sem sinal: estorno acha pelo valor positivo, e vice-versa', () => {
    const estorno = candidato({ descricao: 'Estorno', parcelas: parcelas(-5000) });
    expect(acha('50,00', estorno)).toBe(true);
    expect(acha('-50,00', candidato({ descricao: 'Mercado', parcelas: parcelas(5000) }))).toBe(true);
  });

  it('parcela cancelada nao casa pelo proprio valor, mas entra no total', () => {
    const quitado = candidato({
      descricao: 'Sofa',
      parcelas: [
        { valorCentavos: 10000, cancelada: false },
        { valorCentavos: 12345, cancelada: true },
      ],
    });
    expect(acha('123,45', quitado)).toBe(false);
    expect(acha('223,45', quitado)).toBe(true);
  });

  it('texto e valor se somam: "89" acha pela descricao e pelo valor', () => {
    expect(acha('89', candidato({ descricao: 'Uber 89', parcelas: parcelas(1500) }))).toBe(true);
    expect(acha('89', candidato({ descricao: 'Mercado', parcelas: parcelas(8900) }))).toBe(true);
    expect(acha('89', candidato({ descricao: 'Mercado', parcelas: parcelas(8990) }))).toBe(false);
  });

  it('"89.90" nao casa por valor', () => {
    expect(acha('89.90', candidato({ descricao: 'Mercado', parcelas: parcelas(8990) }))).toBe(false);
  });
});

describe('competenciaDeDestino', () => {
  it('prefere a competencia de onde a pessoa veio, se o lancamento estiver nela', () => {
    expect(competenciaDeDestino(['2026-10', '2026-11', '2026-12'], '2026-11')).toBe('2026-11');
  });

  it('senao, a primeira competencia do lancamento', () => {
    expect(competenciaDeDestino(['2026-12', '2026-10', '2026-11'], '2027-05')).toBe('2026-10');
  });

  it('sem parcela ativa, nao ha destino', () => {
    expect(competenciaDeDestino([], '2026-11')).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx vitest run src/domain/busca.test.ts`
Esperado: FALHA — `Failed to resolve import "./busca"`.

- [ ] **Passo 3: Implementar**

Criar `src/domain/busca.ts`:

```ts
import { compararCompetencias, type Competencia } from './competencia';
import { reaisParaCentavos, type Centavos } from './money';

/**
 * A busca do Despesas, pura. O repositorio carrega os lancamentos e filtra com
 * estas funcoes, em memoria — o Postgres nao ignora acento sem a extensao
 * `unaccent`, e a regra inteira morando aqui e o que a torna testavel em
 * milissegundos. Ver docs/specs/2026-11-17-busca-design.md.
 */

/** O termo ja interpretado. `interpretarBusca` devolve `null` para "nao busque". */
export type Busca = {
  /** As palavras do termo, normalizadas. Todas precisam aparecer. */
  palavras: string[];
  /** O termo lido como dinheiro, quando ele tem forma de valor; `null` quando nao tem. */
  centavos: Centavos | null;
};

/** O minimo de um lancamento que a busca precisa olhar. */
export type CandidatoDaBusca = {
  descricao: string;
  devedorNome: string | null;
  /** Todas as parcelas, canceladas inclusive: o total da compra e a soma de todas. */
  parcelas: readonly { valorCentavos: number; cancelada: boolean }[];
};

/**
 * So um valor, e nada mais: "R$" opcional, sinal opcional, digitos, ponto e
 * virgula. Existe porque `reaisParaCentavos` descarta tudo o que nao e digito
 * antes de ler — o certo no campo de valor do painel, e o errado aqui: "uber 89"
 * viraria R$ 89,00, e a busca acharia toda compra de 89 reais.
 */
const FORMA_DE_VALOR = /^(?:r\$\s*)?-?\s*\d[\d.,]*$/i;

/**
 * Sem acento e em minuscula: "Farmácia" e "farmacia" viram a mesma coisa.
 *
 * O NFD separa a letra do acento, e a faixa U+0300–U+036F e a dos acentos
 * combinantes — cobre o portugues inteiro, cedilha inclusive. A faixa, e nao
 * `\p{M}`, porque o `target` do tsconfig e ES2017 e o escape de propriedade
 * Unicode so existe a partir do ES2018.
 */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

export function interpretarBusca(termo: string): Busca | null {
  const limpo = termo.trim();
  if (limpo === '') return null;

  const palavras = normalizarTexto(limpo)
    .split(/\s+/)
    .filter((palavra) => palavra !== '');
  return { palavras, centavos: lerValor(limpo) };
}

function lerValor(termo: string): Centavos | null {
  if (!FORMA_DE_VALOR.test(termo)) return null;
  try {
    return reaisParaCentavos(termo);
  } catch {
    // "89.90": tem forma de valor, mas o parser recusa por ambiguo. Vale so
    // como texto — adivinhar o decimal e como um valor vira 100x maior.
    return null;
  }
}

/** Casa por texto OU por valor: os dois criterios se somam, nunca se excluem. */
export function correspondeABusca(busca: Busca, candidato: CandidatoDaBusca): boolean {
  return casaPorTexto(busca, candidato) || casaPorValor(busca, candidato);
}

function casaPorTexto(busca: Busca, candidato: CandidatoDaBusca): boolean {
  const texto = normalizarTexto(`${candidato.descricao} ${candidato.devedorNome ?? ''}`);
  return busca.palavras.every((palavra) => texto.includes(palavra));
}

/**
 * Valor exato, sem sinal: o extrato e a memoria raramente carregam o sinal, e
 * "50,00" tem que achar o estorno de -50,00. Parcela cancelada nao casa pelo
 * proprio valor — ela nao aparece em mes nenhum —, mas entra no total, que e o
 * valor da compra (invariante 4).
 */
function casaPorValor(busca: Busca, candidato: CandidatoDaBusca): boolean {
  if (busca.centavos === null) return false;
  const alvo = Math.abs(busca.centavos);

  const pelaParcela = candidato.parcelas.some(
    (p) => !p.cancelada && Math.abs(p.valorCentavos) === alvo,
  );
  if (pelaParcela) return true;

  const total = candidato.parcelas.reduce((soma, p) => soma + p.valorCentavos, 0);
  return Math.abs(total) === alvo;
}

/**
 * Para qual mes o clique leva. A competencia de onde a pessoa veio, se o
 * lancamento tiver parcela nela — quem busca "89,90" olhando novembro quer a
 * parcela de novembro —; senao, a primeira, onde a compra entrou. `null`
 * quando nao ha parcela ativa: nao existe mes em que a linha seja visivel.
 */
export function competenciaDeDestino(
  competenciasAtivas: readonly Competencia[],
  origem: Competencia,
): Competencia | null {
  if (competenciasAtivas.includes(origem)) return origem;
  return [...competenciasAtivas].sort(compararCompetencias)[0] ?? null;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx vitest run src/domain/busca.test.ts`
Esperado: PASSA, todos os testes do arquivo.

Rodar também: `npx tsc --noEmit` e `npx eslint src/domain/busca.ts src/domain/busca.test.ts`
Esperado: sem erro.

- [ ] **Passo 5: Commit**

```bash
git add src/domain/busca.ts src/domain/busca.test.ts
git commit -m "Da ao dominio a regra da busca, pura e sem acento

A busca vai filtrar em memoria, e nao no Postgres, porque ILIKE nao
ignora acento e farmacia tem que achar Farmacia. Com a regra aqui, cada
caso de borda e testado sem banco: a guarda de forma de valor, sem a
qual uber 89 viraria R\$ 89,00; o estorno achado sem sinal; a parcela
cancelada que entra no total e nao casa sozinha.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: O repositório da busca

**Arquivos:**
- Criar: `src/server/repositorios/busca.ts`
- Teste: `src/server/repositorios/busca.test.ts`

**Interfaces:**
- Consome (Tarefa 1): `interpretarBusca`, `correspondeABusca`, `competenciaDeDestino` de
  `@/domain/busca`. De `./lancamento`: `criarLancamento(entrada: EntradaLancamento): Promise<{ ok: true; id: string } | { ok: false; motivo: 'FATURA_TRAVADA' }>`
  e `excluirLancamento(id: string, versao: number): Promise<{ ok: boolean }>` (só nos testes).
- Produz:
  - `const LIMITE_DA_BUSCA = 50`
  - `type ItemDaBusca` (campos abaixo)
  - `type ResultadoDaBusca = { itens: ItemDaBusca[]; total: number }`
  - `buscarLancamentos(termo: string, competenciaDeOrigem: string, limite?: number): Promise<ResultadoDaBusca>`

- [ ] **Passo 1: Escrever os testes que falham**

Criar `src/server/repositorios/busca.test.ts`. A guarda é a mesma de `recorrente.test.ts`: só
roda com `TESTE_DESTRUTIVO=1`, que só o `npm run test:banco` liga, e recusa banco que já tenha
lançamento.

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { buscarLancamentos } from './busca';
import { criarLancamento, excluirLancamento, type EntradaLancamento } from './lancamento';

// Grava e apaga no banco apontado por DATABASE_URL, como lancamento.test.ts.
// Mesmo opt-in e mesma guarda: so roda via `npm run test:banco`, contra a
// branch de teste, e recusa banco que ja tenha lancamento.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('busca', () => {
  let categoriaId: string;
  let membroId: string;
  let bancoLiberado = false;

  async function exigirBancoLivre(): Promise<void> {
    const existentes = await prisma.lancamento.count();
    if (existentes > 0) {
      throw new Error(
        `Banco tem ${existentes} lancamento(s) — recuso rodar TESTE_DESTRUTIVO aqui. ` +
          'Aponte DATABASE_URL para um banco vazio.',
      );
    }
    bancoLiberado = true;
  }

  async function limpar(): Promise<void> {
    if (!bancoLiberado) {
      throw new Error('limpar() chamada sem exigirBancoLivre() ter passado — nao apago nada.');
    }
    await prisma.parcela.deleteMany();
    await prisma.rateio.deleteMany();
    await prisma.lancamento.deleteMany();
    await prisma.fatura.deleteMany();
  }

  beforeAll(async () => {
    await exigirBancoLivre();
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    membroId = (await prisma.membro.findFirstOrThrow()).id;
  });

  beforeEach(async () => {
    await limpar();
  });

  afterAll(async () => {
    await limpar();
  });

  // 2099: competencias onde nunca havera dado real.
  async function criar(extras: Partial<EntradaLancamento> = {}): Promise<string> {
    const resultado = await criarLancamento({
      descricao: 'Farmácia',
      valorCentavos: 4590,
      origemValor: 'POR_PARCELA',
      dataCompra: '2099-01-10',
      numeroParcelas: 1,
      escopo: 'PESSOAL',
      membroId,
      contaId: 'conta-c6', // fecha dia 4, pelo seed
      categoriaId,
      ...extras,
    });
    if (!resultado.ok) throw new Error(`criacao recusada: ${resultado.motivo}`);
    return resultado.id;
  }

  it('acha sem acento, e deixa de fora o que esta na lixeira', async () => {
    const vivo = await criar({ descricao: 'Farmácia do centro' });
    const excluido = await criar({ descricao: 'Farmácia da esquina' });
    const { versao } = await prisma.lancamento.findUniqueOrThrow({ where: { id: excluido } });
    expect((await excluirLancamento(excluido, versao)).ok).toBe(true);

    const resultado = await buscarLancamentos('farmacia', '2099-01');

    expect(resultado.total).toBe(1);
    expect(resultado.itens.map((i) => i.lancamentoId)).toEqual([vivo]);
  });

  it('acha o parcelado pelo valor da parcela e pelo total', async () => {
    const id = await criar({ descricao: 'Geladeira', valorCentavos: 8990, numeroParcelas: 3 });
    const competencias = (
      await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } })
    ).map((p) => p.competencia);
    const [primeira, segunda, terceira] = competencias;
    if (!primeira || !segunda || !terceira) throw new Error('esperava tres parcelas');

    // Origem fora do lancamento: o destino e a primeira competencia.
    const pelaParcela = await buscarLancamentos('89,90', '2001-01');
    expect(pelaParcela.total).toBe(1);
    expect(pelaParcela.itens[0]).toMatchObject({
      lancamentoId: id,
      totalCentavos: 26970,
      numeroParcelas: 3,
      primeiraCompetencia: primeira,
      ultimaCompetencia: terceira,
      competenciaDestino: primeira,
    });

    expect((await buscarLancamentos('269,70', '2001-01')).total).toBe(1);

    // Origem dentro do lancamento: o destino e ela.
    const daSegunda = await buscarLancamentos('89,90', segunda);
    expect(daSegunda.itens[0]?.competenciaDestino).toBe(segunda);
  });

  it('corta no limite, do mais recente para o mais antigo, com o total certo', async () => {
    await criar({ descricao: 'Uber ida', dataCompra: '2099-01-05' });
    await criar({ descricao: 'Uber volta', dataCompra: '2099-01-20' });
    await criar({ descricao: 'Uber aeroporto', dataCompra: '2099-01-12' });

    const resultado = await buscarLancamentos('uber', '2099-01', 2);

    expect(resultado.total).toBe(3);
    expect(resultado.itens.map((i) => i.descricao)).toEqual(['Uber volta', 'Uber aeroporto']);
  });

  it('termo vazio nao consulta nada', async () => {
    await criar();
    expect(await buscarLancamentos('   ', '2099-01')).toEqual({ itens: [], total: 0 });
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Rodar: `npx tsc --noEmit`
Esperado: FALHA — `Cannot find module './busca'` em `busca.test.ts`. (O arquivo de teste é de
banco e pula sem `TESTE_DESTRUTIVO`; quem acusa a ausência aqui é o compilador.)

- [ ] **Passo 3: Implementar**

Criar `src/server/repositorios/busca.ts`:

```ts
import { competenciaDeDestino, correspondeABusca, interpretarBusca } from '@/domain/busca';
import { prisma } from '../db';

/** Quantos resultados a tela mostra. Acima disso, ela pede um termo mais especifico. */
export const LIMITE_DA_BUSCA = 50;

export type ItemDaBusca = {
  lancamentoId: string;
  descricao: string;
  dataCompra: string;
  /** O valor da COMPRA: a soma de todas as parcelas, canceladas inclusive. */
  totalCentavos: number;
  numeroParcelas: number;
  contaNome: string;
  categoriaNome: string;
  /** Quem gastou. `null` em lancamento de conjunto. */
  membroNome: string | null;
  escopo: 'PESSOAL' | 'CONJUNTO';
  ehReembolso: boolean;
  devedorNome: string | null;
  /** A faixa de meses em que o lancamento APARECE — so parcelas nao canceladas. */
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
  /** Para onde o clique leva. `null` quando toda parcela foi cancelada. */
  competenciaDestino: string | null;
};

export type ResultadoDaBusca = {
  /** Ate `limite` itens, do mais recente para o mais antigo. */
  itens: ItemDaBusca[];
  /** Quantos corresponderam ao todo — maior que `itens.length` quando houve corte. */
  total: number;
};

/**
 * Busca em todos os meses, por texto ou por valor (regra em `@/domain/busca`).
 *
 * Carrega TODO lancamento nao excluido e filtra em memoria, de proposito: o
 * Postgres nao ignora acento sem a extensao `unaccent`, e o volume do casal —
 * da ordem de 600 lancamentos por ano — cabe numa leitura so das colunas que a
 * lista mostra. Quando pesar, o remedio e pre-filtrar aqui antes de normalizar,
 * nao trocar a regra. Ver docs/decisoes.md.
 *
 * `competenciaDeOrigem` e o mes que o Despesas estava mostrando: decide para
 * qual parcela de um parcelado o clique leva.
 */
export async function buscarLancamentos(
  termo: string,
  competenciaDeOrigem: string,
  limite: number = LIMITE_DA_BUSCA,
): Promise<ResultadoDaBusca> {
  const busca = interpretarBusca(termo);
  if (!busca) return { itens: [], total: 0 };

  const lancamentos = await prisma.lancamento.findMany({
    where: { deletadoEm: null },
    select: {
      id: true,
      descricao: true,
      dataCompra: true,
      numeroParcelas: true,
      escopo: true,
      devedorNome: true,
      statusReembolso: true,
      conta: { select: { nome: true } },
      categoria: { select: { nome: true } },
      membro: { select: { nome: true } },
      // Por numero, que e a ordem dos meses: a parcela n+1 cai no mes seguinte.
      parcelas: {
        select: { competencia: true, valorCentavos: true, cancelada: true },
        orderBy: { numero: 'asc' },
      },
    },
    orderBy: [{ dataCompra: 'desc' }, { criadoEm: 'desc' }],
  });

  const encontrados = lancamentos.filter((l) => correspondeABusca(busca, l));

  return {
    total: encontrados.length,
    itens: encontrados.slice(0, limite).map((l) => {
      const ativas = l.parcelas.filter((p) => !p.cancelada).map((p) => p.competencia);
      return {
        lancamentoId: l.id,
        descricao: l.descricao,
        dataCompra: l.dataCompra,
        totalCentavos: l.parcelas.reduce((soma, p) => soma + p.valorCentavos, 0),
        numeroParcelas: l.numeroParcelas,
        contaNome: l.conta.nome,
        categoriaNome: l.categoria.nome,
        membroNome: l.membro?.nome ?? null,
        escopo: l.escopo,
        ehReembolso: l.statusReembolso !== null,
        devedorNome: l.devedorNome,
        primeiraCompetencia: ativas[0] ?? null,
        ultimaCompetencia: ativas[ativas.length - 1] ?? null,
        competenciaDestino: competenciaDeDestino(ativas, competenciaDeOrigem),
      };
    }),
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Rodar: `npx tsc --noEmit` e `npm test`
Esperado: sem erro de tipo; `npm test` passa, com os 4 testes novos de banco **pulados**.

Rodar: `npm run test:banco`
Esperado: a suíte inteira passa, **nenhum pulado** — incluindo os 4 de `busca.test.ts`. Se o
runner recusar por endpoint de teste igual ao de produção, ou por banco com lançamento, **pare
e avise** — não contorne a guarda.

- [ ] **Passo 5: Commit**

```bash
git add src/server/repositorios/busca.ts src/server/repositorios/busca.test.ts
git commit -m "Da ao servidor a busca em todos os meses

Le todo lancamento fora da lixeira e filtra com a regra do dominio, em
memoria: e o que deixa a busca ignorar acento sem extensao no Neon, e o
volume do casal cabe numa leitura so. Cada item ja sai com o mes para
onde o clique leva, que prefere o mes que a pessoa estava olhando.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: A barra e os resultados no Despesas

**Arquivos:**
- Criar: `src/components/despesas/barra-busca.tsx`
- Criar: `src/components/despesas/resultados-busca.tsx`
- Modificar: `src/app/(app)/despesas/page.tsx`

**Interfaces:**
- Consome (Tarefa 2): `buscarLancamentos`, `type ResultadoDaBusca`, `type ItemDaBusca` de
  `@/server/repositorios/busca`. De `@/domain/competencia`: `formatarCompetencia(c): string`
  (`'2026-11'` → `'novembro de 2026'`). De `@/domain/money`: `formatarBRL`.
- Produz:
  - `BarraBusca({ competencia: string; conta: string | undefined; termo: string })`
  - `ResultadosBusca({ resultado: ResultadoDaBusca; termo: string })`
  - Em `page.tsx`, a variável `destaque: string | undefined`, que a Tarefa 4 passa à grade.

Estes componentes não têm teste automatizado: a tela está atrás do login com Google, que nenhum
agente atravessa. A verificação é por tipo, lint e build aqui, e pelo Passo 12 do roteiro visual
(Tarefa 5), feito pelo usuário.

- [ ] **Passo 1: Criar a barra**

Criar `src/components/despesas/barra-busca.tsx`:

```tsx
import Form from 'next/form';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  /** O mes aberto: vai junto na busca, para o clique e o "Limpar" voltarem a ele. */
  competencia: string;
  /** O filtro de conta ligado, se houver. Nao restringe a busca — so volta no "Limpar". */
  conta: string | undefined;
  /** O termo buscado, ja sem espacos nas pontas. Vazio fora de uma busca. */
  termo: string;
};

/**
 * A barra de busca do Despesas. Buscar e navegar: um formulario GET para a
 * propria pagina, com `q`, e a pagina decide o resto. Sem estado aqui.
 *
 * O campo NAO recebe foco ao abrir: o Despesas e aberto o tempo todo, e roubar
 * o foco a cada visita atrapalharia quem so quer lancar.
 */
export function BarraBusca({ competencia, conta, termo }: Props) {
  const limpar = conta
    ? `/despesas?competencia=${competencia}&conta=${conta}`
    : `/despesas?competencia=${competencia}`;

  return (
    <Form action="/despesas" role="search" className="mt-4 flex items-center gap-2">
      <input type="hidden" name="competencia" value={competencia} />
      {conta && <input type="hidden" name="conta" value={conta} />}

      <label htmlFor="busca-termo" className="sr-only">
        Buscar lançamentos em todos os meses
      </label>
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-fraca"
        />
        {/* `key={termo}`: numa navegacao sem recarga o React reaproveita este
            input, e campo nao controlado ignora `defaultValue` novo. Sem a key,
            clicar num resultado deixaria o termo antigo escrito na barra. */}
        <Input
          key={termo}
          id="busca-termo"
          name="q"
          type="search"
          defaultValue={termo}
          autoComplete="off"
          placeholder="Buscar em todos os meses: descrição, terceiro ou valor (89,90)"
          className="pl-8"
        />
      </div>
      <Button type="submit" variant="outline">
        Buscar
      </Button>
      {termo && (
        <Link
          href={limpar}
          className="text-sm whitespace-nowrap text-acento underline-offset-4 hover:underline"
        >
          Limpar busca
        </Link>
      )}
    </Form>
  );
}
```

- [ ] **Passo 2: Criar a lista de resultados**

Criar `src/components/despesas/resultados-busca.tsx`:

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import type { ItemDaBusca, ResultadoDaBusca } from '@/server/repositorios/busca';

/** Em que meses o lancamento aparece, no formato da Lixeira. */
function faixaDeMeses(item: ItemDaBusca): string | null {
  if (!item.primeiraCompetencia || !item.ultimaCompetencia) return null;
  const primeiro = formatarCompetencia(item.primeiraCompetencia);
  if (item.primeiraCompetencia === item.ultimaCompetencia) return primeiro;
  return `${primeiro} a ${formatarCompetencia(item.ultimaCompetencia)}`;
}

/** "2026-11-05" vira "05/11/2026". A data vem sem fuso; nada de `Date` aqui. */
function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/**
 * Os resultados da busca, no lugar da grade do mes. Um item por LANCAMENTO,
 * como a Lixeira: parcelado e uma linha, com a faixa de meses, e nao doze.
 *
 * O cabecalho diz "em todos os meses" porque a faixa de totais logo acima e do
 * mes aberto — sem o aviso, ela pareceria descrever estes resultados.
 */
export function ResultadosBusca({ resultado, termo }: { resultado: ResultadoDaBusca; termo: string }) {
  if (resultado.total === 0) {
    return (
      <div className="mt-4 rounded-caixa border border-borda bg-superficie px-6 py-10 text-center">
        <p className="text-sm text-tinta">Nada encontrado para “{termo}”.</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-tinta-fraca">
          A busca olha a descrição e o nome do terceiro, ou o valor exato, em todos os meses. O que
          está na lixeira fica de fora.
        </p>
      </div>
    );
  }

  const cortado = resultado.total > resultado.itens.length;

  return (
    <section aria-labelledby="titulo-resultados" className="mt-4">
      <h2 id="titulo-resultados" className="text-sm text-tinta-fraca">
        {cortado
          ? `Mostrando os ${resultado.itens.length} mais recentes de ${resultado.total} lançamentos, em todos os meses. Use um termo mais específico para ver os outros.`
          : `${resultado.total} ${resultado.total === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'} em todos os meses`}
      </h2>
      <ul className="mt-2 divide-y divide-borda-suave overflow-hidden rounded-caixa border border-borda bg-superficie">
        {resultado.itens.map((item) => (
          <ItemResultado key={item.lancamentoId} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ItemResultado({ item }: { item: ItemDaBusca }) {
  const meses = faixaDeMeses(item);
  const dono = item.escopo === 'CONJUNTO' ? 'Conjunto' : (item.membroNome ?? 'sem pessoa');

  const corpo = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm text-tinta">
          <span className="truncate">{item.descricao}</span>
          {item.ehReembolso && (
            <Badge variant="secondary" className="bg-atencao-fundo text-atencao">
              {item.devedorNome ? `a receber de ${item.devedorNome}` : 'a receber'}
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-xs text-tinta-fraca">
          {dataCurta(item.dataCompra)} · {dono} · {item.categoriaNome} · {item.contaNome}
          {meses && <> · {meses}</>}
        </p>
      </div>
      <p className="text-sm text-tinta tabular-nums">
        {formatarBRL(item.totalCentavos)}
        {item.numeroParcelas > 1 && (
          <span className="ml-1 text-xs text-tinta-fraca">em {item.numeroParcelas}x</span>
        )}
      </p>
    </div>
  );

  if (!item.competenciaDestino) {
    return (
      <li className="px-4 py-3">
        {corpo}
        <p className="mt-1 text-xs text-tinta-apagada">
          Todas as parcelas foram canceladas: o lançamento não aparece em nenhum mês.
        </p>
      </li>
    );
  }

  // Sem `conta` no link, de proposito: um filtro ligado antes esconderia a linha.
  return (
    <li>
      <Link
        href={`/despesas?competencia=${item.competenciaDestino}&destaque=${item.lancamentoId}`}
        className="block px-4 py-3 outline-none hover:bg-realce focus-visible:bg-realce focus-visible:ring-3 focus-visible:ring-acento/50 focus-visible:ring-inset"
      >
        {corpo}
      </Link>
    </li>
  );
}
```

- [ ] **Passo 3: Ligar na página do Despesas**

Em `src/app/(app)/despesas/page.tsx`:

(a) Imports — acrescentar, mantendo a ordem alfabética dos caminhos:

```ts
import { BarraBusca } from '@/components/despesas/barra-busca';
```
logo antes de `import { FaixaRecorrentes } ...`;

```ts
import { ResultadosBusca } from '@/components/despesas/resultados-busca';
```
logo depois de `import { GradeLancamentos } ...`; e

```ts
import { buscarLancamentos } from '@/server/repositorios/busca';
```
logo antes de `import { carregarRecorrentesPendentes } ...`.

(b) Trocar o tipo das props e a leitura dos parâmetros:

```ts
type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;
```

por:

```ts
type Props = {
  searchParams: Promise<{ competencia?: string; conta?: string; q?: string; destaque?: string }>;
};

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta, q, destaque } = await searchParams;
  // Termo so de espacos e o mesmo que nenhum: o Despesas continua sendo o mes.
  const termo = q?.trim() ?? '';
  const buscando = termo !== '';
```

(c) No `Promise.all`, trocar a desestruturação:

```ts
  const [todasAsContas, categorias, membros, linhas, parcelas, recorrentesPendentes] = await Promise.all([
```

por:

```ts
  const [todasAsContas, categorias, membros, linhas, parcelas, recorrentesPendentes, resultadoBusca] =
    await Promise.all([
```

e trocar as três últimas entradas da lista:

```ts
    carregarLinhasDaGrade(competencia, conta),
    carregarParcelasDaCompetencia(competencia),
    // So LEITURA: a pagina descobre o que falta lancar, e quem lanca e o clique
    // na faixa. Nada e gerado durante a renderizacao — ver `faixa-recorrentes.tsx`.
    carregarRecorrentesPendentes(competencia),
  ]);
```

por:

```ts
    // Com termo, a grade e as recorrentes nao sao desenhadas — nao carrega. As
    // parcelas ficam: alimentam a faixa de totais, que continua no topo.
    buscando ? Promise.resolve([]) : carregarLinhasDaGrade(competencia, conta),
    carregarParcelasDaCompetencia(competencia),
    // So LEITURA: a pagina descobre o que falta lancar, e quem lanca e o clique
    // na faixa. Nada e gerado durante a renderizacao — ver `faixa-recorrentes.tsx`.
    buscando ? Promise.resolve([]) : carregarRecorrentesPendentes(competencia),
    // A busca e de todos os meses e de todas as contas: o filtro de conta nao
    // entra, para um filtro esquecido nao fazer um "nao achei" mentir.
    buscando ? buscarLancamentos(termo, competencia) : Promise.resolve(null),
  ]);
```

Reindentar as entradas intermediárias do `Promise.all` em dois espaços a mais, para
acompanhar o `await` que desceu de linha. O projeto não tem Prettier: a indentação é à mão, e o
critério é ficar igual ao resto do arquivo.

(d) No JSX, trocar tudo o que vem depois de `<h1 ...>Despesas</h1>` até o fechamento do `<div>`
externo:

```tsx
      <h1 className="mt-4 text-xl font-semibold">Despesas</h1>

      {/* Do mes inteiro, mesmo com filtro de conta ligado: o que e fixo no mes
          nao deixa de faltar porque a pessoa esta olhando um cartao so. */}
      <FaixaRecorrentes pendentes={recorrentesPendentes} competencia={competencia} />

      {/* Chips e cartao levam sua propria margem (mt-4) dentro de
          GradeLancamentos — o cartao (borda arredondada) nao pode mais
          envolver os chips tambem, ver achado 3 da revisao de bc54df3. */}
      <GradeLancamentos
        linhas={linhas}
        competencia={competencia}
        contasDoMes={contasDoMes}
        contasAtivas={contasAtivas}
        categorias={categorias}
        membros={membros}
        contaSelecionada={conta}
      />
    </div>
```

por:

```tsx
      <h1 className="mt-4 text-xl font-semibold">Despesas</h1>

      <BarraBusca competencia={competencia} conta={conta} termo={termo} />

      {resultadoBusca ? (
        // Resultados de todos os meses no lugar do mes: sem recorrentes, sem
        // chips, sem grade. A faixa de competencia fica — e o mes da volta, e
        // a competencia de origem que o clique usa.
        <ResultadosBusca resultado={resultadoBusca} termo={termo} />
      ) : (
        <>
          {/* Do mes inteiro, mesmo com filtro de conta ligado: o que e fixo no mes
              nao deixa de faltar porque a pessoa esta olhando um cartao so. */}
          <FaixaRecorrentes pendentes={recorrentesPendentes} competencia={competencia} />

          {/* Chips e cartao levam sua propria margem (mt-4) dentro de
              GradeLancamentos — o cartao (borda arredondada) nao pode mais
              envolver os chips tambem, ver achado 3 da revisao de bc54df3. */}
          <GradeLancamentos
            linhas={linhas}
            competencia={competencia}
            contasDoMes={contasDoMes}
            contasAtivas={contasAtivas}
            categorias={categorias}
            membros={membros}
            contaSelecionada={conta}
          />
        </>
      )}
    </div>
```

`destaque` fica lido e sem uso até a Tarefa 4. Se o ESLint acusar variável não usada, deixe-a
fora da desestruturação agora e acrescente na Tarefa 4.

- [ ] **Passo 4: Verificar**

Rodar: `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build`
Esperado: tudo limpo; `npm test` com o mesmo número de passando da Tarefa 2; build sem erro.

- [ ] **Passo 5: Commit**

```bash
git add src/components/despesas/barra-busca.tsx src/components/despesas/resultados-busca.tsx "src/app/(app)/despesas/page.tsx"
git commit -m "Poe a busca numa barra do Despesas, e nao numa tela a parte

Conferir a fatura e procurar se um valor do extrato ja foi lancado
acontece com o Despesas aberto, entao a busca fica ali. Com termo, a
pagina troca recorrentes, chips e grade pelos resultados de todos os
meses e deixa de carregar o que nao desenha; a faixa de totais fica,
porque e o mes da volta. Buscar e navegar: a URL e a busca.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: A linha destacada

**Arquivos:**
- Modificar: `src/app/(app)/despesas/page.tsx`
- Modificar: `src/components/despesas/grade-lancamentos.tsx`
- Modificar: `src/components/despesas/secao-pessoa.tsx`

**Interfaces:**
- Consome (Tarefa 3): `destaque: string | undefined`, lido do `?destaque=` em `page.tsx`.
- Produz: prop `destaque?: string | undefined` em `GradeLancamentos` e `SecaoPessoa`; prop
  `destacada: boolean` em `LinhaDaSecao` (interna de `secao-pessoa.tsx`). A linha destacada leva
  `data-destaque="true"`.

- [ ] **Passo 1: A linha realça e rola**

Em `src/components/despesas/secao-pessoa.tsx`:

(a) Acrescentar o import do React, como primeira linha depois de `'use client';` e da linha em
branco:

```ts
import { useEffect, useRef } from 'react';
```

(b) Em `type Props`, depois de `categorias: Categoria[];`, acrescentar:

```ts
  /** Lancamento que a busca mandou mostrar (`?destaque=`): a linha dele realca e rola ate a vista. */
  destaque?: string | undefined;
```

(c) Em `type LinhaProps`, depois de `competencia: string;`, acrescentar:

```ts
  /** E o lancamento que a busca mandou mostrar. */
  destacada: boolean;
```

(d) Trocar o começo de `LinhaDaSecao`:

```tsx
function LinhaDaSecao({ linha, esmaecida, categoriaCor, competencia, onEditar }: LinhaProps) {
  return (
    <tr className="group border-b border-borda-suave last:border-0 hover:bg-realce">
      <td className={`px-3 py-2 ${esmaecida ? 'text-tinta-apagada' : 'text-tinta-fraca'}`}>
```

por:

```tsx
function LinhaDaSecao({ linha, esmaecida, categoriaCor, competencia, destacada, onEditar }: LinhaProps) {
  const ref = useRef<HTMLTableRowElement>(null);

  // Uma vez, ao abrir: quem chega da busca precisa achar a linha sem procurar
  // de novo. `block: 'center'` deixa contexto acima e abaixo. O realce fica
  // enquanto o `?destaque=` estiver na URL; trocar de mes pelas setas o solta,
  // porque a faixa monta os links so com competencia e conta.
  useEffect(() => {
    if (destacada) ref.current?.scrollIntoView({ block: 'center' });
  }, [destacada]);

  return (
    <tr
      ref={ref}
      data-destaque={destacada || undefined}
      className={`group border-b border-borda-suave last:border-0 hover:bg-realce ${destacada ? 'bg-acento/10' : ''}`}
    >
      {/* A barra de acento na primeira celula, e nao borda no <tr>: borda e
          sombra em linha de tabela nao desenham igual em todo navegador. */}
      <td
        className={`px-3 py-2 ${destacada ? 'shadow-[inset_3px_0_0_var(--color-acento)]' : ''} ${esmaecida ? 'text-tinta-apagada' : 'text-tinta-fraca'}`}
      >
```

(e) Em `SecaoPessoa`, trocar a assinatura:

```tsx
export function SecaoPessoa({ titulo, cores, grupo, colSpan, competencia, categorias, onEditar }: Props) {
```

por:

```tsx
export function SecaoPessoa({
  titulo,
  cores,
  grupo,
  colSpan,
  competencia,
  categorias,
  destaque,
  onEditar,
}: Props) {
```

e, no `<LinhaDaSecao ... />`, acrescentar depois de `competencia={competencia}`:

```tsx
            destacada={item.linha.lancamentoId === destaque}
```

Uma parcela por lançamento por competência: no mês, o destaque cai em **uma** linha só.

- [ ] **Passo 2: A grade repassa**

Em `src/components/despesas/grade-lancamentos.tsx`:

(a) Em `type Props`, depois de `contaSelecionada?: string | undefined;`, acrescentar:

```ts
  /** Lancamento que a busca mandou mostrar (`?destaque=`). Desce ate a linha. */
  destaque?: string | undefined;
```

(b) Na desestruturação de `GradeLancamentos`, acrescentar `destaque,` depois de
`contaSelecionada,`.

(c) No `<SecaoPessoa ... />`, acrescentar depois de `categorias={categorias}`:

```tsx
                destaque={destaque}
```

- [ ] **Passo 3: A página passa o parâmetro**

Em `src/app/(app)/despesas/page.tsx`, no `<GradeLancamentos ... />`, acrescentar depois de
`contaSelecionada={conta}`:

```tsx
            destaque={destaque}
```

(Se na Tarefa 3 `destaque` ficou fora da desestruturação de `searchParams`, acrescente-o agora:
`const { competencia = competenciaAtual(), conta, q, destaque } = await searchParams;`.)

- [ ] **Passo 4: Verificar**

Rodar: `npx tsc --noEmit`, `npm run lint`, `npm test` e `npm run build`
Esperado: tudo limpo.

Conferir que nenhuma cor literal entrou: `grep -rn -E "#[0-9a-fA-F]{3,6}\b" src/components/despesas/`
Esperado: nenhuma linha nova (a regra do repositório é token, nunca cor escrita à mão).

- [ ] **Passo 5: Commit**

```bash
git add "src/app/(app)/despesas/page.tsx" src/components/despesas/grade-lancamentos.tsx src/components/despesas/secao-pessoa.tsx
git commit -m "Destaca no mes a linha que a busca encontrou

Clicar num resultado abre o mes certo, mas num mes cheio a pessoa teria
que procurar a linha de novo. O ?destaque= desce ate ela, que realca e
rola para o centro uma vez; trocar de mes solta o realce sem codigo a
mais, porque a faixa nao carrega o parametro.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Documentação

**Arquivos:**
- Modificar: `docs/regras-de-negocio.md`, `docs/decisoes.md`, `docs/arquitetura.md`,
  `docs/estado.md`, `docs/verificacao-visual.md`, `CLAUDE.md`, `README.md`

**Interfaces:** nenhuma de código. Os nomes citados são os das Tarefas 1–4.

- [ ] **Passo 1: Regra de negócio**

Acrescentar ao fim de `docs/regras-de-negocio.md`:

```markdown
---

## 13. Busca

A busca fica numa barra do Despesas e procura em **todos os meses e todas as contas** — o filtro
de conta ligado não a restringe. Termo vazio, ou só de espaços, não busca.

Um lançamento corresponde por **texto ou por valor**:

- **Texto:** todas as palavras do termo, em qualquer ordem, aparecem na descrição ou no nome do
  terceiro, sem diferença de acento nem de caixa. Categoria, conta e pessoa não entram.
- **Valor:** se o termo tem forma de valor (`89,90`, `R$ 89,90`, `89`, `1.025,51`), o valor
  exato, **sem sinal**, de uma parcela não cancelada ou do total — a soma de todas as parcelas,
  canceladas inclusive. `89.90`, com ponto, é ambíguo e vale só como texto. Texto com número no
  meio (`uber 89`) não vira valor.

Lançamento na lixeira não aparece. Um resultado por lançamento, do mais recente para o mais
antigo, no máximo 50; havendo mais, a tela diz quantos.

O clique leva ao Despesas com a linha destacada, na competência:

1. que o Despesas estava mostrando, se o lançamento tiver parcela ativa nela;
2. senão, na primeira competência com parcela ativa.

Sem parcela ativa, o resultado aparece sem link. O link vai sem filtro de conta.
```

- [ ] **Passo 2: Decisão**

Acrescentar ao fim de `docs/decisoes.md`:

```markdown
## A busca: em memória, no Despesas, e sem categoria no texto

**Em memória, não no Postgres.** `ILIKE` e o `mode: 'insensitive'` do Prisma ignoram caixa e
não ignoram acento — `farmacia` não acharia *Farmácia*, e é assim que se digita com pressa. A
extensão `unaccent` resolveria, ao custo de migration, extensão no Neon e um índice a manter,
para duas pessoas. Carregar os lançamentos fora da lixeira e filtrar com `src/domain/busca.ts`
resolve o acento sem nada disso, e deixa cada caso de borda testável sem banco. O volume
sustenta: ~600 lançamentos por ano. Quando pesar, pré-filtre no banco antes de normalizar — não
troque a regra.

**No Despesas, não numa tela própria.** Foi o primeiro desenho, e o usuário trocou: o uso que
motiva a busca — ver um valor no extrato e procurar se já foi lançado — acontece com o Despesas
aberto. Custou um estado a mais na página (com termo, os resultados tomam o lugar de
recorrentes, chips e grade) e poupou um destino na barra lateral e uma troca de tela no clique.

**Categoria fora do texto pesquisado.** Buscar `mercado` acha a compra descrita como mercado,
não toda compra da categoria Mercado. A pergunta "quanto foi em Mercado" tem resposta melhor no
ranking dos Gráficos, e misturar as duas transformaria toda busca por uma palavra comum numa
lista de centenas.

**A guarda de forma de valor.** `reaisParaCentavos` descarta tudo o que não é dígito antes de
ler, o que é certo no campo de valor do painel. Na busca seria errado: `uber 89` viraria
R$ 89,00. Por isso o termo só é lido como valor se tiver forma de valor, e nada mais. Não
"simplifique" chamando o parser direto.
```

- [ ] **Passo 3: Arquitetura**

Em `docs/arquitetura.md`:

(a) Na tabela da Camada 1, depois da linha de `recorrencia.ts`, acrescentar:

```markdown
| `busca.ts` | A busca por texto ou valor, sem acento, e o mês para onde o clique leva | `Busca`, `CandidatoDaBusca`, `normalizarTexto`, `interpretarBusca`, `correspondeABusca`, `competenciaDeDestino` |
```

(b) Na tabela de repositórios, depois da linha de `repositorios/lixeira.ts`, acrescentar:

```markdown
| `repositorios/busca.ts` | `LIMITE_DA_BUSCA`, `ItemDaBusca`, `ResultadoDaBusca`, `buscarLancamentos` — carrega todo lançamento fora da lixeira e filtra em memória |
```

(c) Na tabela de `despesas/`, depois da linha de `dialogo-exclusao.tsx`, acrescentar:

```markdown
| `barra-busca.tsx` | não | A busca: um formulário GET para o próprio Despesas, com `q` |
| `resultados-busca.tsx` | não | Os resultados de todos os meses, um por **lançamento**, no lugar da grade |
```

e, no parágrafo logo abaixo da tabela, acrescentar um novo parágrafo:

```markdown
Com `?q=`, a página do Despesas troca recorrentes, chips e grade pelos resultados e deixa de
carregar a grade e as recorrentes. Com `?destaque=<lancamentoId>`, a linha desse lançamento
realça e rola até a vista — é o destino do clique num resultado.
```

- [ ] **Passo 4: Estado**

Em `docs/estado.md`:

(a) Remover o item **"Não há busca."** da seção *O que ainda não existe*.

(b) Na seção *O que já funciona*, na lista *O produto, ponta a ponta*, acrescentar ao fim:

```markdown
- **Busca** numa barra do Despesas: texto (sem acento) ou valor exato, em todos os meses, com o
  clique levando à linha destacada no mês certo
```

(c) Atualizar a contagem de testes no começo de *O que já funciona* com a **saída literal** de
`npm test` e `npm run test:banco` depois da Tarefa 4 — inclusive o número de arquivos e a
lista dos arquivos de banco com quantos testes cada (`busca.test.ts` entra com 4).

(d) Reescrever a seção *Como retomar*, que manda para uma branch que não existe mais:

````markdown
## Como retomar

```bash
git switch main
npm install
npm test          # sem banco nem rede; a contagem atual está em "O que já funciona"
npm run test:banco  # contra a branch de teste do Neon, em DATABASE_URL_TESTE
```

O `DATABASE_URL` aponta para o **banco de produção do casal**. Nada de `TESTE_DESTRUTIVO=1` à
mão, e nenhum `UPDATE` sem a palavra do usuário. **Não rode `scripts/dados-ficticios.ts`
contra ele**: os fictícios cairiam nos mesmos meses que a finança real — ver
[`verificacao-visual.md`](verificacao-visual.md).

Toda push na `main` publica na Vercel. Migration nova vai para o banco **antes** do push
(armadilha 23 de [`arquitetura.md`](arquitetura.md)).
````

mantendo, depois dela, o parágrafo que já existe sobre ler `decisoes.md` e as armadilhas.

- [ ] **Passo 5: Roteiro visual**

Acrescentar ao fim de `docs/verificacao-visual.md`:

```markdown

## Passo 12 — Busca

- [ ] No Despesas, a barra de busca aparece abaixo do título, e o campo **não** pega o foco
      sozinho ao abrir a tela.
- [ ] Busque uma palavra **sem acento** de uma descrição que tem acento (`farmacia`): acha.
      O cabeçalho diz *em todos os meses*, e recorrentes, chips e grade sumiram.
- [ ] Busque um valor do extrato, com vírgula (`89,90`): acha o lançamento, e num parcelado a
      linha mostra o total, `em Nx` e a faixa de meses.
- [ ] Busque `89.90`, com ponto: **não** acha pelo valor.
- [ ] Clique num resultado: abre o mês dele, com a linha **realçada e rolada até a vista**, e a
      barra de busca **vazia**. O voltar do navegador devolve os resultados.
- [ ] Estando num mês em que um parcelado tem parcela, busque-o e clique: abre **esse** mês, e
      não o da primeira parcela.
- [ ] Com um filtro de conta ligado, busque algo de **outra** conta: acha. **Limpar busca**
      volta ao mês com o filtro.
- [ ] Exclua um lançamento e busque por ele: não aparece.
- [ ] Busque algo que não existe: a mensagem diz que não achou e que a lixeira fica de fora.
- [ ] Com uma busca aberta, troque de mês pelas setas: a busca termina e o mês aparece.
```

- [ ] **Passo 6: Texto desatualizado**

Em `CLAUDE.md`, seção *Ambiente*:

(a) Trocar `Repositório privado.` por:

```markdown
Repositório **público**, como portfólio — por isso nenhum dado financeiro real entra nele, nem
como fixture (ver a seção *Privacidade* do `README.md`).
```

(b) Trocar:

```markdown
Neon e as credenciais OAuth do Google **já existem e estão configurados**; a Vercel ainda não,
e só é necessária para publicar.
```

por:

```markdown
Neon, as credenciais OAuth do Google e a Vercel **já existem e estão configurados**. Toda push
na `main` publica em https://lancardespesas.vercel.app.
```

(c) Na seção *Convenções*, atualizar os números de `npm test` e `npm run test:banco` com os da
saída literal do Passo 4(c). Em `README.md`, a frase `São 145 testes em cerca de um segundo`
recebe o novo número de `npm test`.

- [ ] **Passo 7: Conferir e commitar**

Rodar: `git diff --stat` e reler cada trecho acrescentado — os nomes de função citados existem
com essa grafia (`grep -n "export" src/domain/busca.ts src/server/repositorios/busca.ts`).

```bash
git add docs/regras-de-negocio.md docs/decisoes.md docs/arquitetura.md docs/estado.md docs/verificacao-visual.md docs/specs/2026-11-17-busca-design.md docs/plans/busca.md CLAUDE.md README.md
git commit -m "Documenta a busca, e acerta o texto que envelheceu

A regra entra nas regras de negocio; o porque da busca em memoria, no
Despesas e sem categoria entra nas decisoes, para ninguem trocar por um
ILIKE que nao ignora acento. O roteiro ganha o Passo 12, porque a tela
esta atras do login. De carona: o CLAUDE.md ainda chamava o repositorio
de privado e a Vercel de nao configurada, e o Como retomar mandava para
uma branch que nao existe mais.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificação final

Depois da Tarefa 5, na branch de trabalho:

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run lint` limpo
- [ ] `npm test` passando, com os de banco pulados
- [ ] `npm run test:banco` passando, nenhum pulado
- [ ] `npm run build` limpo
- [ ] `git log --oneline main..HEAD` mostra os cinco commits, um por tarefa
- [ ] Nenhum arquivo de `dados-privados/`, `.env` ou `.csv` no diff:
      `git diff --name-only main..HEAD | grep -i -E "\.env|\.csv|dados-privados"` volta vazio

O merge na `main` e o push — que publica na Vercel — esperam a palavra do usuário. Não há
migration, então a ordem banco-antes-do-código não se aplica aqui.
