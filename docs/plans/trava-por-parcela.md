# Trava por parcela — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os
> passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** a trava de fatura passa a congelar só as parcelas do mês travado. Dá para lançar
escolhendo a Fatura, e para editar ou excluir *só esta parcela*, *esta e as seguintes* ou
*todas*, com toda recusa dizendo qual parcela, mês e cartão estão travados.

**Arquitetura:** um lançamento passa a ser uma **faixa** (`parcelaInicial..parcelaFinal`) das
parcelas de uma compra. Editar ou excluir parte de um parcelado **divide** o lançamento: o
original fica com as linhas de antes, sem tocar nelas, e o alcance vira um lançamento novo. A
regra da divisão, da faixa e da trava é pura, em `src/domain/`. O repositório só materializa o
plano numa transação, com o lock otimista de sempre, e a barreira olha só as parcelas que a
operação apaga ou grava.

**Stack:** Next.js 16 App Router, React 19, TypeScript estrito (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`), Prisma 6, Vitest, Tailwind 4, shadcn/ui.

**Desenho:** [`docs/specs/2026-11-19-trava-por-parcela-design.md`](../specs/2026-11-19-trava-por-parcela-design.md).
Leia antes de começar: este plano diz **como**, o desenho diz **o quê** e **por quê**. Leia
também [`docs/decisoes.md`](../decisoes.md) e as armadilhas de [`docs/arquitetura.md`](../arquitetura.md).

## Restrições globais

- Dinheiro é `number` inteiro em centavos. Nenhum `float`, nunca.
- `src/domain/` é puro: nada de Prisma, `fetch`, `Date.now()` ou `new Date()` ali.
- Identificadores de domínio em português sem acento; termos técnicos em inglês. **Textos de
  tela com acento**, comentários de código sem acento (convenção do repositório).
- `exactOptionalPropertyTypes` está ligado: prop opcional que pode receber `undefined` se
  declara `campo?: T | undefined`.
- **Toda gravação de lançamento passa pelo lock otimista** (`updateMany` com `versao` no
  `where`), dentro da mesma transação da barreira de trava.
- **Nunca rode `prisma migrate dev` nem `prisma migrate deploy` à mão.** A `DATABASE_URL` do
  `.env` é a de **produção**. O banco de teste recebe a migration pelo `npm run test:banco`, que
  faz isso sozinho; produção só no fechamento, com a palavra do usuário.
- Testes de banco **só** por `npm run test:banco`. **Nunca** ligue `TESTE_DESTRUTIVO=1` à mão.
- Commits em português, no imperativo, explicando o porquê, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Na branch de trabalho os commits
  por tarefa estão liberados; **merge na `main` e push só com a palavra do usuário**.
- `git` só pela ferramenta Bash (não está no PATH do PowerShell nesta máquina).
- Verificação de tipos: `npx tsc --noEmit`. O Vitest não confere tipo nenhum.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/domain/parcelamento.ts` | modificar | Tipo `Faixa`; `gerarParcelas` filtra por faixa |
| `src/domain/competencia.ts` | modificar | `competenciaBaseDaFatura`, `mesesAoRedor` |
| `src/domain/trava.ts` | criar | Achar a parcela travada, descrevê-la, comparar data e Fatura |
| `src/domain/divisao.ts` | criar | Alcance, plano de divisão, faixa escrita, rótulo da faixa |
| `prisma/schema.prisma` + migration | modificar/criar | `parcelaInicial`, `parcelaFinal` em `Lancamento` |
| `src/server/repositorios/lancamento.ts` | modificar | Barreira por parcela, criar com faixa, editar e excluir com alcance |
| `src/server/actions/lancamento.ts` | modificar | `fatura`, `parcelaInicial`, `alcance`, `numero` |
| `src/server/repositorios/resumo.ts` | modificar | `LinhaGrade` com a faixa |
| `src/server/repositorios/fatura.ts` | modificar | `carregarTravadasAoRedor` |
| `src/server/repositorios/lixeira.ts`, `busca.ts` | modificar | Itens com a faixa |
| `src/components/lixeira/lista-lixeira.tsx`, `despesas/resultados-busca.tsx` | modificar | Rótulo da faixa; frase da trava |
| `src/components/despesas/controle-alcance.tsx` | criar | O controle segmentado |
| `src/components/despesas/alcance-da-linha.ts` | criar | Opções de alcance de uma linha da grade |
| `src/components/despesas/painel-lancamento.tsx` | modificar | Fatura, aviso da data, parcela inicial, alcance, linha travada |
| `src/components/despesas/dialogo-exclusao.tsx` | modificar | Alcance na exclusão |
| `src/components/despesas/grade-lancamentos.tsx`, `secao-pessoa.tsx` | modificar | Repassam `travadas` |
| `src/app/(app)/despesas/page.tsx` | modificar | Carrega as faturas travadas da janela |
| `docs/*`, `CLAUDE.md` | modificar | Regras, decisões, armadilha, estado, roteiro visual |

---

### Tarefa 1: Faixa no parcelamento, e a Fatura na competência

**Arquivos:**
- Modificar: `src/domain/parcelamento.ts`
- Modificar: `src/domain/competencia.ts`
- Teste: `src/domain/parcelamento.test.ts`, `src/domain/competencia.test.ts`

**Interfaces:**
- Consome: nada novo.
- Produz:
  - `type Faixa = { inicial: number; final: number }` (em `parcelamento.ts`)
  - `gerarParcelas(entrada: EntradaParcelamento, faixa?: Faixa): ParcelaGerada[]`
  - `competenciaBaseDaFatura(fatura: Competencia, numero: number): Competencia`
  - `mesesAoRedor(centro: Competencia, raio: number): Competencia[]`

- [ ] **Passo 1: Escrever os testes que falham**

No fim de `src/domain/parcelamento.test.ts`:

```ts
describe('gerarParcelas com faixa', () => {
  const compra = {
    valorCentavos: 43210,
    origem: 'POR_PARCELA' as const,
    numeroParcelas: 12,
    competenciaBase: '2026-07',
  };

  it('grava so as parcelas da faixa, com o numero e o mes da compra inteira', () => {
    expect(gerarParcelas(compra, { inicial: 4, final: 6 })).toEqual([
      { numero: 4, valorCentavos: 43210, competencia: '2026-10' },
      { numero: 5, valorCentavos: 43210, competencia: '2026-11' },
      { numero: 6, valorCentavos: 43210, competencia: '2026-12' },
    ]);
  });

  it('com valor total, os pedacos juntos sao a compra inteira, centavo por centavo', () => {
    const total = {
      valorCentavos: 10000,
      origem: 'TOTAL' as const,
      numeroParcelas: 3,
      competenciaBase: '2026-08',
    };
    const pedacos = [
      ...gerarParcelas(total, { inicial: 1, final: 2 }),
      ...gerarParcelas(total, { inicial: 3, final: 3 }),
    ];
    expect(pedacos).toEqual(gerarParcelas(total));
    expect(pedacos[2]?.valorCentavos).toBe(3334);
  });

  it('recusa faixa fora da compra', () => {
    expect(() => gerarParcelas(compra, { inicial: 0, final: 3 })).toThrow('Faixa invalida');
    expect(() => gerarParcelas(compra, { inicial: 5, final: 4 })).toThrow('Faixa invalida');
    expect(() => gerarParcelas(compra, { inicial: 10, final: 13 })).toThrow('Faixa invalida');
  });
});
```

Em `src/domain/competencia.test.ts`, acrescente `competenciaBaseDaFatura` e `mesesAoRedor` ao
`import { ... } from './competencia'` do topo, e no fim do arquivo:

```ts
describe('competenciaBaseDaFatura', () => {
  it('a parcela 1 cai na propria fatura', () => {
    expect(competenciaBaseDaFatura('2026-12', 1)).toBe('2026-12');
  });

  it('recua numero - 1 meses, virando o ano', () => {
    expect(competenciaBaseDaFatura('2027-01', 3)).toBe('2026-11');
  });

  it('recusa numero de parcela invalido', () => {
    expect(() => competenciaBaseDaFatura('2026-12', 0)).toThrow('Numero de parcela invalido');
    expect(() => competenciaBaseDaFatura('2026-12', 1.5)).toThrow('Numero de parcela invalido');
  });
});

describe('mesesAoRedor', () => {
  it('vai de raio antes a raio depois, com o centro no meio', () => {
    expect(mesesAoRedor('2026-12', 2)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('com raio 12 cobre 25 meses', () => {
    expect(mesesAoRedor('2026-12', 12)).toHaveLength(25);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/parcelamento.test.ts src/domain/competencia.test.ts`
Expected: FAIL — os casos de faixa devolvem a compra inteira, e `competenciaBaseDaFatura` não
é função.

- [ ] **Passo 3: Implementar**

Em `src/domain/parcelamento.ts`, logo depois do tipo `ParcelaGerada`:

```ts
/**
 * Um trecho contiguo das parcelas de uma compra, pelos numeros, `inicial` e
 * `final` inclusive. Um lancamento grava exatamente a faixa dele: dividir um
 * parcelado (editar so uma parcela, ou dela em diante) parte a faixa em
 * pedacos, cada um um lancamento.
 */
export type Faixa = { inicial: number; final: number };
```

E troque a função `gerarParcelas` inteira por:

```ts
/**
 * Gera as parcelas de um lancamento.
 *
 * Com origem TOTAL, a divisao e em centavos e a diferenca de arredondamento vai
 * na ULTIMA parcela, de modo que a soma seja sempre exatamente o total.
 *
 * Com `faixa`, devolve so as parcelas dela — as mesmas, centavo por centavo, que
 * a compra inteira teria naqueles numeros. E o que garante que dividir um
 * parcelado sem mudar o valor nao mexe em nenhuma parcela.
 */
export function gerarParcelas(entrada: EntradaParcelamento, faixa?: Faixa): ParcelaGerada[] {
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

  const todas = valores.map((valor, indice) => ({
    numero: indice + 1,
    valorCentavos: valor,
    competencia: avancarCompetencia(competenciaBase, indice),
  }));
  if (!faixa) return todas;

  if (
    !Number.isInteger(faixa.inicial) ||
    !Number.isInteger(faixa.final) ||
    faixa.inicial < 1 ||
    faixa.final < faixa.inicial ||
    faixa.final > numeroParcelas
  ) {
    throw new Error(`Faixa invalida: ${faixa.inicial} a ${faixa.final} de ${numeroParcelas}`);
  }
  return todas.filter((p) => p.numero >= faixa.inicial && p.numero <= faixa.final);
}
```

Em `src/domain/competencia.ts`, depois de `avancarCompetencia`:

```ts
/**
 * A competencia da parcela 1, sabendo em qual Fatura cai a parcela `numero`.
 *
 * E a conversao entre o que a tela mostra — a Fatura da parcela que a pessoa
 * esta vendo — e o que o repositorio grava, a base da compra. A base pode cair
 * num mes travado ou no passado sem consequencia: e coordenada, nao parcela.
 */
export function competenciaBaseDaFatura(fatura: Competencia, numero: number): Competencia {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new Error(`Numero de parcela invalido: ${numero}`);
  }
  return avancarCompetencia(fatura, -(numero - 1));
}

/** Os meses de `raio` antes a `raio` depois de `centro`, em ordem: o seletor de Fatura. */
export function mesesAoRedor(centro: Competencia, raio: number): Competencia[] {
  const meses: Competencia[] = [];
  for (let deslocamento = -raio; deslocamento <= raio; deslocamento += 1) {
    meses.push(avancarCompetencia(centro, deslocamento));
  }
  return meses;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/domain/parcelamento.test.ts src/domain/competencia.test.ts`
Expected: PASS, inclusive os casos antigos dos dois arquivos.

Run: `npm test`
Expected: PASS, sem regressão.

- [ ] **Passo 5: Commit**

```bash
git add src/domain/parcelamento.ts src/domain/parcelamento.test.ts src/domain/competencia.ts src/domain/competencia.test.ts
git commit -m "$(cat <<'EOF'
Ensina o parcelamento a gerar uma faixa da compra, e a Fatura a virar base

Um lancamento vai poder gravar so parte das parcelas de uma compra, para
que editar dezembro nao reescreva novembro travado. A faixa sai da mesma
geracao da compra inteira, entao um pedaco sem mudanca de valor regera
exatamente as linhas que ja tinha.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 2: A trava, pura

**Arquivos:**
- Criar: `src/domain/trava.ts`
- Teste: `src/domain/trava.test.ts`

**Interfaces:**
- Consome: `competenciaBaseDaFatura`, `competenciaDeCartao`, `competenciaDeContaExterna`,
  `avancarCompetencia`, `formatarCompetencia`, `Competencia` de `./competencia` (Tarefa 1).
- Produz:
  - `const RAIO_DA_FATURA = 12`
  - `type FaturaTravada = { contaId: string; competencia: Competencia }`
  - `type ParcelaAlvo = { numero: number; competencia: Competencia }`
  - `type Trava = { numero: number; numeroParcelas: number; competencia: Competencia; contaNome: string }`
  - `competenciasTravadasDaConta(travadas: readonly FaturaTravada[], contaId: string): Set<Competencia>`
  - `acharTrava(parcelas: readonly ParcelaAlvo[], travadas: ReadonlySet<Competencia>): ParcelaAlvo | null`
  - `descreverTrava(trava: Trava): string`
  - `divergenciaDaData(dataCompra: string, conta: { tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null }, fatura: Competencia, numero: number): Competencia | null`

- [ ] **Passo 1: Escrever os testes que falham**

Criar `src/domain/trava.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { acharTrava, competenciasTravadasDaConta, descreverTrava, divergenciaDaData } from './trava';

describe('acharTrava', () => {
  it('acha a primeira parcela, pelo numero, que cai em mes travado', () => {
    const parcelas = [
      { numero: 3, competencia: '2026-12' },
      { numero: 2, competencia: '2026-11' },
      { numero: 1, competencia: '2026-10' },
    ];
    expect(acharTrava(parcelas, new Set(['2026-11', '2026-12']))).toEqual({
      numero: 2,
      competencia: '2026-11',
    });
  });

  it('devolve null quando nenhuma cai em mes travado', () => {
    expect(acharTrava([{ numero: 1, competencia: '2026-12' }], new Set(['2026-11']))).toBeNull();
  });
});

describe('competenciasTravadasDaConta', () => {
  it('fica so com os meses da conta pedida', () => {
    const travadas = [
      { contaId: 'c6', competencia: '2026-11' },
      { contaId: 'nubank', competencia: '2026-12' },
    ];
    expect(competenciasTravadasDaConta(travadas, 'c6')).toEqual(new Set(['2026-11']));
  });
});

describe('descreverTrava', () => {
  it('nomeia a parcela, o mes e o cartao', () => {
    expect(
      descreverTrava({ numero: 3, numeroParcelas: 6, competencia: '2026-11', contaNome: 'C6' }),
    ).toBe(
      'A parcela 3 cai em novembro de 2026, e a fatura do C6 desse mês está travada. ' +
        'Destrave-a no Resumo de novembro para mudá-la.',
    );
  });

  it('a vista fala do lancamento, e nao de parcela', () => {
    expect(
      descreverTrava({ numero: 1, numeroParcelas: 1, competencia: '2026-11', contaNome: 'C6' }),
    ).toBe(
      'Esse lançamento cai em novembro de 2026, e a fatura do C6 desse mês está travada. ' +
        'Destrave-a no Resumo de novembro para mudá-lo.',
    );
  });
});

describe('divergenciaDaData', () => {
  const c6 = { tipo: 'CARTAO' as const, diaFechamento: 4 };

  it('concorda: compra depois do fechamento cai no mes seguinte', () => {
    expect(divergenciaDaData('2026-11-19', c6, '2026-12', 1)).toBeNull();
  });

  it('diverge: compra de 3/nov cai em novembro, e nao em dezembro', () => {
    expect(divergenciaDaData('2026-11-03', c6, '2026-12', 1)).toBe('2026-11');
  });

  it('compara pela base: a parcela 9 de uma compra de abril concorda em dezembro', () => {
    expect(divergenciaDaData('2026-04-01', c6, '2026-12', 9)).toBeNull();
  });

  it('diz em que fatura a parcela cairia pela data', () => {
    expect(divergenciaDaData('2026-04-01', c6, '2027-01', 9)).toBe('2026-12');
  });

  it('conta externa usa o mes do pagamento', () => {
    expect(
      divergenciaDaData('2026-11-19', { tipo: 'EXTERNA', diaFechamento: null }, '2026-12', 1),
    ).toBe('2026-11');
  });

  it('data incompleta ou inexistente nao avisa', () => {
    expect(divergenciaDaData('', c6, '2026-12', 1)).toBeNull();
    expect(divergenciaDaData('2026-11', c6, '2026-12', 1)).toBeNull();
    expect(divergenciaDaData('2026-02-31', c6, '2026-12', 1)).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/trava.test.ts`
Expected: FAIL — `Failed to resolve import "./trava"`.

- [ ] **Passo 3: Implementar**

Criar `src/domain/trava.ts`:

```ts
import {
  avancarCompetencia,
  competenciaBaseDaFatura,
  competenciaDeCartao,
  competenciaDeContaExterna,
  formatarCompetencia,
  type Competencia,
} from './competencia';

/** Quantos meses o seletor de Fatura mostra para cada lado do mes da tela. */
export const RAIO_DA_FATURA = 12;

export type FaturaTravada = { contaId: string; competencia: Competencia };

/** Uma parcela, pelo que a barreira de trava precisa saber dela. */
export type ParcelaAlvo = { numero: number; competencia: Competencia };

/** O que a recusa de trava diz: qual parcela, em que mes, de que conta. */
export type Trava = {
  numero: number;
  numeroParcelas: number;
  competencia: Competencia;
  contaNome: string;
};

export function competenciasTravadasDaConta(
  travadas: readonly FaturaTravada[],
  contaId: string,
): Set<Competencia> {
  return new Set(travadas.filter((f) => f.contaId === contaId).map((f) => f.competencia));
}

/**
 * A primeira parcela, pelo numero, que cai num mes travado. `null` quando
 * nenhuma cai.
 *
 * A trava congela PARCELA, nao lancamento: quem chama passa so as parcelas que
 * a operacao apaga ou grava. Parcela que a operacao nao alcanca nao pode barrar
 * nada — barrar por ela era o defeito que impedia editar dezembro de um
 * parcelado que passava por novembro travado.
 */
export function acharTrava(
  parcelas: readonly ParcelaAlvo[],
  travadas: ReadonlySet<Competencia>,
): ParcelaAlvo | null {
  let achada: ParcelaAlvo | null = null;
  for (const parcela of parcelas) {
    if (!travadas.has(parcela.competencia)) continue;
    if (achada === null || parcela.numero < achada.numero) achada = parcela;
  }
  return achada;
}

/**
 * A frase da recusa. Nomeia a parcela, o mes e a conta porque a mensagem
 * antiga — "Esse mes ja esta fechado" — fazia pensar no mes aberto na tela, e
 * quem a obedecia ia procurar o Destravar na fatura errada.
 */
export function descreverTrava(trava: Trava): string {
  const mes = formatarCompetencia(trava.competencia);
  const soOMes = mes.slice(0, mes.indexOf(' de '));
  const parcelado = trava.numeroParcelas > 1;
  const quem = parcelado ? `A parcela ${trava.numero}` : 'Esse lançamento';
  const objeto = parcelado ? 'mudá-la' : 'mudá-lo';
  return (
    `${quem} cai em ${mes}, e a fatura do ${trava.contaNome} desse mês está travada. ` +
    `Destrave-a no Resumo de ${soOMes} para ${objeto}.`
  );
}

type ContaDaData = { tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

const DATA_COMPLETA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Em que Fatura a parcela `numero` cairia pela data, quando isso difere da
 * Fatura escolhida. `null` quando concordam, e quando a data ainda nao e uma
 * data — o aviso nao e lugar para lancar.
 *
 * Compara as competencias BASE, e nao as Faturas: a parcela 9 de uma compra de
 * abril, aberta em dezembro, concorda com a data, ainda que dezembro nao seja
 * abril.
 */
export function divergenciaDaData(
  dataCompra: string,
  conta: ContaDaData,
  fatura: Competencia,
  numero: number,
): Competencia | null {
  if (!DATA_COMPLETA.test(dataCompra)) return null;

  let basePelaData: Competencia;
  try {
    basePelaData =
      conta.tipo === 'CARTAO' && conta.diaFechamento !== null
        ? competenciaDeCartao(dataCompra, conta.diaFechamento)
        : competenciaDeContaExterna(dataCompra);
  } catch {
    // Data fora do calendario (31 de fevereiro): as funcoes de competencia
    // lancam, e aqui isso so quer dizer "nao ha o que comparar ainda".
    return null;
  }

  if (basePelaData === competenciaBaseDaFatura(fatura, numero)) return null;
  return avancarCompetencia(basePelaData, numero - 1);
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/domain/trava.test.ts`
Expected: PASS.

Se o caso `'2026-02-31'` falhar porque `competenciaDeCartao` aceitou a data, leia
`partesDaData` em `src/domain/data.ts`: o caso existe para provar que data inexistente não
lança daqui. Ajuste só o `try`, nunca a função de domínio alheia.

- [ ] **Passo 5: Commit**

```bash
git add src/domain/trava.ts src/domain/trava.test.ts
git commit -m "$(cat <<'EOF'
Da a trava uma regra pura que diz qual parcela, mes e cartao estao travados

A recusa "Esse mes ja esta fechado" fazia pensar no mes da tela, e quem
a seguia ia destravar a fatura errada. A frase nova sai do dominio, e a
busca da parcela travada recebe so as parcelas que a operacao toca.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 3: A divisão, pura

**Arquivos:**
- Criar: `src/domain/divisao.ts`
- Teste: `src/domain/divisao.test.ts`

**Interfaces:**
- Consome: `Faixa` de `./parcelamento`; `avancarCompetencia` de `./competencia`;
  `ParcelaAlvo` de `./trava` (Tarefas 1 e 2).
- Produz:
  - `type Alcance = 'SO_ESTA' | 'ESTA_E_SEGUINTES' | 'TODAS'`
  - `const ALCANCES: readonly Alcance[]` — na ordem do menos ao mais abrangente
  - `type PlanoDeDivisao = { tipo: 'NO_LUGAR'; alcance: Faixa } | { tipo: 'DIVIDIR'; original: Faixa; alcance: Faixa; depois: Faixa | null }`
  - `faixaDoLancamento(l: { parcelaInicial: number; parcelaFinal: number | null; numeroParcelas: number }): Faixa`
  - `colunasDaFaixa(faixa: Faixa, numeroParcelas: number): { parcelaInicial: number; parcelaFinal: number | null }`
  - `alcanceDaFaixa(faixa: Faixa, numero: number, alcance: Alcance): Faixa`
  - `planejarDivisao(faixa: Faixa, numero: number, alcance: Alcance): PlanoDeDivisao`
  - `faixaEscrita(alcance: Faixa, totalAntigo: number, totalNovo: number): Faixa | null`
  - `minimoDeParcelas(alcance: Faixa, totalAntigo: number): number`
  - `parcelasDaFaixa(faixa: Faixa, referencia: ParcelaAlvo): ParcelaAlvo[]`
  - `rotuloDaFaixa(faixa: Faixa, numeroParcelas: number): string | null`

- [ ] **Passo 1: Escrever os testes que falham**

Criar `src/domain/divisao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALCANCES,
  alcanceDaFaixa,
  colunasDaFaixa,
  faixaDoLancamento,
  faixaEscrita,
  minimoDeParcelas,
  parcelasDaFaixa,
  planejarDivisao,
  rotuloDaFaixa,
} from './divisao';

const doze = { inicial: 1, final: 12 };

describe('faixaDoLancamento e colunasDaFaixa', () => {
  it('le parcelaFinal nulo como ate a ultima parcela', () => {
    expect(faixaDoLancamento({ parcelaInicial: 1, parcelaFinal: null, numeroParcelas: 12 })).toEqual(doze);
    expect(faixaDoLancamento({ parcelaInicial: 4, parcelaFinal: 6, numeroParcelas: 12 })).toEqual({
      inicial: 4,
      final: 6,
    });
  });

  it('grava a ultima parcela como nulo, e o resto pelo numero', () => {
    expect(colunasDaFaixa(doze, 12)).toEqual({ parcelaInicial: 1, parcelaFinal: null });
    expect(colunasDaFaixa({ inicial: 1, final: 3 }, 12)).toEqual({ parcelaInicial: 1, parcelaFinal: 3 });
  });
});

describe('alcanceDaFaixa', () => {
  it('da cada alcance a partir da parcela 4', () => {
    expect(alcanceDaFaixa(doze, 4, 'SO_ESTA')).toEqual({ inicial: 4, final: 4 });
    expect(alcanceDaFaixa(doze, 4, 'ESTA_E_SEGUINTES')).toEqual({ inicial: 4, final: 12 });
    expect(alcanceDaFaixa(doze, 4, 'TODAS')).toEqual(doze);
  });

  it('recusa parcela fora da faixa do lancamento', () => {
    expect(() => alcanceDaFaixa({ inicial: 4, final: 12 }, 3, 'SO_ESTA')).toThrow('fora da faixa');
  });
});

describe('planejarDivisao', () => {
  it('todas edita no lugar', () => {
    expect(planejarDivisao(doze, 4, 'TODAS')).toEqual({ tipo: 'NO_LUGAR', alcance: doze });
  });

  it('esta e as seguintes a partir da primeira e o mesmo que todas', () => {
    expect(planejarDivisao(doze, 1, 'ESTA_E_SEGUINTES')).toEqual({ tipo: 'NO_LUGAR', alcance: doze });
  });

  it('esta e as seguintes no meio: o original fica com as de antes', () => {
    expect(planejarDivisao(doze, 4, 'ESTA_E_SEGUINTES')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 3 },
      alcance: { inicial: 4, final: 12 },
      depois: null,
    });
  });

  it('so esta no meio: tres pedacos, e o de depois vira lancamento novo', () => {
    expect(planejarDivisao(doze, 4, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 3 },
      alcance: { inicial: 4, final: 4 },
      depois: { inicial: 5, final: 12 },
    });
  });

  it('so esta na ultima: dois pedacos', () => {
    expect(planejarDivisao(doze, 12, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 11 },
      alcance: { inicial: 12, final: 12 },
      depois: null,
    });
  });

  it('so esta na primeira: o original fica com as de depois, sem mover linha', () => {
    expect(planejarDivisao(doze, 1, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 2, final: 12 },
      alcance: { inicial: 1, final: 1 },
      depois: null,
    });
  });

  it('faixa de uma parcela so: qualquer alcance edita no lugar', () => {
    const uma = { inicial: 7, final: 7 };
    for (const alcance of ALCANCES) {
      expect(planejarDivisao(uma, 7, alcance)).toEqual({ tipo: 'NO_LUGAR', alcance: uma });
    }
  });

  it('respeita a faixa de um pedaco que ja foi dividido', () => {
    expect(planejarDivisao({ inicial: 4, final: 12 }, 6, 'ESTA_E_SEGUINTES')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 4, final: 5 },
      alcance: { inicial: 6, final: 12 },
      depois: null,
    });
  });
});

describe('faixaEscrita e minimoDeParcelas', () => {
  it('o alcance que vai ate a ultima acompanha o total novo', () => {
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 15)).toEqual({ inicial: 4, final: 15 });
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 4)).toEqual({ inicial: 4, final: 4 });
  });

  it('total novo menor que a parcela editada nao comporta', () => {
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 3)).toBeNull();
    expect(minimoDeParcelas({ inicial: 4, final: 12 }, 12)).toBe(4);
  });

  it('alcance que para antes da ultima nao se mexe, e exige o total ate ele', () => {
    expect(faixaEscrita({ inicial: 4, final: 4 }, 12, 12)).toEqual({ inicial: 4, final: 4 });
    expect(faixaEscrita({ inicial: 1, final: 3 }, 12, 2)).toBeNull();
    expect(minimoDeParcelas({ inicial: 1, final: 3 }, 12)).toBe(3);
  });
});

describe('parcelasDaFaixa', () => {
  it('poe cada parcela no mes certo a partir da que a pessoa esta vendo', () => {
    expect(parcelasDaFaixa({ inicial: 2, final: 4 }, { numero: 3, competencia: '2026-12' })).toEqual([
      { numero: 2, competencia: '2026-11' },
      { numero: 3, competencia: '2026-12' },
      { numero: 4, competencia: '2027-01' },
    ]);
  });
});

describe('rotuloDaFaixa', () => {
  it('a compra inteira nao tem rotulo', () => {
    expect(rotuloDaFaixa(doze, 12)).toBeNull();
  });

  it('descreve o pedaco', () => {
    expect(rotuloDaFaixa({ inicial: 4, final: 12 }, 12)).toBe('parcelas 4 a 12 de 12');
    expect(rotuloDaFaixa({ inicial: 7, final: 7 }, 12)).toBe('parcela 7 de 12');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx vitest run src/domain/divisao.test.ts`
Expected: FAIL — `Failed to resolve import "./divisao"`.

- [ ] **Passo 3: Implementar**

Criar `src/domain/divisao.ts`:

```ts
import { avancarCompetencia } from './competencia';
import type { Faixa } from './parcelamento';
import type { ParcelaAlvo } from './trava';

/**
 * Quanto de um parcelado uma edicao ou exclusao alcanca, a partir da parcela
 * que a pessoa clicou. E o alcance que decide quais parcelas a operacao
 * reescreve — e so essas passam pela barreira de fatura travada.
 */
export type Alcance = 'SO_ESTA' | 'ESTA_E_SEGUINTES' | 'TODAS';

/** Do menos ao mais abrangente: e a ordem do controle e a do padrao. */
export const ALCANCES: readonly Alcance[] = ['SO_ESTA', 'ESTA_E_SEGUINTES', 'TODAS'];

/**
 * O que fazer com um lancamento para alcancar so parte dele.
 *
 * `NO_LUGAR`: o alcance e a faixa inteira, e o lancamento e editado como
 * sempre foi.
 *
 * `DIVIDIR`: o lancamento original fica com `original`, com os campos e as
 * linhas de hoje, sem tocar nelas; `alcance` vira um lancamento novo; e
 * `depois`, quando existe, vira um terceiro, com os campos de hoje, para onde
 * as linhas sao MOVIDAS sem mudar.
 */
export type PlanoDeDivisao =
  | { tipo: 'NO_LUGAR'; alcance: Faixa }
  | { tipo: 'DIVIDIR'; original: Faixa; alcance: Faixa; depois: Faixa | null };

type ColunasDaFaixa = { parcelaInicial: number; parcelaFinal: number | null };

/** A faixa que um lancamento grava, lida das colunas dele. */
export function faixaDoLancamento(l: ColunasDaFaixa & { numeroParcelas: number }): Faixa {
  return { inicial: l.parcelaInicial, final: l.parcelaFinal ?? l.numeroParcelas };
}

/**
 * As colunas que gravam uma faixa. "Ate a ultima parcela" se grava sempre como
 * `parcelaFinal` nulo, a forma que os lancamentos de antes da divisao ja tem:
 * assim um lancamento inteiro continua identico ao de sempre.
 */
export function colunasDaFaixa(faixa: Faixa, numeroParcelas: number): ColunasDaFaixa {
  return {
    parcelaInicial: faixa.inicial,
    parcelaFinal: faixa.final === numeroParcelas ? null : faixa.final,
  };
}

/** As parcelas que o alcance escolhido a partir de `numero` reescreve. */
export function alcanceDaFaixa(faixa: Faixa, numero: number, alcance: Alcance): Faixa {
  if (!Number.isInteger(numero) || numero < faixa.inicial || numero > faixa.final) {
    throw new Error(`Parcela ${numero} fora da faixa ${faixa.inicial} a ${faixa.final}`);
  }
  switch (alcance) {
    case 'TODAS':
      return faixa;
    case 'ESTA_E_SEGUINTES':
      return { inicial: numero, final: faixa.final };
    case 'SO_ESTA':
      return { inicial: numero, final: numero };
  }
}

export function planejarDivisao(faixa: Faixa, numero: number, alcance: Alcance): PlanoDeDivisao {
  const alvo = alcanceDaFaixa(faixa, numero, alcance);
  const antes: Faixa | null =
    alvo.inicial > faixa.inicial ? { inicial: faixa.inicial, final: alvo.inicial - 1 } : null;
  const depois: Faixa | null =
    alvo.final < faixa.final ? { inicial: alvo.final + 1, final: faixa.final } : null;

  // O original fica com o pedaco de ANTES quando ele existe: e onde mora o mes
  // travado no caso comum, e assim ele nunca muda de id nem de linha.
  if (antes) return { tipo: 'DIVIDIR', original: antes, alcance: alvo, depois };
  // Sem antes, o original fica com o de depois — tambem sem mover linha.
  if (depois) return { tipo: 'DIVIDIR', original: depois, alcance: alvo, depois: null };
  return { tipo: 'NO_LUGAR', alcance: alvo };
}

/**
 * A faixa que o pedaco reescrito ocupa depois da edicao, com o total novo.
 *
 * Se o alcance ia ate a ultima parcela, ele acompanha o total novo — e assim
 * que "esta e as seguintes" renegocia o resto. Se parava antes, a ponta fica
 * onde estava. `null` quando o total novo nao comporta o alcance.
 */
export function faixaEscrita(alcance: Faixa, totalAntigo: number, totalNovo: number): Faixa | null {
  const final = alcance.final === totalAntigo ? totalNovo : alcance.final;
  if (final < alcance.inicial || final > totalNovo) return null;
  return { inicial: alcance.inicial, final };
}

/** O menor total de parcelas que `faixaEscrita` aceita para este alcance: o `min` do campo. */
export function minimoDeParcelas(alcance: Faixa, totalAntigo: number): number {
  return alcance.final === totalAntigo ? alcance.inicial : alcance.final;
}

/** As parcelas de uma faixa e o mes de cada uma, a partir de uma parcela conhecida. */
export function parcelasDaFaixa(faixa: Faixa, referencia: ParcelaAlvo): ParcelaAlvo[] {
  const parcelas: ParcelaAlvo[] = [];
  for (let numero = faixa.inicial; numero <= faixa.final; numero += 1) {
    parcelas.push({
      numero,
      competencia: avancarCompetencia(referencia.competencia, numero - referencia.numero),
    });
  }
  return parcelas;
}

/**
 * Como a busca e a lixeira descrevem um lancamento que nao tem a compra
 * inteira. `null` quando tem: ai o "12x" de sempre basta.
 */
export function rotuloDaFaixa(faixa: Faixa, numeroParcelas: number): string | null {
  if (faixa.inicial === 1 && faixa.final === numeroParcelas) return null;
  if (faixa.inicial === faixa.final) return `parcela ${faixa.inicial} de ${numeroParcelas}`;
  return `parcelas ${faixa.inicial} a ${faixa.final} de ${numeroParcelas}`;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx vitest run src/domain/divisao.test.ts`
Expected: PASS.

Run: `npm test` e `npx tsc --noEmit`
Expected: os dois sem erro.

- [ ] **Passo 5: Commit**

```bash
git add src/domain/divisao.ts src/domain/divisao.test.ts
git commit -m "$(cat <<'EOF'
Da a divisao de um parcelado uma regra pura, antes de qualquer banco

Editar so uma parcela, ou dela em diante, parte o lancamento em pedacos.
Quem fica com o id e com as linhas de antes e decidido aqui, para que a
parte onde mora o mes travado nunca seja reescrita.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 4: A faixa no banco, e a barreira que nomeia

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20261119120000_faixa_de_parcelas/migration.sql`
- Modificar: `src/server/repositorios/lancamento.ts`
- Teste: `src/server/repositorios/lancamento.test.ts`

**Interfaces:**
- Consome: `gerarParcelas`, `Faixa`, `ParcelaGerada` (Tarefa 1); `acharTrava`, `ParcelaAlvo`,
  `Trava` (Tarefa 2); `colunasDaFaixa`, `faixaDoLancamento`, `faixaEscrita` (Tarefa 3).
- Produz:
  - Colunas `Lancamento.parcelaInicial Int @default(1)` e `Lancamento.parcelaFinal Int?`
  - `EntradaLancamento.parcelaInicial?: number | undefined`
  - `type RecusaTravada = { ok: false; motivo: 'FATURA_TRAVADA'; travada: Trava }`
  - `type ResultadoGravacao = { ok: true } | RecusaTravada | { ok: false; motivo: 'CONFLITO'; atual?: unknown }`
  - `type ResultadoCriacao = { ok: true; id: string } | RecusaTravada`
  - Helpers internos que as Tarefas 5 e 6 usam: `lerOriginal`, `conflito`, `recusa`,
    `travaEntre`, `marcasDe`, `gravarParcelas`, `gravarRateio`, `camposGravaveis`,
    `paraParcelamento`
  - Assinaturas desta tarefa: `criarLancamento(entrada)`, `editarLancamento(id, versao, entrada)`,
    `excluirLancamento(id, versao)`, `restaurarLancamento(id, versao)` — as duas do meio ganham
    alcance nas Tarefas 5 e 6.

- [ ] **Passo 1: Escrever os testes que falham**

Em `src/server/repositorios/lancamento.test.ts`:

1. Junto de `let membroId: string;`, declare `let nomeDoC6: string;`, e no `beforeAll`, depois
   de ler `membroId`:

```ts
    // A recusa de trava traz o nome da conta; o seed chama a conta-c6 de algum
    // nome, e o teste nao deve adivinhar qual.
    nomeDoC6 = (await prisma.conta.findUniqueOrThrow({ where: { id: 'conta-c6' } })).nome;
```

2. Logo depois de `criarOk`, acrescente:

```ts
  const linhasDe = (lancamentoId: string) =>
    prisma.parcela.findMany({ where: { lancamentoId }, orderBy: { numero: 'asc' } });
```

3. Troque as asserções de três testes existentes para exigir a parcela nomeada:

Em `'recusa editar lancamento com parcela em fatura travada'`, troque as duas últimas linhas por:

```ts
    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 1, numeroParcelas: 1, competencia: '2026-08', contaNome: nomeDoC6 },
    });
```

Em `'recusa criar lancamento numa competencia com fatura travada, sem gravar nada'`, troque
`expect(resultado.ok).toBe(false);` e a linha seguinte pelo mesmo `toEqual` acima.

Em `'recusa restaurar para dentro de fatura travada depois da exclusao'`, troque
`expect(resultado.ok).toBe(false);` e a linha seguinte pelo mesmo `toEqual` acima.

4. No fim do `describe`, os casos novos:

```ts
  it('cria a partir da parcela 3, gravando so as parcelas 3 a 6', async () => {
    // A Fatura de dezembro para a parcela 3 pos a base, a parcela 1, em outubro.
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo).toMatchObject({ parcelaInicial: 3, parcelaFinal: null });
    expect((await linhasDe(id)).map((p) => [p.numero, p.competencia])).toEqual([
      [3, '2026-12'],
      [4, '2027-01'],
      [5, '2027-02'],
      [6, '2027-03'],
    ]);
  });

  it('cria a partir da parcela 3 mesmo com a base num mes travado', async () => {
    // A parcela 1 nao e gravada: o mes dela estar travado nao barra nada.
    await travarFatura('2026-10');

    const resultado = await criarLancamento({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    expect(resultado.ok).toBe(true);
  });

  it('recusa criar parcelado quando uma parcela do meio cai em mes travado, nomeando-a', async () => {
    await travarFatura('2026-11');

    const resultado = await criarLancamento({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
    });

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 2, numeroParcelas: 3, competencia: '2026-11', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(0);
  });

  it('edita no lugar um lancamento que comeca na parcela 3 sem recriar as de antes', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    const resultado = await editarLancamento(id, 1, {
      ...entrada(),
      numeroParcelas: 6,
      descricao: 'corrigida',
      competenciaManual: '2026-10',
    });

    expect(resultado.ok).toBe(true);
    expect((await linhasDe(id)).map((p) => p.numero)).toEqual([3, 4, 5, 6]);
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:banco -- src/server/repositorios/lancamento.test.ts`
Expected: FAIL — os casos de criar com `parcelaInicial` gravam as seis parcelas (ou o Prisma
recusa a coluna desconhecida no `toMatchObject`), e as recusas não trazem `travada`.

- [ ] **Passo 3: Schema e migration**

Em `prisma/schema.prisma`, no `model Lancamento`, logo depois de `numeroParcelas`:

```prisma
  // A faixa da compra que ESTE lancamento grava: as parcelas `parcelaInicial`
  // a `parcelaFinal`, inclusive; `parcelaFinal` nulo e ate `numeroParcelas`,
  // que continua sendo o total da compra (o 12 de "4/12"). Editar ou excluir
  // parte de um parcelado divide a faixa em pedacos, cada um um lancamento —
  // ver docs/specs/2026-11-19-trava-por-parcela-design.md.
  parcelaInicial  Int              @default(1)
  parcelaFinal    Int?
```

Criar `prisma/migrations/20261119120000_faixa_de_parcelas/migration.sql`:

```sql
-- Um lancamento passa a ser uma FAIXA das parcelas de uma compra: editar ou
-- excluir so parte de um parcelado divide o lancamento, e cada pedaco guarda a
-- sua. Os lancamentos existentes ficam com a faixa inteira (1 ate o fim), que
-- e o que eles ja sao. So de adicao: o codigo de antes continua funcionando com
-- o banco novo (docs/arquitetura.md, armadilha 23).

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "parcelaFinal" INTEGER,
ADD COLUMN     "parcelaInicial" INTEGER NOT NULL DEFAULT 1;
```

Run: `npx prisma generate`
Expected: `Generated Prisma Client`. **Não** rode `migrate dev` (ver Restrições globais).

- [ ] **Passo 4: Reescrever a barreira e a criação**

Em `src/server/repositorios/lancamento.ts`:

**4a. Imports.** Troque as quatro primeiras linhas de import por:

```ts
import { competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import { colunasDaFaixa, faixaDoLancamento, faixaEscrita } from '@/domain/divisao';
import { gerarParcelas, type Faixa, type ParcelaGerada } from '@/domain/parcelamento';
import { pesosMeioAMeio } from '@/domain/rateio';
import { acharTrava, type ParcelaAlvo, type Trava } from '@/domain/trava';
import type { Prisma } from '@prisma/client';
```

(`import { prisma } from '../db';` continua.)

**4b. Entrada e resultados.** Em `EntradaLancamento`, logo depois de `competenciaManual`:

```ts
  /**
   * A primeira parcela que o lancamento grava; padrao 1. E para lancar a
   * compra antiga que so agora apareceu: com 3 de 6, grava as parcelas 3 a 6,
   * e a 1 e a 2 nao existem. So `criarLancamento` le — na edicao, a faixa vem
   * do proprio lancamento.
   */
  parcelaInicial?: number | undefined;
```

Troque os tipos `ResultadoGravacao` e `ResultadoCriacao` por:

```ts
/** A recusa da trava diz qual parcela, em que mes e de que conta — ver `descreverTrava`. */
export type RecusaTravada = { ok: false; motivo: 'FATURA_TRAVADA'; travada: Trava };

export type ResultadoGravacao =
  | { ok: true }
  | RecusaTravada
  | { ok: false; motivo: 'CONFLITO'; atual?: unknown };

export type ResultadoCriacao = { ok: true; id: string } | RecusaTravada;
```

**4c. Helpers.** Apague `competenciasDe`, `temFaturaTravada`, `competenciasTravadas` e
`gravarFilhos` inteiros (com os comentários). `camposDeReembolso` e `competenciaBaseDe` ficam.
No lugar dos que saíram, logo depois de `competenciaBaseDe`:

```ts
/** Os campos do lancamento que a tela escreve, prontos para o Prisma. */
function camposGravaveis(entrada: EntradaLancamento) {
  return {
    descricao: entrada.descricao,
    valorCentavos: entrada.valorCentavos,
    origemValor: entrada.origemValor,
    dataCompra: entrada.dataCompra,
    numeroParcelas: entrada.numeroParcelas,
    escopo: entrada.escopo,
    contaId: entrada.contaId,
    categoriaId: entrada.categoriaId,
    membroId: entrada.escopo === 'PESSOAL' ? (entrada.membroId ?? null) : null,
    ...camposDeReembolso(entrada),
  };
}

function paraParcelamento(entrada: EntradaLancamento, competenciaBase: string) {
  return {
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  };
}

/**
 * A primeira parcela, entre as informadas, que cai numa fatura TRAVADA desta
 * conta — com o nome da conta, para a recusa dizer onde esta o problema.
 *
 * **Recebe so as parcelas que a operacao apaga ou grava.** A trava congela
 * parcela, nao lancamento: quando esta barreira olhava o lancamento inteiro,
 * travar novembro impedia editar dezembro de todo parcelado que passasse por
 * novembro, e a recusa dizia "esse mes" sem dizer qual.
 *
 * Fica dentro da transacao da gravacao, como antes: conferir fora deixava uma
 * janela em que a outra pessoa travava a fatura entre a verificacao e a escrita.
 */
async function travaEntre(
  db: ClienteBanco,
  contaId: string,
  numeroParcelas: number,
  parcelas: readonly ParcelaAlvo[],
): Promise<Trava | null> {
  if (parcelas.length === 0) return null;

  const travadas = await db.fatura.findMany({
    where: {
      status: 'TRAVADA',
      contaId,
      competencia: { in: [...new Set(parcelas.map((p) => p.competencia))] },
    },
    select: { competencia: true, conta: { select: { nome: true } } },
  });
  const achada = acharTrava(parcelas, new Set(travadas.map((f) => f.competencia)));
  if (!achada) return null;

  // So os quatro campos: `achada` pode ser uma linha inteira do Prisma, e o
  // resultado viaja ate a tela.
  return {
    numero: achada.numero,
    competencia: achada.competencia,
    numeroParcelas,
    contaNome: travadas.find((f) => f.competencia === achada.competencia)?.conta.nome ?? contaId,
  };
}

function recusa(travada: Trava): RecusaTravada {
  return { ok: false, motivo: 'FATURA_TRAVADA', travada };
}

/** A recusa por versao: devolve o registro como esta agora, para a tela mostrar. */
async function conflito(db: ClienteBanco, id: string): Promise<ResultadoGravacao> {
  const atual = await db.lancamento.findUnique({ where: { id } });
  return { ok: false, motivo: 'CONFLITO', atual };
}

/** O lancamento com as linhas e o rateio: tudo o que editar, excluir e restaurar leem dele. */
function lerOriginal(db: ClienteBanco, id: string) {
  return db.lancamento.findUnique({
    where: { id },
    include: { parcelas: { orderBy: { numero: 'asc' } }, rateios: true },
  });
}

/**
 * As marcas que uma parcela carrega e que nao podem se perder quando ela e
 * regerada: cancelada (quitacao antecipada) nao pode "ressuscitar", e parcela
 * de reembolso ja devolvida nao pode voltar a ser devida. A chave estavel
 * entre a linha velha e a nova e o numero.
 */
type Marcas = { cancelados: ReadonlySet<number>; recebidos: ReadonlySet<number> };

const SEM_MARCAS: Marcas = { cancelados: new Set(), recebidos: new Set() };

function marcasDe(
  linhas: readonly { numero: number; cancelada: boolean; reembolsoRecebido: boolean }[],
): Marcas {
  return {
    cancelados: new Set(linhas.filter((l) => l.cancelada).map((l) => l.numero)),
    recebidos: new Set(linhas.filter((l) => l.reembolsoRecebido).map((l) => l.numero)),
  };
}

/**
 * Grava parcelas ja geradas. Criar passa `SEM_MARCAS` e nao le nem apaga
 * nada: um lancamento que acabou de nascer nao tem filho nenhum (cada ida ao
 * Neon custa ~45 ms, e foi isso que cortou a criacao de 10 consultas para 6).
 */
async function gravarParcelas(
  db: ClienteBanco,
  lancamentoId: string,
  parcelas: readonly ParcelaGerada[],
  ehReembolso: boolean,
  marcas: Marcas,
): Promise<void> {
  await db.parcela.createMany({
    data: parcelas.map((p) => ({
      ...p,
      lancamentoId,
      cancelada: marcas.cancelados.has(p.numero),
      // Desligar a marca de reembolso apaga o recebido, como apaga o devedor:
      // religa-la depois nao pode trazer de volta o estado de outra epoca.
      reembolsoRecebido: ehReembolso && marcas.recebidos.has(p.numero),
    })),
  });
}

/**
 * Grava so os percentuais. O valor de cada cota e calculado por `ratear()` na
 * leitura, sobre o valor DA PARCELA — ver Tarefa 10 da Fase 1.
 */
async function gravarRateio(
  db: ClienteBanco,
  lancamentoId: string,
  escopo: 'PESSOAL' | 'CONJUNTO',
): Promise<void> {
  if (escopo !== 'CONJUNTO') return;
  const membros = await db.membro.findMany({
    where: { ativo: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  });
  const pesos = pesosMeioAMeio(membros.map((m) => m.id));
  await db.rateio.createMany({
    data: pesos.map((p) => ({ lancamentoId, membroId: p.membroId, percentual: p.percentual })),
  });
}
```

**4d. `criarLancamento`.** Troque a função inteira por:

```ts
export async function criarLancamento(entrada: EntradaLancamento): Promise<ResultadoCriacao> {
  return prisma.$transaction(async (tx) => {
    const competenciaBase = await competenciaBaseDe(tx, entrada);
    // A faixa que este lancamento grava: da parcela inicial ate o fim. As de
    // antes nao existem, e por isso nao passam pela barreira.
    const faixa: Faixa = { inicial: entrada.parcelaInicial ?? 1, final: entrada.numeroParcelas };
    const parcelas = gerarParcelas(paraParcelamento(entrada, competenciaBase), faixa);

    const travada = await travaEntre(tx, entrada.contaId, entrada.numeroParcelas, parcelas);
    if (travada) return recusa(travada);

    const lancamento = await tx.lancamento.create({
      data: {
        ...camposGravaveis(entrada),
        ...colunasDaFaixa(faixa, entrada.numeroParcelas),
        // So entram juntos: marca pela metade nao identifica nada, e o indice
        // unico e sobre o par.
        ...(entrada.recorrenteId && entrada.competenciaRecorrente
          ? {
              recorrenteId: entrada.recorrenteId,
              competenciaRecorrente: entrada.competenciaRecorrente,
            }
          : {}),
      },
    });

    await gravarParcelas(tx, lancamento.id, parcelas, entrada.ehReembolso === true, SEM_MARCAS);
    await gravarRateio(tx, lancamento.id, entrada.escopo);
    return { ok: true, id: lancamento.id };
  });
}
```

**4e. `editarLancamento`.** Troque a função inteira por (a Tarefa 5 acrescenta o alcance):

```ts
export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const faixa = faixaDoLancamento(original);
    const faixaNova = faixaEscrita(faixa, original.numeroParcelas, entrada.numeroParcelas);
    if (!faixaNova) {
      throw new Error(
        `Total de ${entrada.numeroParcelas} parcelas nao comporta as parcelas ${faixa.inicial} a ${faixa.final}`,
      );
    }
    const competenciaBase = await competenciaBaseDe(tx, entrada);
    const entram = gerarParcelas(paraParcelamento(entrada, competenciaBase), faixaNova);

    // Origem e destino: onde as parcelas estao hoje, e para onde a edicao as
    // levaria (conta, data ou Fatura podem mudar o mes).
    const travada =
      (await travaEntre(tx, original.contaId, original.numeroParcelas, original.parcelas)) ??
      (await travaEntre(tx, entrada.contaId, entrada.numeroParcelas, entram));
    if (travada) return recusa(travada);

    // O lock otimista de verdade: a leitura de cima pode ter envelhecido.
    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data: {
        ...camposGravaveis(entrada),
        ...colunasDaFaixa(faixaNova, entrada.numeroParcelas),
        versao: { increment: 1 },
      },
    });
    if (alteradas.count === 0) return conflito(tx, id);

    // Versao incrementada e filhos regravados na mesma transacao. Separados,
    // uma falha aqui deixava o lancamento com os valores novos, as parcelas
    // velhas, e a versao ja gasta — a retentativa caia em CONFLITO.
    await tx.parcela.deleteMany({ where: { lancamentoId: id } });
    await gravarParcelas(tx, id, entram, entrada.ehReembolso === true, marcasDe(original.parcelas));
    await tx.rateio.deleteMany({ where: { lancamentoId: id } });
    await gravarRateio(tx, id, entrada.escopo);
    return { ok: true };
  });
}
```

**4f. `excluirLancamento`.** Troque a função inteira por (a Tarefa 6 acrescenta o alcance):

```ts
export async function excluirLancamento(id: string, versao: number): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const travada = await travaEntre(tx, original.contaId, original.numeroParcelas, original.parcelas);
    if (travada) return recusa(travada);

    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data: { deletadoEm: new Date(), versao: { increment: 1 } },
    });
    if (alteradas.count === 0) return conflito(tx, id);
    return { ok: true };
  });
}
```

**4g. `restaurarLancamento`.** Troque a primeira linha do corpo da transação
(`if (await competenciasTravadas(tx, id)) ...`) por:

```ts
    const original = await lerOriginal(tx, id);
    if (original) {
      const travada = await travaEntre(tx, original.contaId, original.numeroParcelas, original.parcelas);
      if (travada) return recusa(travada);
    }
```

E troque o bloco final `if (alteradas.count === 0) { ... }` dela por
`if (alteradas.count === 0) return conflito(tx, id);`.

`marcarReembolso` não muda.

- [ ] **Passo 5: Rodar e ver passar**

Run: `npm run test:banco -- src/server/repositorios/lancamento.test.ts`
Expected: PASS — os casos novos e todos os antigos (lock otimista, reembolso, cancelada,
restaurar).

Run: `npx tsc --noEmit`
Expected: sem erro. Os consumidores da recusa (`painel-lancamento.tsx`, `dialogo-exclusao.tsx`,
`lista-lixeira.tsx`, `recorrente.ts`) só leem `ok` e `motivo`, e continuam compilando.

Run: `npm run test:banco`
Expected: PASS, a suíte inteira, inclusive `recorrente.test.ts` e `busca.test.ts`.

- [ ] **Passo 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261119120000_faixa_de_parcelas src/server/repositorios/lancamento.ts src/server/repositorios/lancamento.test.ts
git commit -m "$(cat <<'EOF'
Faz o lancamento gravar uma faixa, e a trava barrar so as parcelas tocadas

A barreira olhava o lancamento inteiro: travar novembro congelava todo
parcelado que passasse por novembro, e a recusa nao dizia qual mes. Agora
ela recebe as parcelas que a operacao apaga ou grava, e devolve qual delas
esta travada, com o mes e a conta. A migration so acrescenta colunas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 5: Editar só esta, ou esta e as seguintes

**Arquivos:**
- Modificar: `src/server/repositorios/lancamento.ts`
- Teste: `src/server/repositorios/lancamento.test.ts`

**Interfaces:**
- Consome: os helpers da Tarefa 4; `planejarDivisao`, `type Alcance` (Tarefa 3);
  `avancarCompetencia` de `@/domain/competencia`.
- Produz:
  - `editarLancamento(id: string, versao: number, entrada: EntradaLancamento, alcance?: Alcance, numero?: number): Promise<ResultadoGravacao>` — `alcance` padrão `'TODAS'`, `numero` padrão a primeira parcela da faixa
  - Helpers internos que a Tarefa 6 usa: `type Original`, `dentro(faixa, numero)` e
    `separar(db, original: Original, faixa: Faixa, deletadoEm: Date | null): Promise<string>`

- [ ] **Passo 1: Escrever os testes que falham**

No fim do `describe` de `src/server/repositorios/lancamento.test.ts`. **O primeiro é o caso de
19/11**:

```ts
  it('edita so a parcela de dezembro de um parcelado com novembro travado', async () => {
    // 3x a partir de outubro: 2026-10, 2026-11, 2026-12. Novembro fecha.
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);
    await travarFatura('2026-11');

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, valorCentavos: 2650 },
      'SO_ESTA',
      3,
    );

    expect(resultado).toEqual({ ok: true });
    // O original fica com 1 e 2 — as MESMAS linhas — e passa a parar na 2.
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ parcelaInicial: 1, parcelaFinal: 2, versao: 2, valorCentavos: 2500 });
    expect((await linhasDe(id)).map((p) => [p.id, p.valorCentavos, p.competencia])).toEqual(
      antes.slice(0, 2).map((p) => [p.id, p.valorCentavos, p.competencia]),
    );
    // A parcela 3 virou um lancamento so dela, com o valor novo, ainda "3/3".
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: true },
    });
    expect(novo).toMatchObject({ parcelaInicial: 3, parcelaFinal: null, numeroParcelas: 3, valorCentavos: 2650 });
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [3, 2650, '2026-12'],
    ]);
  });

  it('em so esta, ignora qualquer campo que nao seja o valor', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    await editarLancamento(
      id,
      1,
      {
        ...entrada(),
        numeroParcelas: 3,
        valorCentavos: 2650,
        descricao: 'forjada',
        competenciaManual: '2027-05',
      },
      'SO_ESTA',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { parcelaInicial: 2, parcelaFinal: 2 },
      include: { parcelas: true },
    });
    expect(novo.descricao).toBe('loja online');
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [2, 2650, '2026-11'],
    ]);
  });

  it('so esta no meio deixa tres pedacos, e as linhas de depois so mudam de dono', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 2650 },
      'SO_ESTA',
      2,
    );

    expect(resultado.ok).toBe(true);
    const pedacos = await prisma.lancamento.findMany({
      include: { parcelas: { orderBy: { numero: 'asc' } } },
      orderBy: { parcelaInicial: 'asc' },
    });
    expect(pedacos.map((l) => [l.parcelaInicial, l.parcelaFinal, l.valorCentavos])).toEqual([
      [1, 1, 2500],
      [2, 2, 2650],
      [3, null, 2500],
    ]);
    expect(pedacos[0]?.id).toBe(id);
    expect(pedacos[2]?.parcelas.map((p) => p.id)).toEqual(antes.slice(2).map((p) => p.id));
    const soma = pedacos.flatMap((l) => l.parcelas).reduce((s, p) => s + p.valorCentavos, 0);
    expect(soma).toBe(2500 * 3 + 2650);
  });

  it('esta e as seguintes muda campos dali em diante, e as anteriores ficam como estavam', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await travarFatura('2026-11');

    const resultado = await editarLancamento(
      id,
      1,
      {
        ...entrada(),
        numeroParcelas: 4,
        valorCentavos: 3000,
        descricao: 'loja online renegociada',
        competenciaManual: '2026-10',
      },
      'ESTA_E_SEGUINTES',
      3,
    );

    expect(resultado.ok).toBe(true);
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original.descricao).toBe('loja online');
    expect((await linhasDe(id)).map((p) => [p.numero, p.valorCentavos])).toEqual([
      [1, 2500],
      [2, 2500],
    ]);
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.descricao).toBe('loja online renegociada');
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [3, 3000, '2026-12'],
      [4, 3000, '2027-01'],
    ]);
  });

  it('recusa esta e as seguintes que atravessa um mes travado, nomeando parcela, mes e conta', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await travarFatura('2026-12');

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 3000, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      2,
    );

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 3, numeroParcelas: 4, competencia: '2026-12', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(1);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).versao).toBe(1);
  });

  it('a parcela cancelada continua cancelada no pedaco novo', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await prisma.parcela.updateMany({ where: { lancamentoId: id, numero: 4 }, data: { cancelada: true } });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 3000, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.parcelas.map((p) => [p.numero, p.cancelada])).toEqual([
      [2, false],
      [3, false],
      [4, true],
    ]);
  });

  it('o recebido de cada parcela de reembolso passa para o pedaco novo', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      ehReembolso: true,
    });
    expect((await marcarReembolso(id, 1, 3, true)).ok).toBe(true);

    await editarLancamento(
      id,
      2,
      {
        ...entrada(),
        numeroParcelas: 3,
        valorCentavos: 3000,
        competenciaManual: '2026-10',
        ehReembolso: true,
      },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.parcelas.map((p) => [p.numero, p.reembolsoRecebido])).toEqual([
      [2, false],
      [3, true],
    ]);
  });

  it('o pedaco novo tem o rateio do escopo novo, e o original guarda o seu', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      escopo: 'CONJUNTO',
    });
    const rateiosAntes = await prisma.rateio.count({ where: { lancamentoId: id } });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10', escopo: 'PESSOAL' },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({ where: { id: { not: id } } });
    expect(novo.escopo).toBe('PESSOAL');
    expect(await prisma.rateio.count({ where: { lancamentoId: novo.id } })).toBe(0);
    expect(await prisma.rateio.count({ where: { lancamentoId: id } })).toBe(rateiosAntes);
  });

  it('o pedaco de depois copia o rateio do original', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      escopo: 'CONJUNTO',
    });
    const doOriginal = await prisma.rateio.findMany({ where: { lancamentoId: id }, orderBy: { membroId: 'asc' } });

    await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 }, 'SO_ESTA', 2);

    const depois = await prisma.lancamento.findFirstOrThrow({ where: { parcelaInicial: 3 } });
    const copiados = await prisma.rateio.findMany({ where: { lancamentoId: depois.id }, orderBy: { membroId: 'asc' } });
    expect(copiados.map((r) => [r.membroId, r.percentual])).toEqual(
      doOriginal.map((r) => [r.membroId, r.percentual]),
    );
  });

  it('recusa a segunda divisao concorrente em vez de dividir duas vezes', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    const primeira = await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 }, 'SO_ESTA', 3);
    const segunda = await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2700 }, 'SO_ESTA', 3);

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');
    expect(await prisma.lancamento.count()).toBe(2);
  });

  it('o pedaco novo nao herda a marca de recorrente', async () => {
    const recorrente = await prisma.recorrente.create({
      data: {
        descricao: 'academia',
        valorCentavos: 2500,
        escopo: 'PESSOAL',
        diaDoMes: 10,
        competenciaInicio: '2026-10',
        contaId: 'conta-c6',
        categoriaId,
        membroId,
      },
    });
    try {
      const id = await criarOk({
        ...entrada(),
        numeroParcelas: 3,
        competenciaManual: '2026-10',
        recorrenteId: recorrente.id,
        competenciaRecorrente: '2026-10',
      });

      const resultado = await editarLancamento(
        id,
        1,
        { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 },
        'SO_ESTA',
        2,
      );

      expect(resultado.ok).toBe(true);
      const marcados = await prisma.lancamento.findMany({ where: { recorrenteId: recorrente.id } });
      expect(marcados.map((l) => l.id)).toEqual([id]);
    } finally {
      // A recorrente nao e limpa por `limpar()`; os lancamentos que apontam
      // para ela tem que sair antes dela.
      await limpar();
      await prisma.recorrente.delete({ where: { id: recorrente.id } });
    }
  });

  it('esta e as seguintes pode mudar o total, e o pedaco de antes guarda o total antigo', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 6, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      3,
    );

    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ numeroParcelas: 4, parcelaInicial: 1, parcelaFinal: 2 });
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo).toMatchObject({ numeroParcelas: 6, parcelaInicial: 3, parcelaFinal: null });
    expect(novo.parcelas.map((p) => p.numero)).toEqual([3, 4, 5, 6]);
  });

  it('recusa dividir lancamento de valor total', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      origemValor: 'TOTAL',
      valorCentavos: 10000,
      competenciaManual: '2026-10',
    });

    await expect(
      editarLancamento(
        id,
        1,
        { ...entrada(), numeroParcelas: 3, origemValor: 'TOTAL', valorCentavos: 9000 },
        'SO_ESTA',
        2,
      ),
    ).rejects.toThrow('valor total');
    expect(await prisma.lancamento.count()).toBe(1);
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:banco -- src/server/repositorios/lancamento.test.ts`
Expected: FAIL. O primeiro caso devolve `FATURA_TRAVADA` com a parcela 2 de novembro: sem o
alcance, a edição ainda é do lançamento inteiro. É o defeito de 19/11 reproduzido.

- [ ] **Passo 3: Implementar**

Em `src/server/repositorios/lancamento.ts`:

Troque os imports de domínio por:

```ts
import { avancarCompetencia, competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import {
  colunasDaFaixa,
  faixaDoLancamento,
  faixaEscrita,
  planejarDivisao,
  type Alcance,
} from '@/domain/divisao';
```

Logo depois de `gravarRateio`, acrescente:

```ts
type Original = NonNullable<Awaited<ReturnType<typeof lerOriginal>>>;

function dentro(faixa: Faixa, numero: number): boolean {
  return numero >= faixa.inicial && numero <= faixa.final;
}

/**
 * Tira do original as linhas de `faixa` e as poe num lancamento novo com os
 * MESMOS campos — mesmo valor, conta, pessoa, categoria e rateio. As linhas so
 * trocam de `lancamentoId`: id, numero, valor e competencia ficam, e por isso
 * nao passam pela barreira — nada do que a fatura mostra muda.
 *
 * `deletadoEm` preenchido e a exclusao de um pedaco: ele nasce na lixeira, e
 * a lixeira o restaura como qualquer outro lancamento.
 *
 * A marca de recorrente fica com o original: o par (recorrenteId,
 * competenciaRecorrente) e unico no banco, e copia-la derrubaria a transacao.
 */
async function separar(
  db: ClienteBanco,
  original: Original,
  faixa: Faixa,
  deletadoEm: Date | null,
): Promise<string> {
  const pedaco = await db.lancamento.create({
    data: {
      descricao: original.descricao,
      valorCentavos: original.valorCentavos,
      origemValor: original.origemValor,
      dataCompra: original.dataCompra,
      numeroParcelas: original.numeroParcelas,
      escopo: original.escopo,
      meioPagamento: original.meioPagamento,
      devedorNome: original.devedorNome,
      statusReembolso: original.statusReembolso,
      contaId: original.contaId,
      categoriaId: original.categoriaId,
      membroId: original.membroId,
      deletadoEm,
      ...colunasDaFaixa(faixa, original.numeroParcelas),
    },
  });
  await db.parcela.updateMany({
    where: { lancamentoId: original.id, numero: { gte: faixa.inicial, lte: faixa.final } },
    data: { lancamentoId: pedaco.id },
  });
  if (original.rateios.length > 0) {
    await db.rateio.createMany({
      data: original.rateios.map((r) => ({
        lancamentoId: pedaco.id,
        membroId: r.membroId,
        percentual: r.percentual,
      })),
    });
  }
  return pedaco.id;
}

/**
 * "So esta": a tela so pode mudar o valor. Todo o resto vem do original — a
 * Fatura tambem, recalculada da propria linha —, entao a tela nao consegue
 * forjar outra mudanca mandando campos a mais.
 */
function soOValor(original: Original, numero: number, valorCentavos: number): EntradaLancamento {
  const linha = original.parcelas.find((p) => p.numero === numero);
  if (!linha) throw new Error(`Lancamento ${original.id} nao tem parcela ${numero}`);
  return {
    descricao: original.descricao,
    valorCentavos,
    origemValor: original.origemValor,
    dataCompra: original.dataCompra,
    numeroParcelas: original.numeroParcelas,
    escopo: original.escopo,
    contaId: original.contaId,
    categoriaId: original.categoriaId,
    membroId: original.membroId ?? undefined,
    ehReembolso: original.statusReembolso !== null,
    devedorNome: original.devedorNome ?? undefined,
    competenciaManual: avancarCompetencia(linha.competencia, -(numero - 1)),
  };
}
```

Troque `editarLancamento` inteira por:

```ts
/**
 * Edita um lancamento — inteiro, ou so parte de um parcelado.
 *
 * `alcance` e `numero` dizem o que a pessoa escolheu a partir da parcela que
 * clicou (ver `planejarDivisao`). Editar so parte DIVIDE o lancamento: o
 * original fica com as parcelas de antes, sem que nenhuma linha dele seja
 * lida pela barreira ou reescrita, e o alcance vira um lancamento novo. E
 * isso que deixa editar dezembro com novembro travado.
 *
 * A barreira olha as linhas que saem (as do alcance, onde estao hoje) e as que
 * entram (para onde a edicao as leva). Linha movida para o pedaco de depois
 * nao muda nada que a fatura mostre, e nao passa por ela.
 */
export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
  alcance: Alcance = 'TODAS',
  numero?: number,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const faixa = faixaDoLancamento(original);
    const k = numero ?? faixa.inicial;
    const plano = planejarDivisao(faixa, k, alcance);
    // Com valor TOTAL, o campo da tela mostra o total da compra: "o valor desta
    // parcela" nao tem leitura honesta. A tela nao oferece; aqui e a defesa.
    if (plano.tipo === 'DIVIDIR' && original.origemValor === 'TOTAL') {
      throw new Error('Lancamento com valor total so se edita inteiro');
    }

    const efetiva = alcance === 'SO_ESTA' ? soOValor(original, k, entrada.valorCentavos) : entrada;
    const faixaNova = faixaEscrita(plano.alcance, original.numeroParcelas, efetiva.numeroParcelas);
    if (!faixaNova) {
      throw new Error(
        `Total de ${efetiva.numeroParcelas} parcelas nao comporta as parcelas ` +
          `${plano.alcance.inicial} a ${plano.alcance.final}`,
      );
    }
    const competenciaBase = await competenciaBaseDe(tx, efetiva);
    const saem = original.parcelas.filter((p) => dentro(plano.alcance, p.numero));
    const entram = gerarParcelas(paraParcelamento(efetiva, competenciaBase), faixaNova);

    const travada =
      (await travaEntre(tx, original.contaId, original.numeroParcelas, saem)) ??
      (await travaEntre(tx, efetiva.contaId, efetiva.numeroParcelas, entram));
    if (travada) return recusa(travada);

    // O lock otimista de verdade, nos dois caminhos: a leitura de cima pode
    // ter envelhecido. Dividindo, o original so perde a ponta da faixa.
    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data:
        plano.tipo === 'NO_LUGAR'
          ? {
              ...camposGravaveis(efetiva),
              ...colunasDaFaixa(faixaNova, efetiva.numeroParcelas),
              versao: { increment: 1 },
            }
          : {
              ...colunasDaFaixa(plano.original, original.numeroParcelas),
              versao: { increment: 1 },
            },
    });
    if (alteradas.count === 0) return conflito(tx, id);

    const marcas = marcasDe(saem);
    await tx.parcela.deleteMany({
      where: { lancamentoId: id, numero: { gte: plano.alcance.inicial, lte: plano.alcance.final } },
    });

    if (plano.tipo === 'NO_LUGAR') {
      await gravarParcelas(tx, id, entram, efetiva.ehReembolso === true, marcas);
      await tx.rateio.deleteMany({ where: { lancamentoId: id } });
      await gravarRateio(tx, id, efetiva.escopo);
      return { ok: true };
    }

    if (plano.depois) await separar(tx, original, plano.depois, null);

    const novo = await tx.lancamento.create({
      data: { ...camposGravaveis(efetiva), ...colunasDaFaixa(faixaNova, efetiva.numeroParcelas) },
    });
    await gravarParcelas(tx, novo.id, entram, efetiva.ehReembolso === true, marcas);
    await gravarRateio(tx, novo.id, efetiva.escopo);
    return { ok: true };
  });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run test:banco -- src/server/repositorios/lancamento.test.ts`
Expected: PASS, os casos novos e os antigos (as chamadas antigas, sem alcance, caem em
`'TODAS'` e editam no lugar).

Run: `npx tsc --noEmit` e `npm run test:banco`
Expected: os dois sem erro.

- [ ] **Passo 5: Commit**

```bash
git add src/server/repositorios/lancamento.ts src/server/repositorios/lancamento.test.ts
git commit -m "$(cat <<'EOF'
Deixa editar so uma parcela, ou dela em diante, sem reescrever o mes travado

Era o defeito de 19/11: dezembro de um parcelado nao se editava porque
novembro estava travado. A edicao agora divide o lancamento; o original
fica com as parcelas de antes, sem que nenhuma linha dele seja tocada, e
o alcance vira um lancamento novo com o que mudou.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 6: Excluir com alcance

**Arquivos:**
- Modificar: `src/server/repositorios/lancamento.ts`
- Teste: `src/server/repositorios/lancamento.test.ts`

**Interfaces:**
- Consome: `lerOriginal`, `conflito`, `recusa`, `travaEntre`, `dentro`, `separar` (Tarefas 4 e
  5); `planejarDivisao`, `colunasDaFaixa`, `faixaDoLancamento`, `Alcance` (Tarefa 3).
- Produz: `excluirLancamento(id: string, versao: number, alcance?: Alcance, numero?: number): Promise<ResultadoGravacao>` — `alcance` padrão `'TODAS'`.

- [ ] **Passo 1: Escrever os testes que falham**

No fim do `describe`:

```ts
  it('exclui esta e as seguintes com novembro travado, e o pedaco vai para a lixeira', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);
    await travarFatura('2026-11');

    const resultado = await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 3);

    expect(resultado).toEqual({ ok: true });
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ deletadoEm: null, parcelaInicial: 1, parcelaFinal: 2, versao: 2 });
    const naLixeira = await prisma.lancamento.findFirstOrThrow({
      where: { deletadoEm: { not: null } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(naLixeira).toMatchObject({ parcelaInicial: 3, parcelaFinal: null });
    expect(naLixeira.parcelas.map((p) => p.id)).toEqual(antes.slice(2).map((p) => p.id));
  });

  it('exclui so a parcela do meio, deixando as de antes e as de depois', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    expect((await excluirLancamento(id, 1, 'SO_ESTA', 2)).ok).toBe(true);

    const vivos = await prisma.lancamento.findMany({
      where: { deletadoEm: null },
      orderBy: { parcelaInicial: 'asc' },
    });
    expect(vivos.map((l) => [l.parcelaInicial, l.parcelaFinal])).toEqual([
      [1, 1],
      [3, null],
    ]);
    const excluido = await prisma.lancamento.findFirstOrThrow({ where: { deletadoEm: { not: null } } });
    expect([excluido.parcelaInicial, excluido.parcelaFinal]).toEqual([2, 2]);
  });

  it('recusa excluir esta e as seguintes que alcanca um mes travado', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    await travarFatura('2026-12');

    const resultado = await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 2);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 3, numeroParcelas: 3, competencia: '2026-12', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(1);
  });

  it('restaura o pedaco excluido com as linhas que ele levou', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    expect((await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 2)).ok).toBe(true);
    const pedaco = await prisma.lancamento.findFirstOrThrow({ where: { deletadoEm: { not: null } } });

    expect((await restaurarLancamento(pedaco.id, pedaco.versao)).ok).toBe(true);

    const visiveis = await prisma.parcela.findMany({
      where: { lancamento: { deletadoEm: null } },
      orderBy: { numero: 'asc' },
    });
    expect(visiveis.map((p) => p.numero)).toEqual([1, 2, 3]);
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run test:banco -- src/server/repositorios/lancamento.test.ts`
Expected: FAIL — sem alcance, a primeira exclusão recusa por novembro, e a segunda manda o
lançamento inteiro para a lixeira.

- [ ] **Passo 3: Implementar**

Troque `excluirLancamento` inteira por:

```ts
/**
 * Manda para a lixeira um lancamento inteiro, ou so parte de um parcelado.
 *
 * Excluir parte e dividir: o pedaco do alcance vira um lancamento proprio,
 * com as linhas que ja tinha, e nasce excluido — a lixeira o restaura como
 * qualquer outro. A barreira olha so as linhas que saem dos meses.
 */
export async function excluirLancamento(
  id: string,
  versao: number,
  alcance: Alcance = 'TODAS',
  numero?: number,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const faixa = faixaDoLancamento(original);
    const plano = planejarDivisao(faixa, numero ?? faixa.inicial, alcance);
    const saem = original.parcelas.filter((p) => dentro(plano.alcance, p.numero));

    const travada = await travaEntre(tx, original.contaId, original.numeroParcelas, saem);
    if (travada) return recusa(travada);

    const agora = new Date();
    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data:
        plano.tipo === 'NO_LUGAR'
          ? { deletadoEm: agora, versao: { increment: 1 } }
          : { ...colunasDaFaixa(plano.original, original.numeroParcelas), versao: { increment: 1 } },
    });
    if (alteradas.count === 0) return conflito(tx, id);

    if (plano.tipo === 'DIVIDIR') {
      if (plano.depois) await separar(tx, original, plano.depois, null);
      await separar(tx, original, plano.alcance, agora);
    }
    return { ok: true };
  });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run test:banco`
Expected: PASS, a suíte inteira.

Run: `npx tsc --noEmit`
Expected: sem erro.

- [ ] **Passo 5: Commit**

```bash
git add src/server/repositorios/lancamento.ts src/server/repositorios/lancamento.test.ts
git commit -m "$(cat <<'EOF'
Deixa excluir so uma parcela, ou dela em diante, com o mes de antes travado

