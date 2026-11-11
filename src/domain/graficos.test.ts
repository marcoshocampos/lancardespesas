import { describe, expect, it } from 'vitest';
import {
  evolucaoMensal,
  projecao,
  rankingDeCategorias,
  type ParcelaDeGrafico,
} from './graficos';

/** Números inventados, como manda o CLAUDE.md: o repositório não recebe dado financeiro. */
function parcela(
  competencia: string,
  numero: number,
  valorCentavos: number,
  categoriaNome = 'Mercado',
  categoriaCor = '#0C6E79',
): ParcelaDeGrafico {
  return { competencia, numero, valorCentavos, categoriaNome, categoriaCor };
}

describe('rankingDeCategorias', () => {
  it('soma por categoria e ordena da maior para a menor', () => {
    const r = rankingDeCategorias([
      parcela('2026-09', 1, 1000, 'Mercado'),
      parcela('2026-09', 1, 5000, 'Veículo', '#1B7C90'),
      parcela('2026-09', 1, 2000, 'Mercado'),
    ]);

    expect(r.map((f) => [f.nome, f.valorCentavos])).toEqual([
      ['Veículo', 5000],
      ['Mercado', 3000],
    ]);
  });

  it('desempata por nome, para a ordem não dançar entre renders iguais', () => {
    const r = rankingDeCategorias([
      parcela('2026-09', 1, 1000, 'Zelador'),
      parcela('2026-09', 1, 1000, 'Alimentação'),
    ]);

    expect(r.map((f) => f.nome)).toEqual(['Alimentação', 'Zelador']);
  });

  it('omite categoria que zerou por estorno', () => {
    // Barra de valor zero ocupa linha e não diz nada.
    const r = rankingDeCategorias([
      parcela('2026-09', 1, 1000, 'Jogo'),
      parcela('2026-09', 1, -1000, 'Jogo'),
      parcela('2026-09', 1, 500, 'Mercado'),
    ]);

    expect(r.map((f) => f.nome)).toEqual(['Mercado']);
  });

  it('leva a cor da categoria junto', () => {
    const r = rankingDeCategorias([parcela('2026-09', 1, 100, 'Veículo', '#1B7C90')]);
    expect(r[0]?.cor).toBe('#1B7C90');
  });

  it('devolve lista vazia para mês sem parcela', () => {
    expect(rankingDeCategorias([])).toEqual([]);
  });
});

describe('evolucaoMensal', () => {
  it('separa compra nova de parcela de compra anterior', () => {
    const r = evolucaoMensal([
      parcela('2026-09', 1, 3000),
      parcela('2026-09', 4, 1000),
      parcela('2026-09', 7, 500),
    ]);

    expect(r).toHaveLength(1);
    expect(r[0]?.novasCentavos).toBe(3000);
    expect(r[0]?.anterioresCentavos).toBe(1500);
    expect(r[0]?.totalCentavos).toBe(4500);
  });

  it('mostra como zero em novas o mês feito só de compromisso antigo', () => {
    // É o caso que uma linha única desenharia como "gasto daquele mês", e que
    // a separação existe para desmentir.
    const r = evolucaoMensal([parcela('2026-05', 2, 12000), parcela('2026-05', 3, 8000)]);

    expect(r[0]?.novasCentavos).toBe(0);
    expect(r[0]?.anterioresCentavos).toBe(20000);
  });

  it('ordena cronologicamente, que em AAAA-MM é a ordem alfabética', () => {
    const r = evolucaoMensal([
      parcela('2027-01', 1, 100),
      parcela('2026-09', 1, 100),
      parcela('2026-12', 1, 100),
    ]);

    expect(r.map((m) => m.competencia)).toEqual(['2026-09', '2026-12', '2027-01']);
  });

  it('não inventa mês sem parcela', () => {
    // Zero afirmaria "houve um mês de gasto zero", que é diferente de "não há
    // registro". Quem desenha decide se preenche o buraco.
    const r = evolucaoMensal([parcela('2026-09', 1, 100), parcela('2026-12', 1, 100)]);

    expect(r.map((m) => m.competencia)).toEqual(['2026-09', '2026-12']);
  });
});

describe('projecao', () => {
  const dados = [
    parcela('2026-09', 1, 10000),
    parcela('2026-10', 2, 8000),
    parcela('2026-11', 3, 8000),
    parcela('2026-12', 4, 5000),
  ];

  it('soma o que cai depois da competência de referência', () => {
    const r = projecao(dados, '2026-09');

    expect(r.meses.map((m) => m.competencia)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(r.totalCentavos).toBe(21000);
  });

  it('exclui a própria competência de referência', () => {
    // Projeção que inclui o mês corrente mistura o que falta pagar com o que
    // já foi: ele aparece inteiro no Resumo e na evolução.
    const r = projecao(dados, '2026-09');
    expect(r.meses.some((m) => m.competencia === '2026-09')).toBe(false);
  });

  it('diz até quando vai o compromisso', () => {
    expect(projecao(dados, '2026-09').ultimaCompetencia).toBe('2026-12');
  });

  it('devolve vazio quando não há nada à frente', () => {
    const r = projecao(dados, '2027-06');

    expect(r.meses).toEqual([]);
    expect(r.totalCentavos).toBe(0);
    expect(r.ultimaCompetencia).toBeNull();
  });
});
