import type { Centavos } from './money';

/**
 * Uma parcela, reduzida ao que os gráficos precisam saber dela.
 *
 * `numero` é o que separa "compra feita neste mês" de "parcela de compra
 * anterior" — a distinção que torna a evolução mensal honesta. Ver
 * `evolucaoMensal`.
 */
export type ParcelaDeGrafico = {
  competencia: string;
  numero: number;
  valorCentavos: Centavos;
  categoriaNome: string;
  categoriaCor: string;
};

export type FatiaDeCategoria = {
  nome: string;
  cor: string;
  valorCentavos: Centavos;
};

/**
 * O ranking de categorias de UMA competência, da maior para a menor.
 *
 * Empate desempata por nome, para o gráfico não trocar de ordem entre dois
 * renders com os mesmos dados — ordem que dança sem o dado mudar faz a pessoa
 * duvidar do que está vendo.
 *
 * Categoria sem gasto no mês não aparece: barra de valor zero ocupa linha e não
 * diz nada.
 */
export function rankingDeCategorias(parcelas: ParcelaDeGrafico[]): FatiaDeCategoria[] {
  const por = new Map<string, FatiaDeCategoria>();

  for (const p of parcelas) {
    const atual = por.get(p.categoriaNome);
    if (atual) atual.valorCentavos += p.valorCentavos;
    else por.set(p.categoriaNome, { nome: p.categoriaNome, cor: p.categoriaCor, valorCentavos: p.valorCentavos });
  }

  return [...por.values()]
    .filter((f) => f.valorCentavos !== 0)
    .sort((a, b) => b.valorCentavos - a.valorCentavos || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type MesDaEvolucao = {
  competencia: string;
  /** Parcelas de número 1: compras começadas naquele mês. */
  novasCentavos: Centavos;
  /** Parcelas de número maior que 1: compromisso vindo de compra anterior. */
  anterioresCentavos: Centavos;
  totalCentavos: Centavos;
};

/**
 * A evolução mês a mês, separada em **compras novas** e **parcelas de compras
 * anteriores**.
 *
 * A separação não é enfeite: é o que impede o gráfico de mentir. Um mês em que
 * ninguém lançou nada ainda aparece com valor, porque parcelas de uma compra
 * antiga caem nele — e uma linha única desenharia isso como "gasto daquele
 * mês". Empilhando as duas séries, um mês feito só de compromisso antigo se
 * mostra pelo que é: a faixa de "compras novas" fica vazia.
 *
 * Vale igual para o outro lado. Uma queda nos meses à frente não é "gastando
 * menos": é parcelado terminando, e a faixa de novas sendo zero diz isso
 * sozinha, sem texto explicativo.
 *
 * Meses sem nenhuma parcela **não entram**: a série é esparsa de propósito, e
 * quem desenha decide se preenche o buraco. Inventar zero aqui seria afirmar
 * que houve um mês de gasto zero, que é diferente de não haver registro.
 */
export function evolucaoMensal(parcelas: ParcelaDeGrafico[]): MesDaEvolucao[] {
  const por = new Map<string, MesDaEvolucao>();

  for (const p of parcelas) {
    const mes = por.get(p.competencia) ?? {
      competencia: p.competencia,
      novasCentavos: 0,
      anterioresCentavos: 0,
      totalCentavos: 0,
    };
    if (p.numero === 1) mes.novasCentavos += p.valorCentavos;
    else mes.anterioresCentavos += p.valorCentavos;
    mes.totalCentavos += p.valorCentavos;
    por.set(p.competencia, mes);
  }

  // Competência é `AAAA-MM`, então ordem alfabética é ordem cronológica.
  return [...por.values()].sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export type MesProjetado = {
  competencia: string;
  valorCentavos: Centavos;
};

export type Projecao = {
  meses: MesProjetado[];
  /** A soma de tudo que já está comprometido daqui pra frente. */
  totalCentavos: Centavos;
  /** A última competência com parcela, ou `null` se não houver nenhuma. */
  ultimaCompetencia: string | null;
};

/**
 * O que já está comprometido **depois** de uma competência.
 *
 * É a pergunta que a planilha nunca soube responder, porque uma aba por mês não
 * enxerga a parcela que ainda vai cair. Aqui não há estimativa nenhuma: cada
 * real deste gráfico é uma parcela já gravada.
 *
 * Exclui a própria competência de referência — ela é o presente, e já aparece
 * inteira no Resumo e na evolução. "Projeção" que inclui o mês corrente mistura
 * o que falta pagar com o que já foi.
 */
export function projecao(parcelas: ParcelaDeGrafico[], aPartirDe: string): Projecao {
  const por = new Map<string, Centavos>();

  for (const p of parcelas) {
    if (p.competencia <= aPartirDe) continue;
    por.set(p.competencia, (por.get(p.competencia) ?? 0) + p.valorCentavos);
  }

  const meses = [...por]
    .map(([competencia, valorCentavos]) => ({ competencia, valorCentavos }))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));

  return {
    meses,
    totalCentavos: meses.reduce((acc, m) => acc + m.valorCentavos, 0),
    ultimaCompetencia: meses.length > 0 ? (meses[meses.length - 1]?.competencia ?? null) : null,
  };
}
