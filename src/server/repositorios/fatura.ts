import type { Prisma, StatusFatura } from '@prisma/client';
import { conferir } from '@/domain/conferencia';
import { diaClampeado } from '@/domain/data';
import { prisma } from '../db';

type ClienteBanco = Prisma.TransactionClient;

/** Mesma definicao de resumo.ts: parcela cancelada ou de lancamento na lixeira nao soma. */
const PARCELA_VISIVEL = { cancelada: false, lancamento: { deletadoEm: null } };

/**
 * O `Somado` da coluna desta conta, nesta competencia — o mesmo numero que
 * `calcularResumo` poe em `somado[contaId]`.
 *
 * Existe porque o status da fatura e decidido no servidor, nunca pelo que a
 * tela manda: quem confere e quem grava tem que somar do mesmo lugar. Inclui
 * reembolso, porque o Somado e a fatura e o dinheiro saiu da conta.
 */
async function somadoDaConta(
  db: ClienteBanco,
  contaId: string,
  competencia: string,
): Promise<number> {
  const soma = await db.parcela.aggregate({
    where: { competencia, ...PARCELA_VISIVEL, lancamento: { deletadoEm: null, contaId } },
    _sum: { valorCentavos: true },
  });
  return soma._sum.valorCentavos ?? 0;
}

/**
 * ABERTA ou CONFERIDA, conforme o extrato bate com o somado.
 *
 * CONFERIDA existia no enum e nunca era escrita — o enum mentia sobre o que o
 * sistema fazia. Agora ela e automatica: a conferencia ja calculava se bate, so
 * nao guardava. TRAVADA nunca sai daqui, porque travar e gesto humano.
 */
async function statusPeloExtrato(
  db: ClienteBanco,
  contaId: string,
  competencia: string,
  valorRealCentavos: number | null,
): Promise<'ABERTA' | 'CONFERIDA'> {
  if (valorRealCentavos === null) return 'ABERTA';
  const somado = await somadoDaConta(db, contaId, competencia);
  return conferir(somado, valorRealCentavos).situacao === 'BATE' ? 'CONFERIDA' : 'ABERTA';
}

/** Registra quem fez o que com a fatura. Primeiro uso da tabela Auditoria. */
async function auditar(
  db: ClienteBanco,
  faturaId: string,
  acao: 'TRAVAR' | 'DESTRAVAR',
  membroId: string | null,
  diff: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditoria.create({
    data: { tabela: 'Fatura', registroId: faturaId, acao, ...(membroId ? { membroId } : {}), diff },
  });
}

const FORMATO_COMPETENCIA = /^(\d{4})-(\d{2})$/;

// O brief original montava a data com `${competencia}-${dia}` sem checar se o dia existe
// naquele mes: dia de fechamento/vencimento 31 numa competencia de fevereiro produzia
// "2026-02-31", uma data que nao existe no calendario. `dataFechamento`/`dataVencimento`
// sao String no schema, entao o Postgres aceita o valor sem reclamar — o problema so
// aparece se algo tentar interpretar essa string como data de verdade. `diaClampeado`
// (src/domain/data.ts) e a mesma regra que `competenciaDeCartao` usa para o fechamento,
// extraida para nao existir em dois lugares com um deles sem teste.
function diaNaCompetencia(competencia: string, dia: number): string {
  const casou = FORMATO_COMPETENCIA.exec(competencia);
  if (!casou) throw new Error(`Competencia invalida: ${competencia}`);

  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  const diaEfetivo = diaClampeado(ano, mes, dia);

  return `${competencia}-${String(diaEfetivo).padStart(2, '0')}`;
}

export type ResultadoRegistroValorReal = { ok: true } | { ok: false; motivo: 'FATURA_TRAVADA' };

export type ResultadoTrava =
  | { ok: true }
  | { ok: false; motivo: 'FATURA_TRAVADA' | 'SEM_EXTRATO' | 'NAO_EXISTE' | 'NAO_ESTAVA_TRAVADA' };