Excluir tinha o mesmo defeito de editar: um parcelado que passasse por um
mes travado nao saia nunca. O pedaco excluido vira lancamento proprio,
com as linhas que ja tinha, e a lixeira o restaura.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 7: Action e leituras

**Arquivos:**
- Modificar: `src/server/actions/lancamento.ts`
- Modificar: `src/server/repositorios/resumo.ts`, `fatura.ts`, `lixeira.ts`, `busca.ts`
- Modificar: `src/components/lixeira/lista-lixeira.tsx`, `src/components/despesas/resultados-busca.tsx`

**Interfaces:**
- Consome: `competenciaBaseDaFatura`, `avancarCompetencia` (Tarefa 1); `RAIO_DA_FATURA`,
  `FaturaTravada`, `descreverTrava` (Tarefa 2); `faixaDoLancamento`, `rotuloDaFaixa`, `Alcance`
  (Tarefa 3); repositório (Tarefas 4 a 6).
- Produz:
  - `acaoCriarLancamento(dados: unknown)` — `dados` aceita `fatura?: 'AAAA-MM'` e `parcelaInicial?: number`; `competenciaManual` sai do esquema da action
  - `acaoEditarLancamento(id: string, versao: number, dados: unknown, alcance?: unknown, numero?: unknown)`
  - `acaoExcluirLancamento(id: string, versao: number, alcance?: unknown, numero?: unknown)`
  - `LinhaGrade.parcelaInicial: number` e `LinhaGrade.parcelaFinal: number` (sempre um número: nulo no banco vira `numeroParcelas`)
  - `carregarTravadasAoRedor(competencia: string, raio?: number): Promise<FaturaTravada[]>` em `fatura.ts`
  - `ItemDaLixeira.faixa: Faixa` e `ItemDaBusca.faixa: Faixa`

