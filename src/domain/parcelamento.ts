import { avancarCompetencia, type Competencia } from './competencia';
import type { Centavos } from './money';

/** Se o valor digitado pela pessoa e o de cada parcela ou o total da compra. */
export type OrigemValor = 'POR_PARCELA' | 'TOTAL';

export type EntradaParcelamento = {
  valorCentavos: Centavos;
  origem: OrigemValor;
  numeroParcelas: number;
  competenciaBase: Competencia;
};

export type ParcelaGerada = {
  numero: number;
  valorCentavos: Centavos;
  competencia: Competencia;
};

/**
 * Gera as parcelas de um lancamento.
 *
 * Com origem TOTAL, a divisao e em centavos e a diferenca de arredondamento vai
 * na ULTIMA parcela, de modo que a soma seja sempre exatamente o total.
 */
export function gerarParcelas(entrada: EntradaParcelamento): ParcelaGerada[] {
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

  return valores.map((valor, indice) => ({
    numero: indice + 1,
    valorCentavos: valor,
    competencia: avancarCompetencia(competenciaBase, indice),
  }));
}
