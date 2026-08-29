# Etapa 03 — Persistência e acesso

Tarefas 7 a 9. O banco, quem entra e como se grava sem sobrescrever o outro.

As tarefas 7 e 8 estão **concluídas** e aparecem enxutas. A tarefa 9 está **pendente** e
mantém o código completo, porque é o que o agente transcreve.

Restrições globais em [README.md](README.md#restrições-globais). Leia antes de executar.

---

## Tarefa 7 — Schema do Prisma, migration e seed · **concluída**

**Commit:** `41042a6`
**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `src/server/db.ts`

Postgres no Neon, com Prisma **6.19.3** — versão fixada de propósito, ver
[decisões](../../decisoes.md#prisma-6-em-vez-do-7).

Modelos: `Membro`, `Conta`, `Categoria`, `Lancamento`, `Parcela`, `Rateio`, `Fatura`,
`Auditoria`. Migration aplicada, seed rodado: 2 membros, 8 categorias, C6 (fechamento 4,
vencimento 10) e a conta Externa.

Três decisões do modelo físico que não devem ser "corrigidas":

- **`dataCompra`, `competencia`, `dataFechamento` e `dataVencimento` são `String`**, não
  `DateTime`. É o que garante que nenhuma camada aplique fuso e mova a compra do dia do
  fechamento para o dia anterior, jogando-a na fatura errada.
- **Valores são `Int` em centavos.** Nenhum `Float`, nenhum `Decimal`.
- **`Lancamento` tem `versao` e `deletadoEm`** desde o primeiro dia — lock otimista e lixeira
  custam uma coluna agora e viram retrabalho em toda action depois.

Ids fixos que as tarefas seguintes consomem: **`conta-c6`** e **`conta-externa`**.

O seed é idempotente (usa `upsert`) e **deriva o nome do membro do e-mail**, lido de
`EMAILS_AUTORIZADOS` — assim nenhum e-mail real fica em arquivo versionado. Os nomes saem
como "Nick" e "Nardy" derivados, e são corrigidos pela tela depois.

Não rode `prisma init`: ele mexe no `.env` e no `.gitignore`, que já estão prontos, e pode
acrescentar uma segunda linha `DATABASE_URL` que quebra a conexão de um jeito confuso de
diagnosticar.

---

## Tarefa 8 — Autenticação com Google e allowlist · **concluída**

**Commits:** `d18df64`, `cae2eca` · **10 testes**
**Arquivos:** `src/server/auth.ts`, `src/server/auth-regras.ts`, `src/middleware.ts`,
`src/app/api/auth/[...nextauth]/route.ts`, `src/app/(auth)/entrar/page.tsx`

Auth.js v5 com provider Google e sessão em JWT — sem tabela de auth no banco, conforme a
decisão de manter o Neon Auth desativado.

**A regra de autorização mora em `auth-regras.ts`, separada do Auth.js e sem nenhuma
dependência dele.** É o que permite testá-la em milissegundos, sem browser e sem OAuth:

```ts
emailAutorizado(email, lista): boolean
loginPermitido(perfil, lista): boolean
```

Duas propriedades que os testes fixam e que não podem regredir:

- **Lista vazia recusa todo mundo.** Uma variável de ambiente esquecida não pode virar porta
  aberta.
- **`email_verified` precisa ser exatamente `true`.** Ausência do dado recusa, nunca libera.
  Isso não estava no plano original e foi acrescentado depois — ver
  [decisões](../../decisoes.md#e-mail-verificado-antes-da-allowlist).

O `middleware.ts` protege todas as rotas por padrão, com exceção de `/entrar`, dos
endpoints de auth e dos estáticos. A lista de e-mails vem de `EMAILS_AUTORIZADOS`.

Com o app do Google em modo de teste, só quem está em *Público-alvo → Usuários de teste*
consegue chegar até a allowlist — na prática, duas camadas.

### Verificação que só uma pessoa pode fazer

Nenhum agente consegue completar um login OAuth interativo. Estes três cenários precisam de
alguém no navegador, e valem a cada mudança em auth:

1. Abrir `/despesas` sem sessão redireciona para `/entrar`.
2. Entrar com um e-mail **da** allowlist chega em `/despesas`.
3. Entrar com uma conta Google **fora** da allowlist é recusado e volta para `/entrar`.

O terceiro é o que não pode falhar.

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
que só roda com um opt-in explícito.

**O opt-in não é burocracia.** O teste limpa as tabelas de lançamento antes de cada caso, e
aponta para o mesmo banco que a aplicação usa. Sem a trava, `npm test` rodado por distração
depois da Tarefa 14 apagaria os lançamentos reais de agosto. Rode-o assim:

```bash
TESTE_DESTRUTIVO=1 npx vitest run src/server/repositorios/lancamento.test.ts
```

Antes da Fase 2, troque isso por um banco de teste próprio — uma branch do Neon serve — e aí
a trava pode sair.

`src/server/repositorios/lancamento.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarLancamento, editarLancamento } from './lancamento';

// Este teste APAGA lancamentos, parcelas e rateios do banco apontado por
// DATABASE_URL. Fica atras de um opt-in explicito para que um `npm test`
// distraido nunca destrua dado real depois da importacao da planilha.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('gravacao com lock otimista', () => {
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