Esta tarefa não tem teste automatizado próprio: a action exige sessão do Google, e as
leituras só ganham colunas. Ela se verifica por `tsc`, `lint` e as suítes inteiras.

- [ ] **Passo 1: A action**

Em `src/server/actions/lancamento.ts`, acrescente o import
`import { competenciaBaseDaFatura } from '@/domain/competencia';` e, no import do repositório,
`type EntradaLancamento`. Troque `const esquema = z.object({...});` por:

```ts
const esquema = z
  .object({
    descricao: z.string().trim().min(1, 'Descrição obrigatória').max(120),
    valorCentavos: z.number().int('Valor deve ser inteiro em centavos'),
    origemValor: z.enum(['POR_PARCELA', 'TOTAL']),
    dataCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
    numeroParcelas: z.number().int().min(1).max(72),
    escopo: z.enum(['PESSOAL', 'CONJUNTO']),
    contaId: z.string().min(1),
    categoriaId: z.string().min(1),
    membroId: z.string().optional(),
    ehReembolso: z.boolean().optional(),
    devedorNome: z.string().trim().max(80).optional(),
    /**
     * A Fatura da parcela que a tela descreve: a clicada, na edicao; a
     * inicial, na criacao. Vira competencia base aqui, e o repositorio nunca
     * ve a Fatura. Sem ela, a competencia sai da data, como sempre.
     */
    fatura: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    parcelaInicial: z.number().int().min(1).max(72).optional(),
  })
  .refine((d) => (d.parcelaInicial ?? 1) <= d.numeroParcelas, {
    message: 'A parcela inicial passa do número de parcelas',
    path: ['parcelaInicial'],
  });

const esquemaAlcance = z.enum(['SO_ESTA', 'ESTA_E_SEGUINTES', 'TODAS']);
const esquemaNumero = z.number().int().min(1).max(72);

/** Troca a Fatura da parcela `numero` pela competencia base que o repositorio grava. */
function paraEntrada(dados: z.infer<typeof esquema>, numero: number): EntradaLancamento {
  const { fatura, ...resto } = dados;
  return fatura ? { ...resto, competenciaManual: competenciaBaseDaFatura(fatura, numero) } : resto;
}
```

