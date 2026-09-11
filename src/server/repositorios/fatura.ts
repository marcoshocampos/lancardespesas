import type { StatusFatura } from '@prisma/client';
import { diaClampeado } from '@/domain/data';
import { prisma } from '../db';

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
  return { ok: true };
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
