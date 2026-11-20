import { describe, expect, it } from 'vitest';
import {
  ALCANCES,
  MAXIMO_DE_PARCELAS,
  alcanceDaFaixa,
  colunasDaFaixa,
  descreverLimitesDeParcelas,
  faixaDoLancamento,
  faixaEscrita,
  limitesDeParcelas,
  parcelasDaFaixa,
  planejarDivisao,
  rotuloDaFaixa,
} from './divisao';

const doze = { inicial: 1, final: 12 };

describe('faixaDoLancamento e colunasDaFaixa', () => {
  it('le parcelaFinal nulo como ate a ultima parcela', () => {
    expect(faixaDoLancamento({ parcelaInicial: 1, parcelaFinal: null, numeroParcelas: 12 })).toEqual(doze);
    expect(faixaDoLancamento({ parcelaInicial: 4, parcelaFinal: 6, numeroParcelas: 12 })).toEqual({
      inicial: 4,
      final: 6,
    });
  });

  it('grava a ultima parcela como nulo, e o resto pelo numero', () => {
    expect(colunasDaFaixa(doze, 12)).toEqual({ parcelaInicial: 1, parcelaFinal: null });
    expect(colunasDaFaixa({ inicial: 1, final: 3 }, 12)).toEqual({ parcelaInicial: 1, parcelaFinal: 3 });
  });
});

describe('alcanceDaFaixa', () => {
  it('da cada alcance a partir da parcela 4', () => {
    expect(alcanceDaFaixa(doze, 4, 'SO_ESTA')).toEqual({ inicial: 4, final: 4 });
    expect(alcanceDaFaixa(doze, 4, 'ESTA_E_SEGUINTES')).toEqual({ inicial: 4, final: 12 });
    expect(alcanceDaFaixa(doze, 4, 'TODAS')).toEqual(doze);
  });

  it('recusa parcela fora da faixa do lancamento', () => {
    expect(() => alcanceDaFaixa({ inicial: 4, final: 12 }, 3, 'SO_ESTA')).toThrow('fora da faixa');
  });
});

describe('planejarDivisao', () => {
  it('todas edita no lugar', () => {
    expect(planejarDivisao(doze, 4, 'TODAS')).toEqual({ tipo: 'NO_LUGAR', alcance: doze });
  });

  it('esta e as seguintes a partir da primeira e o mesmo que todas', () => {
    expect(planejarDivisao(doze, 1, 'ESTA_E_SEGUINTES')).toEqual({ tipo: 'NO_LUGAR', alcance: doze });
  });

  it('esta e as seguintes no meio: o original fica com as de antes', () => {
    expect(planejarDivisao(doze, 4, 'ESTA_E_SEGUINTES')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 3 },
      alcance: { inicial: 4, final: 12 },
      depois: null,
    });
  });

  it('so esta no meio: tres pedacos, e o de depois vira lancamento novo', () => {
    expect(planejarDivisao(doze, 4, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 3 },
      alcance: { inicial: 4, final: 4 },
      depois: { inicial: 5, final: 12 },
    });
  });

  it('so esta na ultima: dois pedacos', () => {
    expect(planejarDivisao(doze, 12, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 1, final: 11 },
      alcance: { inicial: 12, final: 12 },
      depois: null,
    });
  });

  it('so esta na primeira: o original fica com as de depois, sem mover linha', () => {
    expect(planejarDivisao(doze, 1, 'SO_ESTA')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 2, final: 12 },
      alcance: { inicial: 1, final: 1 },
      depois: null,
    });
  });

  it('faixa de uma parcela so: qualquer alcance edita no lugar', () => {
    const uma = { inicial: 7, final: 7 };
    for (const alcance of ALCANCES) {
      expect(planejarDivisao(uma, 7, alcance)).toEqual({ tipo: 'NO_LUGAR', alcance: uma });
    }
  });

  it('respeita a faixa de um pedaco que ja foi dividido', () => {
    expect(planejarDivisao({ inicial: 4, final: 12 }, 6, 'ESTA_E_SEGUINTES')).toEqual({
      tipo: 'DIVIDIR',
      original: { inicial: 4, final: 5 },
      alcance: { inicial: 6, final: 12 },
      depois: null,
    });
  });
});

