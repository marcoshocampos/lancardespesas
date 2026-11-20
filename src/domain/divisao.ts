import { avancarCompetencia } from './competencia';
import type { Faixa } from './parcelamento';
import type { ParcelaAlvo } from './trava';

/**
 * Quanto de um parcelado uma edicao ou exclusao alcanca, a partir da parcela
 * que a pessoa clicou. E o alcance que decide quais parcelas a operacao
 * reescreve — e so essas passam pela barreira de fatura travada.
 */
export type Alcance = 'SO_ESTA' | 'ESTA_E_SEGUINTES' | 'TODAS';

/** Do menos ao mais abrangente: e a ordem do controle e a do padrao. */
export const ALCANCES: readonly Alcance[] = ['SO_ESTA', 'ESTA_E_SEGUINTES', 'TODAS'];

/**
 * O que fazer com um lancamento para alcancar so parte dele.
 *
 * `NO_LUGAR`: o alcance e a faixa inteira, e o lancamento e editado como
 * sempre foi.
 *
 * `DIVIDIR`: o lancamento original fica com `original`, com os campos e as
 * linhas de hoje, sem tocar nelas; `alcance` vira um lancamento novo; e
 * `depois`, quando existe, vira um terceiro, com os campos de hoje, para onde
 * as linhas sao MOVIDAS sem mudar.
 */
export type PlanoDeDivisao =
  | { tipo: 'NO_LUGAR'; alcance: Faixa }
  | { tipo: 'DIVIDIR'; original: Faixa; alcance: Faixa; depois: Faixa | null };

type ColunasDaFaixa = { parcelaInicial: number; parcelaFinal: number | null };

/** A faixa que um lancamento grava, lida das colunas dele. */
export function faixaDoLancamento(l: ColunasDaFaixa & { numeroParcelas: number }): Faixa {
  return { inicial: l.parcelaInicial, final: l.parcelaFinal ?? l.numeroParcelas };
}

/**
 * As colunas que gravam uma faixa. "Ate a ultima parcela" se grava sempre como
 * `parcelaFinal` nulo, a forma que os lancamentos de antes da divisao ja tem:
 * assim um lancamento inteiro continua identico ao de sempre.
 */
export function colunasDaFaixa(faixa: Faixa, numeroParcelas: number): ColunasDaFaixa {
  return {
    parcelaInicial: faixa.inicial,
    parcelaFinal: faixa.final === numeroParcelas ? null : faixa.final,
  };
}

/** As parcelas que o alcance escolhido a partir de `numero` reescreve. */
export function alcanceDaFaixa(faixa: Faixa, numero: number, alcance: Alcance): Faixa {
  if (!Number.isInteger(numero) || numero < faixa.inicial || numero > faixa.final) {
    throw new Error(`Parcela ${numero} fora da faixa ${faixa.inicial} a ${faixa.final}`);
  }
  switch (alcance) {
    case 'TODAS':
      return faixa;
    case 'ESTA_E_SEGUINTES':
      return { inicial: numero, final: faixa.final };
    case 'SO_ESTA':
      return { inicial: numero, final: numero };
  }
}

export function planejarDivisao(faixa: Faixa, numero: number, alcance: Alcance): PlanoDeDivisao {
  const alvo = alcanceDaFaixa(faixa, numero, alcance);
  const antes: Faixa | null =
    alvo.inicial > faixa.inicial ? { inicial: faixa.inicial, final: alvo.inicial - 1 } : null;
  const depois: Faixa | null =
    alvo.final < faixa.final ? { inicial: alvo.final + 1, final: faixa.final } : null;

  // O original fica com o pedaco de ANTES quando ele existe: e onde mora o mes
  // travado no caso comum, e assim ele nunca muda de id nem de linha.
  if (antes) return { tipo: 'DIVIDIR', original: antes, alcance: alvo, depois };
  // Sem antes, o original fica com o de depois — tambem sem mover linha.
  if (depois) return { tipo: 'DIVIDIR', original: depois, alcance: alvo, depois: null };
  return { tipo: 'NO_LUGAR', alcance: alvo };
}