Troque as três actions de lançamento por:

```ts
export async function acaoCriarLancamento(dados: unknown) {
  await exigirSessao();
  const lido = esquema.parse(dados);
  const resultado = await criarLancamento(paraEntrada(lido, lido.parcelaInicial ?? 1));
  revalidatePath('/despesas');
  return resultado;
}

/**
 * `alcance` e `numero` chegam como `unknown` e passam por zod: action e porta
 * publica, e a tela nao e a unica que pode chama-la. Sem `numero`, a Fatura
 * descreve a parcela 1 — a tela sempre manda a parcela clicada.
 */
export async function acaoEditarLancamento(
  id: string,
  versao: number,
  dados: unknown,
  alcance: unknown = 'TODAS',
  numero?: unknown,
) {
  await exigirSessao();
  const lido = esquema.parse(dados);
  const qual = esquemaAlcance.parse(alcance);
  const k = numero === undefined ? undefined : esquemaNumero.parse(numero);
  const resultado = await editarLancamento(id, versao, paraEntrada(lido, k ?? 1), qual, k);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoExcluirLancamento(
  id: string,
  versao: number,
  alcance: unknown = 'TODAS',
  numero?: unknown,
) {
  await exigirSessao();
  const qual = esquemaAlcance.parse(alcance);
  const k = numero === undefined ? undefined : esquemaNumero.parse(numero);
  const resultado = await excluirLancamento(id, versao, qual, k);
  revalidatePath('/despesas');
  return resultado;
}
```

