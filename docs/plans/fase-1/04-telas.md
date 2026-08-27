# Etapa 04 — Telas

Tarefas 10 a 13. A grade do mês, a digitação, a matriz de totais na tela e a conferência
contra o extrato. É onde o casal passa o tempo.

Todas **pendentes**, com o código completo.

Restrições globais em [README.md](README.md#restrições-globais). Leia antes de executar.

Duas coisas desta etapa que erram fácil e vale ter em mente antes de começar:

- **A grade mostra parcela, nunca lançamento.** É o que faz um parcelado aparecer uma vez
  por mês, em vez de o valor inteiro todo mês.
- **O rateio é calculado sobre o valor da parcela, não do lançamento.** Um parcelado de
  conjunto rateia R$ 101,01 por mês, não o total da compra. Errar isso deixa a linha
  `METADE` errada por meses seguidos sem ninguém notar.

O layout entregue aqui é o **B**, de lista única com coluna "de quem". O layout A, de três
painéis, e o seletor entre os dois ficam para a Fase 2 — construir dois renderizadores antes
de alguém ter usado o sistema é pagar caro por uma preferência não testada.

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