export async function registrarValorReal(
  contaId: string,
  competencia: string,
  valorCentavos: number,
): Promise<ResultadoRegistroValorReal> {
  const conta = await prisma.conta.findUniqueOrThrow({ where: { id: contaId } });
  if (conta.tipo !== 'CARTAO') throw new Error('Conferencia so existe em conta de cartao');
  if (conta.diaFechamento === null || conta.diaVencimento === null) {
    throw new Error(`Conta de cartao sem fechamento ou vencimento: ${conta.nome}`);
  }
  // Extraidos para constantes porque o TypeScript descarta o narrowing de
  // propriedade dentro da closure da transacao, abaixo.
  const { diaFechamento, diaVencimento } = conta;

  // Fatura travada e somente-leitura: destravar e acao explicita e auditada em outro
  // lugar. O upsert sozinho nao olha o status, entao o pre-check e obrigatorio aqui —
  // criar/editar/excluir lancamento ja recusam do mesmo jeito (lancamento.ts).
  const existente = await prisma.fatura.findUnique({
    where: { contaId_competencia: { contaId, competencia } },
    select: { status: true },
  });
  if (existente?.status === 'TRAVADA') {
    return { ok: false, motivo: 'FATURA_TRAVADA' };
  }

  // O status acompanha o valor na mesma transacao. Corrigir o extrato para um
  // numero que nao bate tem que DESfazer o CONFERIDA — senao a fatura fica
  // marcada como conferida exibindo uma diferenca.
  await prisma.$transaction(async (tx) => {
    const status = await statusPeloExtrato(tx, contaId, competencia, valorCentavos);
    await tx.fatura.upsert({
      where: { contaId_competencia: { contaId, competencia } },
      update: { valorRealCentavos: valorCentavos, status },
      create: {
        contaId,
        competencia,
        valorRealCentavos: valorCentavos,
        status,
        dataFechamento: diaNaCompetencia(competencia, diaFechamento),
        dataVencimento: diaNaCompetencia(competencia, diaVencimento),
      },
    });
  });
  return { ok: true };
}

/**
 * Fecha o mes: a fatura passa a somente-leitura e nenhuma gravacao de
 * lancamento alcanca mais aquelas competencias (lancamento.ts recusa).
 *
 * **Exige o extrato preenchido.** Travar significa "conferi contra o extrato e
 * fechei"; deixar travar sem conferir permitiria congelar um mes com erro
 * dentro, e ai destravar viraria rotina em vez de excecao.
 */
export async function travarFatura(
  contaId: string,
  competencia: string,
  membroId: string | null,
): Promise<ResultadoTrava> {
  return prisma.$transaction(async (tx) => {
    const fatura = await tx.fatura.findUnique({
      where: { contaId_competencia: { contaId, competencia } },
      select: { id: true, status: true, valorRealCentavos: true },
    });
    if (!fatura) return { ok: false, motivo: 'NAO_EXISTE' };
    if (fatura.status === 'TRAVADA') return { ok: false, motivo: 'FATURA_TRAVADA' };
    if (fatura.valorRealCentavos === null) return { ok: false, motivo: 'SEM_EXTRATO' };

    await tx.fatura.update({
      where: { id: fatura.id },
      data: {
        status: 'TRAVADA',
        travadaEm: new Date(),
        ...(membroId ? { travadaPorMembroId: membroId } : {}),
      },
    });
    await auditar(tx, fatura.id, 'TRAVAR', membroId, {
      de: fatura.status,
      para: 'TRAVADA',
      valorRealCentavos: fatura.valorRealCentavos,
    });
    return { ok: true };
  });
}

/**
 * Reabre o mes. O invariante 5 diz que destravar e **acao explicita e
 * auditada** — a explicitude e o dialogo de confirmacao na tela, a auditoria e
 * a linha gravada aqui.
 *
 * O status nao volta para ABERTA por decreto: volta para o que o extrato diz
 * hoje. Um mes que batia continua CONFERIDA depois de reaberto.
 */
export async function destravarFatura(
  contaId: string,
  competencia: string,
  membroId: string | null,
): Promise<ResultadoTrava> {
  return prisma.$transaction(async (tx) => {
    const fatura = await tx.fatura.findUnique({
      where: { contaId_competencia: { contaId, competencia } },
      select: { id: true, status: true, valorRealCentavos: true },
    });
    if (!fatura) return { ok: false, motivo: 'NAO_EXISTE' };
    if (fatura.status !== 'TRAVADA') return { ok: false, motivo: 'NAO_ESTAVA_TRAVADA' };

    const status = await statusPeloExtrato(tx, contaId, competencia, fatura.valorRealCentavos);
    await tx.fatura.update({
      where: { id: fatura.id },
      data: { status, travadaEm: null, travadaPorMembroId: null },
    });
    await auditar(tx, fatura.id, 'DESTRAVAR', membroId, {
      de: 'TRAVADA',
      para: status,
      valorRealCentavos: fatura.valorRealCentavos,
    });
    return { ok: true };
  });
}

/**
 * O valor do extrato e o `status` numa consulta so. A faixa de conferencia
 * precisa dos dois — o numero para preencher o campo, o status para saber se
 * a fatura travada desabilita esse campo — e duas funcoes lado a lado
 * custariam duas leituras da mesma linha.
 *
 * `null` quando nao existe linha de fatura na competencia: ninguem conferiu
 * ainda. Quem le trata essa ausencia como fatura `ABERTA`.
 */
export async function carregarFatura(
  contaId: string,
  competencia: string,
): Promise<{ valorRealCentavos: number | null; status: StatusFatura } | null> {
  return prisma.fatura.findUnique({
    where: { contaId_competencia: { contaId, competencia } },
    select: { valorRealCentavos: true, status: true },
  });
}