describe('faixaEscrita e limitesDeParcelas', () => {
  it('o alcance que vai ate a ultima acompanha o total novo', () => {
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 15)).toEqual({ inicial: 4, final: 15 });
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 4)).toEqual({ inicial: 4, final: 4 });
  });

  it('total novo menor que a parcela editada nao comporta', () => {
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, 3)).toBeNull();
    expect(limitesDeParcelas({ inicial: 4, final: 12 }, 12)).toEqual({
      minimo: 4,
      maximo: MAXIMO_DE_PARCELAS,
    });
  });

  it('alcance que para antes da ultima nao se mexe, e so aceita o mesmo total', () => {
    expect(faixaEscrita({ inicial: 4, final: 4 }, 12, 12)).toEqual({ inicial: 4, final: 4 });
    expect(faixaEscrita({ inicial: 1, final: 3 }, 12, 12)).toEqual({ inicial: 1, final: 3 });
    expect(faixaEscrita({ inicial: 1, final: 3 }, 12, 2)).toBeNull();
    expect(limitesDeParcelas({ inicial: 1, final: 3 }, 12)).toEqual({ minimo: 12, maximo: 12 });
  });

  it('pedaco que nao chega a ultima nao sobe o total, senao passaria a cobrir as do vizinho', () => {
    // O pedaco [1..3] de 12 com total 13 viraria [1..3] de 13 — e um total
    // mudado nele faz a faixa parecer chegar ao fim.
    expect(faixaEscrita({ inicial: 1, final: 3 }, 12, 13)).toBeNull();
  });

  it('pedaco que nao chega a ultima nao baixa o total ate a propria ponta', () => {
    // O defeito: [1..2] de 12 com total 2 gravava parcelaFinal nulo, e o
    // pedaco passava a parecer o ultimo. Subir o total depois regerava 3..12,
    // que ja eram de outro lancamento.
    expect(faixaEscrita({ inicial: 1, final: 2 }, 12, 2)).toBeNull();
  });

  it('nao passa do maximo de parcelas', () => {
    expect(faixaEscrita({ inicial: 4, final: 12 }, 12, MAXIMO_DE_PARCELAS + 1)).toBeNull();
  });
});

describe('descreverLimitesDeParcelas', () => {
  it('diz que o total fica onde esta quando so um total cabe', () => {
    expect(descreverLimitesDeParcelas({ minimo: 12, maximo: 12 })).toBe(
      'Nesta parte da compra, o total tem que continuar em 12 parcelas.',
    );
  });

  it('da a faixa aceita quando o total pode mudar', () => {
    expect(descreverLimitesDeParcelas({ minimo: 4, maximo: 72 })).toBe(
      'O total de parcelas tem que ficar entre 4 e 72.',
    );
  });
});

describe('parcelasDaFaixa', () => {
  it('poe cada parcela no mes certo a partir da que a pessoa esta vendo', () => {
    expect(parcelasDaFaixa({ inicial: 2, final: 4 }, { numero: 3, competencia: '2026-12' })).toEqual([
      { numero: 2, competencia: '2026-11' },
      { numero: 3, competencia: '2026-12' },
      { numero: 4, competencia: '2027-01' },
    ]);
  });
});

describe('rotuloDaFaixa', () => {
  it('a compra inteira nao tem rotulo', () => {
    expect(rotuloDaFaixa(doze, 12)).toBeNull();
  });

  it('descreve o pedaco', () => {
    expect(rotuloDaFaixa({ inicial: 4, final: 12 }, 12)).toBe('parcelas 4 a 12 de 12');
    expect(rotuloDaFaixa({ inicial: 7, final: 7 }, 12)).toBe('parcela 7 de 12');
  });
});