- [ ] **Passo 2: A linha da grade e as faturas travadas da janela**

Em `src/server/repositorios/resumo.ts`, no tipo `LinhaGrade`, logo depois de `numeroParcelas`:

```ts
  /**
   * A faixa que o lancamento desta linha grava. `parcelaFinal` ja vem resolvido
   * (nulo no banco e `numeroParcelas`): a tela calcula alcance e trava com ela.
   */
  parcelaInicial: number;
  parcelaFinal: number;
```

E no `map` de `carregarLinhasDaGrade`, logo depois de `numeroParcelas: ...`:

```ts
    parcelaInicial: p.lancamento.parcelaInicial,
    parcelaFinal: p.lancamento.parcelaFinal ?? p.lancamento.numeroParcelas,
```

Em `src/server/repositorios/fatura.ts`, acrescente aos imports
`import { avancarCompetencia } from '@/domain/competencia';` e
`import { RAIO_DA_FATURA, type FaturaTravada } from '@/domain/trava';`, e no fim do arquivo:

```ts
/**
 * As faturas travadas, de todas as contas, a `raio` meses do mes da tela.
 *
 * E o que o painel precisa para desabilitar os meses travados do seletor de
 * Fatura e o alcance que esbarraria numa trava. Poucas linhas por ano. Quem
 * decide de verdade continua sendo a barreira do repositorio: uma travada fora
 * da janela aparece como recusa ao salvar.
 */
export async function carregarTravadasAoRedor(
  competencia: string,
  raio: number = RAIO_DA_FATURA,
): Promise<FaturaTravada[]> {
  return prisma.fatura.findMany({
    where: {
      status: 'TRAVADA',
      // AAAA-MM compara como texto na mesma ordem do calendario.
      competencia: {
        gte: avancarCompetencia(competencia, -raio),
        lte: avancarCompetencia(competencia, raio),
      },
    },
    select: { contaId: true, competencia: true },
  });
}
```

