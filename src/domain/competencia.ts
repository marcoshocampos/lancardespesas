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
