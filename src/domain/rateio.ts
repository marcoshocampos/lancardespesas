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