- [ ] **Passo 3: A faixa na lixeira e na busca**

Em `src/server/repositorios/lixeira.ts`: importe `faixaDoLancamento` de `@/domain/divisao` e
`type Faixa` de `@/domain/parcelamento`; no tipo `ItemDaLixeira`, depois de `numeroParcelas`:

```ts
  /** As parcelas que este lancamento tem: um pedaco de parcelado nao tem a compra inteira. */
  faixa: Faixa;
```

No `select`, acrescente `parcelaInicial: true, parcelaFinal: true,`, e no objeto devolvido,
depois de `numeroParcelas: l.numeroParcelas,`: `faixa: faixaDoLancamento(l),`.

Em `src/server/repositorios/busca.ts`: os mesmos imports; no tipo `ItemDaBusca`, troque o
comentário de `totalCentavos` por
`/** O valor do LANCAMENTO: a soma das parcelas dele, canceladas inclusive. De um pedaco, o do pedaco. */`
e acrescente depois de `numeroParcelas`:

```ts
  /** As parcelas que este lancamento tem: um pedaco de parcelado nao tem a compra inteira. */
  faixa: Faixa;
```

No `select`, `parcelaInicial: true, parcelaFinal: true,`; no objeto, depois de
`numeroParcelas: l.numeroParcelas,`: `faixa: faixaDoLancamento(l),`.

- [ ] **Passo 4: O rótulo na tela, e a frase da trava na lixeira**

Em `src/components/lixeira/lista-lixeira.tsx`, importe `rotuloDaFaixa` de `@/domain/divisao`
e `descreverTrava` de `@/domain/trava`. Logo depois de `const dono = ...`:

```ts
  const parcelas =
    rotuloDaFaixa(item.faixa, item.numeroParcelas) ??
    (item.numeroParcelas > 1 ? `${item.numeroParcelas}x` : null);
```

Troque o bloco `{item.numeroParcelas > 1 && ( <span ...>{item.numeroParcelas}x</span> )}` por:

```tsx
            {parcelas && (
              <span className="ml-1.5 text-xs text-tinta-fraca tabular-nums">{parcelas}</span>
            )}
```

E, em `restaurar`, troque o `setErro(...)` da recusa por:

```ts
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? descreverTrava(resultado.travada)
              : 'Alguém mexeu neste lançamento. Recarregue a página.',
          );
```

Em `src/components/despesas/resultados-busca.tsx`, importe `rotuloDaFaixa` de
`@/domain/divisao` e troque o bloco
`{item.numeroParcelas > 1 && ( <span ...>em {item.numeroParcelas}x</span> )}` por:

```tsx
        {(() => {
          const rotulo =
            rotuloDaFaixa(item.faixa, item.numeroParcelas) ??
            (item.numeroParcelas > 1 ? `em ${item.numeroParcelas}x` : null);
          return rotulo && <span className="ml-1 text-xs text-tinta-fraca">{rotulo}</span>;
        })()}
```

- [ ] **Passo 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erro. O painel e o diálogo de exclusão ainda chamam as actions sem alcance, o que
continua válido (os parâmetros novos são opcionais); eles mudam nas Tarefas 8 e 9. Se algum
reclamar de argumento, a assinatura do Passo 1 não bate — corrija lá, não nos componentes.

Run: `npm run lint`, `npm test` e `npm run test:banco`
Expected: os três sem erro; `busca.test.ts` passa, porque usa `toMatchObject` e lista ids.

- [ ] **Passo 6: Commit**

```bash
git add src/server/actions/lancamento.ts src/server/repositorios/resumo.ts src/server/repositorios/fatura.ts src/server/repositorios/lixeira.ts src/server/repositorios/busca.ts src/components/lixeira/lista-lixeira.tsx src/components/despesas/resultados-busca.tsx
git commit -m "$(cat <<'EOF'
Leva a Fatura e o alcance ate a action, e a faixa ate quem le

A action recebe a Fatura da parcela que a tela descreve e a converte em
base; o repositorio nunca ve a Fatura. A grade, a lixeira e a busca passam
a saber que um lancamento pode ser so um pedaco de uma compra.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 8: O painel

**Arquivos:**
- Criar: `src/components/despesas/controle-alcance.tsx`
- Criar: `src/components/despesas/alcance-da-linha.ts`
- Modificar: `src/components/despesas/painel-lancamento.tsx`
- Modificar: `src/components/despesas/grade-lancamentos.tsx`
- Modificar: `src/app/(app)/despesas/page.tsx`

**Interfaces:**
- Consome: `mesesAoRedor`, `formatarCompetencia` (Tarefa 1); `RAIO_DA_FATURA`, `FaturaTravada`,
  `Trava`, `acharTrava`, `competenciasTravadasDaConta`, `descreverTrava`, `divergenciaDaData`
  (Tarefa 2); `ALCANCES`, `Alcance`, `alcanceDaFaixa`, `parcelasDaFaixa`, `minimoDeParcelas`
  (Tarefa 3); actions e `LinhaGrade` com faixa, `carregarTravadasAoRedor` (Tarefa 7).
- Produz:
  - `ControleAlcance({ nome, valor, opcoes, onMudar, desabilitado? })` e `type OpcaoDeAlcance = { valor: Alcance; bloqueio: string | null }`
  - Em `alcance-da-linha.ts`: `faixaDaLinha(linha)`, `travaDoAlcance(linha, competencia, travadas, alcance): Trava | null`, `opcoesDeAlcance(linha, competencia, travadas): OpcaoDeAlcance[]`, `alcanceInicial(opcoes): Alcance | null`, `temAlcance(linha): boolean`
  - `PainelLancamento` ganha as props `competencia: string` e `travadas: readonly FaturaTravada[]`
  - `GradeLancamentos` ganha a prop `travadas: FaturaTravada[]`

O projeto não tem teste de componente (ver `decisoes.md`). Esta tarefa se verifica por `tsc`,
`lint`, `build`, e pelo roteiro visual da Tarefa 10, que só o usuário consegue fazer.

- [ ] **Passo 1: O controle**

Criar `src/components/despesas/controle-alcance.tsx`:

```tsx
'use client';

import type { Alcance } from '@/domain/divisao';

export type OpcaoDeAlcance = {
  valor: Alcance;
  /** Por que esta opcao esta desabilitada, ou `null` se pode ser escolhida. */
  bloqueio: string | null;
};

const ROTULOS: Record<Alcance, string> = {
  SO_ESTA: 'Só esta parcela',
  ESTA_E_SEGUINTES: 'Esta e as seguintes',
  TODAS: 'Todas',
};

type Props = {
  /** `name` dos radios: unico na pagina, para dois controles nao se misturarem. */
  nome: string;
  valor: Alcance;
  opcoes: readonly OpcaoDeAlcance[];
  onMudar: (alcance: Alcance) => void;
  desabilitado?: boolean | undefined;
};

/**
 * O alcance de uma edicao ou exclusao de parcelado: so a parcela clicada, ela
 * e as seguintes, ou todas.
 *
 * Radios nativos com cara de controle segmentado: setas do teclado, foco e
 * leitor de tela vem do navegador, sem dependencia nova. Opcao barrada pela
 * trava fica desabilitada com o motivo escrito embaixo — esconde-la deixaria a
 * pessoa sem saber por que ela sumiu.
 */
