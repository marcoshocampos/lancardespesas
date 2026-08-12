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