/** O maior parcelamento que o sistema aceita: o `max` do campo e o do esquema da action. */
export const MAXIMO_DE_PARCELAS = 72;

/** Os totais de parcelas que uma edicao pode gravar, inclusive nas duas pontas. */
export type LimitesDeParcelas = { minimo: number; maximo: number };

/**
 * Os totais que `faixaEscrita` aceita para este alcance: o `min` e o `max` do
 * campo Parcelas, e o que a recusa do servidor devolve.
 *
 * **So o alcance que chega a ultima parcela da compra muda o total.** Os
 * pedacos de uma compra nao se sobrepoem, e quem garante isso e esta regra.
 * Um pedaco que para antes — o de antes de uma divisao, ou o que ficou depois
 * de excluir as seguintes — tem as parcelas seguintes em outro lancamento,
 * vivo ou na lixeira. Baixar o total dele ate a propria ponta gravava
 * `parcelaFinal` nulo, e o pedaco passava a parecer o ultimo: subir o total de
 * novo regerava parcelas que eram do vizinho. Nenhum indice pega, porque sao
 * lancamentos diferentes (armadilha 25 de `docs/arquitetura.md`).
 */
export function limitesDeParcelas(alcance: Faixa, totalAntigo: number): LimitesDeParcelas {
  if (alcance.final !== totalAntigo) return { minimo: totalAntigo, maximo: totalAntigo };
  return { minimo: alcance.inicial, maximo: MAXIMO_DE_PARCELAS };
}

/**
 * A faixa que o pedaco reescrito ocupa depois da edicao, com o total novo.
 *
 * Se o alcance ia ate a ultima parcela, ele acompanha o total novo — e assim
 * que "esta e as seguintes" renegocia o resto. Se parava antes, nada muda: a
 * ponta fica onde estava, e o total tambem (ver `limitesDeParcelas`). `null`
 * quando o total novo esta fora dos limites.
 */
export function faixaEscrita(alcance: Faixa, totalAntigo: number, totalNovo: number): Faixa | null {
  const { minimo, maximo } = limitesDeParcelas(alcance, totalAntigo);
  if (!Number.isInteger(totalNovo) || totalNovo < minimo || totalNovo > maximo) return null;
  return { inicial: alcance.inicial, final: alcance.final === totalAntigo ? totalNovo : alcance.final };
}

/**
 * A frase da recusa de um total fora dos limites. Com os dois limites iguais
 * ela nao diz o porque: o caso comum e o pedaco que para antes da ultima, mas
 * uma compra de `MAXIMO_DE_PARCELAS` editada na ultima parcela da o mesmo par.
 */
export function descreverLimitesDeParcelas({ minimo, maximo }: LimitesDeParcelas): string {
  if (minimo === maximo) return `Nesta parte da compra, o total tem que continuar em ${minimo} parcelas.`;
  return `O total de parcelas tem que ficar entre ${minimo} e ${maximo}.`;
}

/** As parcelas de uma faixa e o mes de cada uma, a partir de uma parcela conhecida. */
export function parcelasDaFaixa(faixa: Faixa, referencia: ParcelaAlvo): ParcelaAlvo[] {
  const parcelas: ParcelaAlvo[] = [];
  for (let numero = faixa.inicial; numero <= faixa.final; numero += 1) {
    parcelas.push({
      numero,
      competencia: avancarCompetencia(referencia.competencia, numero - referencia.numero),
    });
  }
  return parcelas;
}

/**
 * Como a busca e a lixeira descrevem um lancamento que nao tem a compra
 * inteira. `null` quando tem: ai o "12x" de sempre basta.
 */
export function rotuloDaFaixa(faixa: Faixa, numeroParcelas: number): string | null {
  if (faixa.inicial === 1 && faixa.final === numeroParcelas) return null;
  if (faixa.inicial === faixa.final) return `parcela ${faixa.inicial} de ${numeroParcelas}`;
  return `parcelas ${faixa.inicial} a ${faixa.final} de ${numeroParcelas}`;
}