export function ControleAlcance({ nome, valor, opcoes, onMudar, desabilitado }: Props) {
  const bloqueadas = opcoes.filter((o) => o.bloqueio !== null);

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">Alcance</legend>
      <div className="grid grid-cols-3 overflow-hidden rounded-caixa border border-borda">
        {opcoes.map((opcao) => (
          <label
            key={opcao.valor}
            className="flex cursor-pointer items-center justify-center border-l border-borda px-2 py-1.5 text-center text-xs text-tinta-fraca first:border-l-0 has-[:checked]:bg-superficie-alta has-[:checked]:font-medium has-[:checked]:text-tinta has-[:disabled]:cursor-not-allowed has-[:disabled]:text-tinta-apagada has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento has-[:focus-visible]:ring-inset"
          >
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              disabled={desabilitado === true || opcao.bloqueio !== null}
              onChange={() => onMudar(opcao.valor)}
              className="sr-only"
            />
            {ROTULOS[opcao.valor]}
          </label>
        ))}
      </div>
      {bloqueadas.map((opcao) => (
        <p key={opcao.valor} className="text-xs text-tinta-fraca">
          <span className="font-medium">{ROTULOS[opcao.valor]}:</span> {opcao.bloqueio}
        </p>
      ))}
    </fieldset>
  );
}
```

Criar `src/components/despesas/alcance-da-linha.ts`:

```ts
import { ALCANCES, alcanceDaFaixa, parcelasDaFaixa, type Alcance } from '@/domain/divisao';
import type { Faixa } from '@/domain/parcelamento';
import {
  acharTrava,
  competenciasTravadasDaConta,
  descreverTrava,
  type FaturaTravada,
  type Trava,
} from '@/domain/trava';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import type { OpcaoDeAlcance } from './controle-alcance';

export function faixaDaLinha(linha: LinhaGrade): Faixa {
  return { inicial: linha.parcelaInicial, final: linha.parcelaFinal };
}

/** A linha tem mais de uma parcela para escolher; senao o controle nao aparece. */
export function temAlcance(linha: LinhaGrade): boolean {
  return linha.parcelaFinal > linha.parcelaInicial;
}

/**
 * A trava que o alcance encontraria, vista da tela. So enxerga as faturas da
 * janela carregada: quem decide de verdade e a barreira do servidor.
 */
export function travaDoAlcance(
  linha: LinhaGrade,
  competencia: string,
  travadas: readonly FaturaTravada[],
  alcance: Alcance,
): Trava | null {
  const alvo = alcanceDaFaixa(faixaDaLinha(linha), linha.numero, alcance);
  const parcelas = parcelasDaFaixa(alvo, { numero: linha.numero, competencia });
  const achada = acharTrava(parcelas, competenciasTravadasDaConta(travadas, linha.contaId));
  return achada
    ? { ...achada, numeroParcelas: linha.numeroParcelas, contaNome: linha.contaNome }
    : null;
}

export function opcoesDeAlcance(
  linha: LinhaGrade,
  competencia: string,
  travadas: readonly FaturaTravada[],
): OpcaoDeAlcance[] {
  return ALCANCES.map((valor) => {
    const trava = travaDoAlcance(linha, competencia, travadas, valor);
    return { valor, bloqueio: trava ? descreverTrava(trava) : null };
  });
}

/**
 * O primeiro alcance livre, do menos ao mais abrangente. `null` quando nem
 * "so esta" esta livre — o mes da propria linha esta travado.
 */
export function alcanceInicial(opcoes: readonly OpcaoDeAlcance[]): Alcance | null {
  return opcoes.find((o) => o.bloqueio === null)?.valor ?? null;
}
```

- [ ] **Passo 2: A página e a grade levam as faturas travadas**

Em `src/app/(app)/despesas/page.tsx`, importe
`import { carregarTravadasAoRedor } from '@/server/repositorios/fatura';`, acrescente
`travadas` ao fim da desestruturação do `Promise.all`, e o item no fim da lista:

```ts
      // Para o painel desabilitar os meses travados da Fatura e o alcance que
      // esbarraria numa trava. Com termo, o painel nao abre — nao carrega.
      buscando ? Promise.resolve([]) : carregarTravadasAoRedor(competencia),
```

E passe `travadas={travadas}` ao `<GradeLancamentos ... />`.

Em `src/components/despesas/grade-lancamentos.tsx`, importe
`import type { FaturaTravada } from '@/domain/trava';`, acrescente ao tipo `Props`:

```ts
  /** Faturas travadas perto do mes da tela: o painel desabilita o que esbarraria nelas. */
  travadas: FaturaTravada[];
```

receba `travadas` na desestruturação de `GradeLancamentos`, e passe ao `<PainelLancamento`
`competencia={competencia}` e `travadas={travadas}`.

- [ ] **Passo 3: O painel — props, estado e o que se deriva deles**

Em `src/components/despesas/painel-lancamento.tsx`:

**Imports.** Apague o bloco de import de `@/components/ui/alert-dialog` inteiro. Troque a linha
de `@/domain/competencia` por:

```ts
import { formatarCompetencia, mesesAoRedor } from '@/domain/competencia';
import { alcanceDaFaixa, minimoDeParcelas, type Alcance } from '@/domain/divisao';
import {
  RAIO_DA_FATURA,
  competenciasTravadasDaConta,
  descreverTrava,
  divergenciaDaData,
  type FaturaTravada,
} from '@/domain/trava';
```

E acrescente, junto dos imports locais:

```ts
import { alcanceInicial, faixaDaLinha, opcoesDeAlcance, temAlcance, travaDoAlcance } from './alcance-da-linha';
import { ControleAlcance } from './controle-alcance';
```

**`CamposComuns`.** Troque o comentário de cima do tipo por
`// O que \`enviar\` monta, comum a criar e editar (so \`origemValor\` fica de fora — cada modo o resolve do seu jeito).`
e acrescente o campo `fatura: string;` ao tipo, depois de `devedorNome?: string;`.

**`calcularDica`.** Apague a função inteira, com o comentário. No lugar:

```ts
/**
 * O aviso de que a data aponta outra Fatura. Nao impede nada: a Fatura e quem
 * decide o mes, e a data e informacao. Diz o porque — o dia do fechamento, ou
 * o mes do pagamento —, como a antiga dica de competencia dizia.
 */
function avisoDaData(pelaData: string, numero: number, conta: Conta): string {
  const quem = numero > 1 ? `a parcela ${numero} cairia` : 'cairia';
  const porque =
    conta.tipo === 'CARTAO' && conta.diaFechamento !== null
      ? `o ${conta.nome} fecha dia ${conta.diaFechamento}`
      : 'é o mês do pagamento';
  return `Pela data, ${quem} na fatura de ${formatarCompetencia(pelaData)} — ${porque}.`;
}

/**
 * Em "so esta", os campos fora o valor ficam desabilitados e nao vao no
 * FormData: saem da propria linha. O servidor copia tudo do original de
 * qualquer jeito; isto existe porque o esquema da action exige o formato
 * inteiro.
 */
function camposDaLinha(linha: LinhaGrade, fatura: string): Omit<CamposComuns, 'valorCentavos'> {
  return {
    descricao: linha.descricao,
    dataCompra: linha.dataCompra,
    numeroParcelas: linha.numeroParcelas,
    escopo: linha.escopo,
    contaId: linha.contaId,
    categoriaId: linha.categoriaId,
    ...(linha.escopo === 'PESSOAL' && linha.membroId ? { membroId: linha.membroId } : {}),
    ehReembolso: linha.ehReembolso,
    ...(linha.ehReembolso && linha.devedorNome ? { devedorNome: linha.devedorNome } : {}),
    fatura,
  };
}
```

**Props.** Em `FormularioProps` e em `Props` (o de `PainelLancamento`), acrescente:

```ts
  /** O mes aberto na tela: e a Fatura inicial, e o mes da linha editada. */
  competencia: string;
  /** Faturas travadas perto da tela, de todas as contas. */
  travadas: readonly FaturaTravada[];
```

Receba `competencia` e `travadas` nas desestruturações de `Formulario` e de
`PainelLancamento`, e passe os dois de `PainelLancamento` para `<Formulario`.

**Estado.** Em `Formulario`, apague o `useState` de `confirmacaoRegeracao` e o comentário dele.
Logo depois de `const editando = ...`:

```ts
  // Alcance: so existe editando uma linha de parcelado com mais de uma parcela
  // na faixa. O padrao e o primeiro livre, do menos ao mais abrangente. Valor
  // TOTAL so se edita inteiro (o campo mostra o total da compra; ver a spec).
  const opcoes = editando
    ? opcoesDeAlcance(editando.linha, competencia, travadas).map((o) =>
        editando.linha.origemValor === 'TOTAL' && o.valor !== 'TODAS' && o.bloqueio === null
          ? { ...o, bloqueio: 'O valor foi digitado como total da compra: só dá para editar todas as parcelas.' }
          : o,
      )
    : [];
  const mostraAlcance = editando !== null && temAlcance(editando.linha);
  const [alcance, setAlcance] = useState<Alcance>(
    mostraAlcance ? (alcanceInicial(opcoes) ?? 'SO_ESTA') : 'TODAS',
  );
  /** O mes da propria linha esta travado: nada aqui pode ser salvo. */
  const travaDaLinha = editando ? travaDoAlcance(editando.linha, competencia, travadas, 'SO_ESTA') : null;
  /** Em "so esta" so o valor muda; os outros campos ficam desabilitados. */
  const soValor = mostraAlcance && alcance === 'SO_ESTA';
```

Logo depois do `useState` de `contaId`:

```ts
  // A Fatura: comeca no mes da tela. Na edicao, o mes da tela e o da linha.
  const [fatura, setFatura] = useState(competencia);
  // Rastreados so para o seletor de parcela inicial e o `min` das parcelas;
  // o campo de parcelas continua nao controlado, como os outros.
  const [numeroParcelas, setNumeroParcelas] = useState(editando?.linha.numeroParcelas ?? 1);
  const [parcelaInicial, setParcelaInicial] = useState(1);
```

Troque `const dica = calcularDica(dataCompra, contaId, contasOferecidas);` por:

```ts
  const meses = mesesAoRedor(competencia, RAIO_DA_FATURA);
  const travadasDaConta = competenciasTravadasDaConta(travadas, contaId);
  const numeroDaFatura = editando ? editando.linha.numero : parcelaInicial;
  const contaEscolhida = contasOferecidas.find((c) => c.id === contaId);
  const pelaData = contaEscolhida
    ? divergenciaDaData(dataCompra, contaEscolhida, fatura, numeroDaFatura)
    : null;
  const aviso = pelaData && contaEscolhida ? avisoDaData(pelaData, numeroDaFatura, contaEscolhida) : null;
  const minimoParcelas = editando
    ? minimoDeParcelas(
        alcanceDaFaixa(faixaDaLinha(editando.linha), editando.linha.numero, alcance),
        editando.linha.numeroParcelas,
      )
    : 1;
```

- [ ] **Passo 4: O painel — envio**

Em `enviar`, troque desde `const escopo = String(dados.get('escopo'));` até o fim da função por:

```ts
    const escopo = String(dados.get('escopo'));
    const camposComuns: CamposComuns =
      soValor && editando
        ? { ...camposDaLinha(editando.linha, competencia), valorCentavos }
        : {
            descricao: String(dados.get('descricao') ?? ''),
            valorCentavos,
            dataCompra: String(dados.get('dataCompra') ?? ''),
            numeroParcelas: Number(dados.get('numeroParcelas') ?? 1),
            escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
            contaId: String(dados.get('contaId') ?? ''),
            categoriaId,
            ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
            ehReembolso,
            // O nome so viaja junto com a marca ligada. Desligar e salvar tem que
            // limpar o devedor no banco, nao deixa-lo pendurado num lancamento comum.
            ...(ehReembolso ? { devedorNome: String(dados.get('devedorNome') ?? '') } : {}),
            fatura,
          };

    // O alcance ja foi escolhido no topo do painel: nao ha mais o que
    // confirmar antes de mandar. O antigo aviso "regera as N parcelas"
    // existia porque editar regerava tudo, sempre.
    if (editando) {
      enviarEdicao(camposComuns);
      return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoCriarLancamento({
          ...camposComuns,
          origemValor: 'POR_PARCELA',
          parcelaInicial: camposComuns.numeroParcelas > 1 ? parcelaInicial : 1,
        });

        if (!resultado.ok) {
          setErro(descreverTrava(resultado.travada));
          return;
        }

        // Sucesso: o painel fecha (o Sheet devolve o foco ao gatilho, ver
        // `onCloseAutoFocus` em `PainelLancamento`) — a linha nova aparece na
        // secao certa via `revalidatePath` do proprio server action.
        onFechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }
```

Em `enviarEdicao`, troque a chamada e o tratamento da recusa:

```ts
        const resultado = await acaoEditarLancamento(
          editando.linha.lancamentoId,
          editando.linha.versao,
          {
            ...campos,
            // origemValor viaja escondido, igual ao que ja estava gravado — o
            // formulario nao oferece troca-lo. (comportamento 5)
            origemValor: editando.linha.origemValor,
          },
          alcance,
          editando.linha.numero,
        );

        if (!resultado.ok) {
          // Em caso de recusa o formulario nunca reseta — ver o comentario de
          // `enviar`. (comportamento 1)
          if (resultado.motivo === 'FATURA_TRAVADA') {
            setErro(descreverTrava(resultado.travada));
          } else {
            setErro(
              'Alguém salvou uma mudança nesse lançamento enquanto você editava. ' +
                'Confira o estado atual abaixo e tente de novo.',
            );
            setConflito(extrairAtual(resultado.atual));
          }
          return;
        }
```

Troque o comentário de cima de `enviarEdicao` por
`// O envio de uma edicao: \`campos\` e o objeto que \`enviar\` capturou do FormData (ou da linha, em "so esta") — esta funcao nunca le o formulario de novo.`

Apague `confirmarRegeracao` e `aoMudarConfirmacao` inteiras, com os comentários.

- [ ] **Passo 5: O painel — campos**

No JSX de `Formulario`:

1. Logo depois de `<div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">`, antes do
   campo de descrição:

```tsx
        {travaDaLinha && (
          <p role="alert" className="rounded-caixa border border-atencao bg-atencao-fundo p-3 text-sm text-atencao">
            {descreverTrava(travaDaLinha)}
          </p>
        )}

        {mostraAlcance && !travaDaLinha && (
          <ControleAlcance
            nome="alcance-edicao"
            valor={alcance}
            opcoes={opcoes}
            onMudar={setAlcance}
            desabilitado={pendente}
          />
        )}
```

2. Acrescente `disabled={soValor}` aos campos de **descrição**, **data**, **parcelas**, ao
   `Select` de **escopo**, ao de **conta**, ao de **categoria**, ao `Switch` de reembolso e ao
   `Input` de devedor. O de **valor** fica sempre habilitado.

3. No campo de parcelas, troque `min={1}` por `min={minimoParcelas}` e acrescente
   `onChange={(evento) => setNumeroParcelas(Number(evento.target.value))}`.

