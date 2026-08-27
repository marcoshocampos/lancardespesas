import { ultimoDiaDoMes } from '@/domain/data';
import { prisma } from '../db';

const FORMATO_COMPETENCIA = /^(\d{4})-(\d{2})$/;

// O brief original montava a data com `${competencia}-${dia}` sem checar se o dia existe
// naquele mes: dia de fechamento/vencimento 31 numa competencia de fevereiro produzia
// "2026-02-31", uma data que nao existe no calendario. `dataFechamento`/`dataVencimento`
// sao String no schema, entao o Postgres aceita o valor sem reclamar — o problema so
// aparece se algo tentar interpretar essa string como data de verdade. O dominio ja resolve
// o mesmo caso em `competenciaDeCartao` (src/domain/competencia.ts) com
// `Math.min(diaFechamento, ultimoDiaDoMes(...))`; aplicamos a mesma regra aqui.
function diaNaCompetencia(competencia: string, dia: number): string {
  const casou = FORMATO_COMPETENCIA.exec(competencia);
  if (!casou) throw new Error(`Competencia invalida: ${competencia}`);

  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  const diaEfetivo = Math.min(dia, ultimoDiaDoMes(ano, mes));

  return `${competencia}-${String(diaEfetivo).padStart(2, '0')}`;
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
