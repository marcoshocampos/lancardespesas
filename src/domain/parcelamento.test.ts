import { describe, expect, it } from 'vitest';
import { gerarParcelas } from './parcelamento';

describe('gerarParcelas', () => {
  it('gera uma unica parcela para compra a vista', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 8800,
      origem: 'POR_PARCELA',
      numeroParcelas: 1,
      competenciaBase: '2026-08',
    });

    expect(parcelas).toEqual([{ numero: 1, valorCentavos: 8800, competencia: '2026-08' }]);
  });

  it('repete o valor quando a pessoa digita o valor da parcela', () => {
    // moto: R$ 432,10 por parcela, 12x, comecando em julho de 2026.
    const parcelas = gerarParcelas({
      valorCentavos: 43210,
      origem: 'POR_PARCELA',
      numeroParcelas: 12,
      competenciaBase: '2026-07',
    });

    expect(parcelas).toHaveLength(12);
    expect(parcelas.every((p) => p.valorCentavos === 43210)).toBe(true);
    expect(parcelas[1]).toEqual({ numero: 2, valorCentavos: 43210, competencia: '2026-08' });
    expect(parcelas[11]).toEqual({ numero: 12, valorCentavos: 43210, competencia: '2027-06' });
  });

  it('joga a sobra de centavos na ultima parcela quando o valor digitado e o total', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 10000,
      origem: 'TOTAL',
      numeroParcelas: 3,
      competenciaBase: '2026-08',
    });

    expect(parcelas.map((p) => p.valorCentavos)).toEqual([3333, 3333, 3334]);
  });

  it('mantem a soma das parcelas igual ao total, sempre', () => {
    for (const total of [10000, 10001, 99999, 102551, 1]) {
      for (const n of [1, 2, 3, 7, 12, 24]) {
        const parcelas = gerarParcelas({
          valorCentavos: total,
          origem: 'TOTAL',
          numeroParcelas: n,
          competenciaBase: '2026-08',
        });
        const soma = parcelas.reduce((acc, p) => acc + p.valorCentavos, 0);
        expect(soma, `total ${total} em ${n}x`).toBe(total);
      }
    }
  });

  it('avanca a competencia um mes por parcela, virando o ano', () => {
    const parcelas = gerarParcelas({
      valorCentavos: 30000,
      origem: 'TOTAL',
      numeroParcelas: 6,
      competenciaBase: '2026-11',
    });

    expect(parcelas.map((p) => p.competencia)).toEqual([
      '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04',
    ]);
  });

  it('funciona com estorno, que tem valor negativo e uma parcela so', () => {
    const parcelas = gerarParcelas({
      valorCentavos: -10000,
      origem: 'POR_PARCELA',
      numeroParcelas: 1,
      competenciaBase: '2026-09',
    });

    expect(parcelas).toEqual([{ numero: 1, valorCentavos: -10000, competencia: '2026-09' }]);
  });

  it('recusa numero de parcelas invalido', () => {
    const base = { valorCentavos: 10000, origem: 'TOTAL' as const, competenciaBase: '2026-08' };
    expect(() => gerarParcelas({ ...base, numeroParcelas: 0 })).toThrow('Numero de parcelas invalido');
    expect(() => gerarParcelas({ ...base, numeroParcelas: -1 })).toThrow('Numero de parcelas invalido');
    expect(() => gerarParcelas({ ...base, numeroParcelas: 1.5 })).toThrow('Numero de parcelas invalido');
  });

  it('recusa parcelar valor negativo, porque estorno parcelado nao existe', () => {
    expect(() =>
      gerarParcelas({
        valorCentavos: -10000,
        origem: 'TOTAL',
        numeroParcelas: 3,
        competenciaBase: '2026-08',
      }),
    ).toThrow('Estorno nao pode ser parcelado');
  });
});