4. Logo depois do `div` que contém "De quem" e "Parcelas", um bloco novo:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campo-fatura">Fatura</Label>
            {/* Sem `name`: a Fatura mora no estado, e e o estado que vai para a action. */}
            <Select value={fatura} onValueChange={setFatura} disabled={soValor}>
              <SelectTrigger id="campo-fatura" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map((mes) => {
                  const travada = travadasDaConta.has(mes);
                  return (
                    <SelectItem key={mes} value={mes} disabled={travada}>
                      {formatarCompetencia(mes)}
                      {travada ? ' · travada' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {!editando && numeroParcelas > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="campo-parcela-inicial">Começa na parcela</Label>
              <Input
                id="campo-parcela-inicial"
                type="number"
                min={1}
                max={numeroParcelas}
                value={parcelaInicial}
                onChange={(evento) => setParcelaInicial(Number(evento.target.value))}
              />
            </div>
          )}
        </div>
```

5. No `SheetFooter`, troque `{dica && <p className="text-xs text-tinta-fraca">{dica}</p>}` por:

```tsx
        {aviso && <p className="text-xs text-atencao">{aviso}</p>}
```

6. No botão de envio, troque `disabled={pendente}` por `disabled={pendente || travaDaLinha !== null}`.

7. Apague o bloco `{editando && ( <AlertDialog ...> ... </AlertDialog> )}` do fim do `<form>`,
   com o comentário de cima dele.

- [ ] **Passo 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erro. Se `dialogo-exclusao.tsx` reclamar, é da Tarefa 9 — ele ainda chama a
action com dois argumentos, o que continua válido.

Run: `npm run lint`
Expected: sem erro. Se acusar `useRef` ou outro import sem uso deixado pela remoção do
AlertDialog, apague o import.

Run: `npm run build`
Expected: build completo, sem erro de tipo.

Run: `grep -n "confirmacaoRegeracao\|calcularDica\|AlertDialog\|já está fechado" src/components/despesas/painel-lancamento.tsx`
Expected: nada.

- [ ] **Passo 7: Commit**

```bash
git add src/components/despesas/controle-alcance.tsx src/components/despesas/alcance-da-linha.ts src/components/despesas/painel-lancamento.tsx src/components/despesas/grade-lancamentos.tsx "src/app/(app)/despesas/page.tsx"
git commit -m "$(cat <<'EOF'
Da ao painel a Fatura, o alcance e a frase que diz o que esta travado

A Fatura comeca no mes da tela, e a data so avisa quando aponta outro;
os meses travados nem aparecem como escolha. Editar parcelado pergunta o
alcance no topo, no lugar do aviso de regerar tudo, e uma linha de mes
travado abre ja dizendo qual fatura destravar.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 9: O diálogo de exclusão

**Arquivos:**
- Modificar: `src/components/despesas/dialogo-exclusao.tsx`
- Modificar: `src/components/despesas/secao-pessoa.tsx`
- Modificar: `src/components/despesas/grade-lancamentos.tsx`

**Interfaces:**
- Consome: `ControleAlcance` e `alcance-da-linha.ts` (Tarefa 8); `alcanceDaFaixa`, `Alcance`
  (Tarefa 3); `descreverTrava`, `FaturaTravada` (Tarefa 2); `acaoExcluirLancamento` com alcance
  (Tarefa 7).
- Produz: `DialogoExclusao({ linha, competencia, travadas })`; `SecaoPessoa` ganha a prop
  `travadas: readonly FaturaTravada[]`.

- [ ] **Passo 1: Repassar as faturas travadas até o diálogo**

Em `src/components/despesas/secao-pessoa.tsx`, importe
`import type { FaturaTravada } from '@/domain/trava';` e acrescente
`travadas: readonly FaturaTravada[];` aos tipos `Props`, `AcoesLinhaProps` e `LinhaProps`.
Receba `travadas` nas desestruturações de `SecaoPessoa`, `LinhaDaSecao` e `AcoesLinha`, e
repasse: `SecaoPessoa` → `<LinhaDaSecao travadas={travadas} />`, `LinhaDaSecao` →
`<AcoesLinha travadas={travadas} />`, `AcoesLinha` →
`<DialogoExclusao linha={linha} competencia={competencia} travadas={travadas} />`.

Em `src/components/despesas/grade-lancamentos.tsx`, passe `travadas={travadas}` ao
`<SecaoPessoa`.

- [ ] **Passo 2: O diálogo**

Em `src/components/despesas/dialogo-exclusao.tsx`:

Imports — acrescente:

```ts
import { alcanceDaFaixa, type Alcance } from '@/domain/divisao';
import type { Faixa } from '@/domain/parcelamento';
import { descreverTrava, type FaturaTravada } from '@/domain/trava';
import { alcanceInicial, faixaDaLinha, opcoesDeAlcance, temAlcance, travaDoAlcance } from './alcance-da-linha';
import { ControleAlcance } from './controle-alcance';
```

Troque `mensagemExclusao` e o comentário de cima dela por:

```ts
/**
 * A grade mostra a PARCELA (`3/12`), mas excluir age sobre o alcance escolhido
 * — uma parcela, ela e as seguintes, ou todas. A confirmacao soletra quais
 * parcelas somem e em qual faixa de meses: a `competencia` da grade e a da
 * parcela clicada, e `avancarCompetencia` acha as pontas sem nova consulta.
 */
function mensagemExclusao(linha: LinhaGrade, competencia: string, alvo: Faixa): string {
  const fim = 'Essa ação não pode ser desfeita por aqui.';
  if (linha.numeroParcelas <= 1) return `Excluir "${linha.descricao}"? ${fim}`;

  const primeira = formatarCompetencia(avancarCompetencia(competencia, alvo.inicial - linha.numero));
  if (alvo.inicial === alvo.final) {
    return `Excluir a parcela ${alvo.inicial} de "${linha.descricao}", de ${primeira}. ${fim}`;
  }
  const ultima = formatarCompetencia(avancarCompetencia(competencia, alvo.final - linha.numero));
  return (
    `Excluir "${linha.descricao}" remove as parcelas ${alvo.inicial} a ${alvo.final}, ` +
    `de ${primeira} a ${ultima}. ${fim}`
  );
}
```

Acrescente `travadas: readonly FaturaTravada[];` ao tipo `Props`, e troque o começo de
`DialogoExclusao` — da assinatura até antes de `function aoMudarAberto` — por:

```tsx
export function DialogoExclusao({ linha, competencia, travadas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const opcoes = opcoesDeAlcance(linha, competencia, travadas);
  const padrao = (): Alcance => (temAlcance(linha) ? (alcanceInicial(opcoes) ?? 'SO_ESTA') : 'TODAS');
  const [alcance, setAlcance] = useState<Alcance>(padrao);
  /** O mes da propria linha esta travado: nenhum alcance sai daqui. */
  const travaDaLinha = travaDoAlcance(linha, competencia, travadas, 'SO_ESTA');
  const alvo = alcanceDaFaixa(faixaDaLinha(linha), linha.numero, alcance);
```

Em `aoMudarAberto`, depois de `setAberto(novoAberto);`, acrescente
`if (novoAberto) setAlcance(padrao());` — o diálogo fica montado com a linha, e as travadas
podem ter mudado desde a última abertura.

Em `excluir`, troque a chamada e o tratamento:

```ts
        const resultado = await acaoExcluirLancamento(linha.lancamentoId, linha.versao, alcance, linha.numero);
        if (!resultado.ok) {
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? descreverTrava(resultado.travada)
              : 'Alguém alterou esse lançamento antes. Atualize a página e tente de novo.',
          );
          return;
        }
        setAberto(false);
        const quantas = alvo.final - alvo.inicial + 1;
        toast.success(
          linha.numeroParcelas <= 1
            ? 'Lançamento excluído'
            : quantas === 1
              ? 'Parcela excluída'
              : `${quantas} parcelas excluídas`,
        );
```

No JSX: troque `{mensagemExclusao(linha, competencia)}` por
`{mensagemExclusao(linha, competencia, alvo)}`. Logo depois de `</AlertDialogHeader>`:

```tsx
        {travaDaLinha ? (
          <p role="alert" className="rounded-caixa border border-atencao bg-atencao-fundo p-3 text-sm text-atencao">
            {descreverTrava(travaDaLinha)}
          </p>
        ) : (
          temAlcance(linha) && (
            <ControleAlcance
              nome={`alcance-exclusao-${linha.parcelaId}`}
              valor={alcance}
              opcoes={opcoes}
              onMudar={setAlcance}
              desabilitado={pendente}
            />
          )
        )}
```

E no `AlertDialogAction`, troque `disabled={pendente}` por
`disabled={pendente || travaDaLinha !== null}`.

- [ ] **Passo 3: Verificar**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: os três sem erro.

Run: `grep -rn "já está fechado" src`
Expected: nada — toda recusa de trava passa por `descreverTrava`.

- [ ] **Passo 4: Commit**

```bash
git add src/components/despesas/dialogo-exclusao.tsx src/components/despesas/secao-pessoa.tsx src/components/despesas/grade-lancamentos.tsx
git commit -m "$(cat <<'EOF'
Da a exclusao o mesmo alcance da edicao, e a mesma frase de trava

Excluir parcelado era tudo ou nada, e nada quando algum mes estava
travado. Agora da para tirar so uma parcela ou quitar o restante, e a
caixa diz quais parcelas somem e de que mes a que mes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarefa 10: Documentação

**Arquivos:**
- Modificar: `docs/regras-de-negocio.md`, `docs/decisoes.md`, `docs/arquitetura.md`,
  `docs/estado.md`, `docs/verificacao-visual.md`, `CLAUDE.md`

Sem código. Cada passo diz o que o texto tem que afirmar; escreva no estilo dos arquivos, em
português, com acento.

- [ ] **Passo 1: `docs/regras-de-negocio.md`**

- §1, *Sobrescrita*: substitua pelo campo **Fatura** — começa no mês da tela; a data só gera
  aviso; meses travados da conta não são oferecidos; recorrentes e importador continuam pela
  data. Tire o `[a confirmar]`.
- §2: *Editar uma parcela — não existe* vira **Editar parte de um parcelado**: os três
  alcances, o que cada um muda, o bloqueio de `TOTAL`, e que dividir cria lançamentos com
  faixa. Mantenha a frase sobre juros, agora dizendo que *só esta* resolve.
- §2, *Alterar o número de parcelas*: em *esta e as seguintes*, o total novo vale para o pedaço
  novo e precisa ser pelo menos o número da parcela; o pedaço de antes guarda o total antigo.
  Tire o `[a confirmar]`.
- §2, *Excluir o lançamento*: os três alcances; o pedaço excluído vai para a lixeira. Tire o
  `[a confirmar]`.
- §5, *Trava*: a regra é *a trava congela as parcelas do mês travado, e só elas*; a recusa
  nomeia parcela, mês e conta; dê o exemplo literal de `descreverTrava`.

- [ ] **Passo 2: `docs/decisoes.md`** — três entradas novas, cada uma com o porquê:

- **Dividir o lançamento, e não guardar atributo por parcela.** Descrição, categoria, pessoa,
  conta e rateio moram no lançamento; descer para a parcela mudaria toda leitura de resumo,
  fatura e gráfico. Dividir não muda nenhuma leitura. O custo aceito: a busca e a lixeira
  mostram pedaços.
- **A Fatura começa no mês da tela, e não pela data.** Quem lança está conferindo a fatura
  daquele mês; a compra de 3/11 que só apareceu na fatura de dezembro é o caso típico. A data
  continua útil como aviso.
- **Linha movida não passa pela barreira.** Mover troca só o `lancamentoId`: valor, número,
  competência e todo campo exibido ficam. Barrá-la impediria *só esta* no mês entre dois
  travados sem proteger nada.

- [ ] **Passo 3: `docs/arquitetura.md`** — na lista de armadilhas, uma nova, numerada em
  sequência:

**Regerar parcelas sem filtrar pela faixa grava parcelas de outro pedaço.** O
`@@unique([lancamentoId, numero])` não pega, porque os pedaços são lançamentos diferentes. Toda
chamada de `gerarParcelas` no repositório passa a faixa: `faixaEscrita` na edição, a de
`parcelaInicial` na criação. Mencione também que a barreira recebe só as parcelas tocadas, e
que olhar o lançamento inteiro era o defeito de 19/11.

Na seção que descreve `lancamento.ts`, atualize: `travaEntre` no lugar de
`temFaturaTravada`/`competenciasTravadas`; `separar`; `lerOriginal`.

- [ ] **Passo 4: `docs/estado.md`**

Atualize a data, a contagem do `npm test` e do `npm run test:banco` (rode os dois e copie a
saída literal, como o arquivo já faz), e registre: o defeito de 19/11, a causa, e o que passou
a existir — Fatura, parcela inicial, alcance em editar e excluir, a frase da trava. Tire
"Editar uma parcela não existe" de onde aparecer.

- [ ] **Passo 5: `docs/verificacao-visual.md`**

Troque o item que cita *"Esse mês já está fechado. Destrave a fatura para lançar."* pelo texto
novo, e acrescente um passo **Trava por parcela**, para o usuário, com o mês de novembro
travado:

- Abrir dezembro, editar a parcela de dezembro de um parcelado que passa por novembro: o
  alcance aparece, *Todas* vem desabilitado com a frase da trava, *Só esta* salva.
- Em *Só esta*, só o valor está habilitado.
- *Esta e as seguintes* mudando a descrição: novembro continua com a descrição antiga.
- Lançar novo em dezembro: a Fatura começa em dezembro, novembro aparece desabilitado
  "travada"; com data de 3/11 aparece o aviso da data, e salva em dezembro.
- "Começa na parcela 3 de 6": a linha nova mostra "3/6" em dezembro.
- Excluir *esta e as seguintes* de dezembro: some de dezembro em diante, novembro fica, e a
  lixeira mostra "parcelas 3 a 6 de 6".
- Abrir uma linha de novembro: aviso no topo, Salvar desabilitado.

- [ ] **Passo 6: `CLAUDE.md`**

No invariante 4, troque o texto por: **cada lançamento grava exatamente as parcelas da sua
faixa**, a soma das cotas de rateio é igual ao valor da parcela, e o resto de centavos tem
destino definido, nunca é descartado. Na tabela de documentos, acrescente a linha da spec
`docs/specs/2026-11-19-trava-por-parcela-design.md`. Atualize a contagem de testes da seção
*Convenções*.

- [ ] **Passo 7: Commit**

```bash
git add docs CLAUDE.md
git commit -m "$(cat <<'EOF'
Registra a trava por parcela nas regras, nas decisoes e no roteiro visual

A regra mudou de "fatura travada congela o lancamento" para "congela as
parcelas daquele mes", e as tres escolhas que parecem melhoraveis -
dividir, a Fatura no mes da tela, a linha movida fora da barreira - ficam
com o motivo escrito antes que alguem as desfaca.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Fechamento (quem coordena, não um subagente)

1. `npm test`, `npm run test:banco`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — todos
   verdes, com a saída copiada para o relato.
2. Revisão final da branch inteira contra a spec.
3. **Pedir a palavra do usuário** para aplicar a migration em produção:
   `npx prisma migrate deploy` (lê `DATABASE_URL` e `DIRECT_URL` do `.env`, que são as de
   produção). Só de adição: o código que está no ar continua funcionando com o banco novo.
4. Conferir em produção, só leitura, que as colunas existem e os 177 lançamentos estão com
   `parcelaInicial = 1` e `parcelaFinal = null`.
5. **Pedir a palavra do usuário** para o merge na `main` e o push, que publica na Vercel.
6. O usuário faz o roteiro de `docs/verificacao-visual.md`, passo *Trava por parcela*.
