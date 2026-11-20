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
 * Um trecho contiguo das parcelas de uma compra, pelos numeros, `inicial` e
 * `final` inclusive. Um lancamento grava exatamente a faixa dele: dividir um
 * parcelado (editar so uma parcela, ou dela em diante) parte a faixa em
 * pedacos, cada um um lancamento.
 */
export type Faixa = { inicial: number; final: number };

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
