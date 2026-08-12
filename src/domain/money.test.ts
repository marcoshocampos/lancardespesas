import { describe, expect, it } from 'vitest';
import { formatarBRL, reaisParaCentavos } from './money';

describe('reaisParaCentavos', () => {
  it('converte o formato brasileiro com milhar e decimal', () => {
    expect(reaisParaCentavos('1.025,51')).toBe(102551);
    expect(reaisParaCentavos('432,10')).toBe(43210);
    expect(reaisParaCentavos('88,00')).toBe(8800);
  });

  it('aceita valor sem centavos', () => {
    expect(reaisParaCentavos('65')).toBe(6500);
    expect(reaisParaCentavos('65,0')).toBe(6500);
  });

  it('aceita prefixo de moeda e espaco', () => {
    expect(reaisParaCentavos('R$ 474,25')).toBe(47425);
  });

  it('aceita valor negativo, usado em estorno', () => {
    expect(reaisParaCentavos('-100,00')).toBe(-10000);
  });

  it('recusa texto que nao e valor', () => {
    expect(() => reaisParaCentavos('abc')).toThrow('Valor invalido');
    expect(() => reaisParaCentavos('')).toThrow('Valor invalido');
  });
});

describe('formatarBRL', () => {
  it('formata com milhar e duas casas', () => {
    expect(formatarBRL(102551)).toBe('R$ 1.025,51');
    expect(formatarBRL(6500)).toBe('R$ 65,00');
    expect(formatarBRL(0)).toBe('R$ 0,00');
  });

  it('formata negativo com o sinal antes da moeda', () => {
    expect(formatarBRL(-10000)).toBe('-R$ 100,00');
  });

  it('sobrevive a ida e volta', () => {
    expect(reaisParaCentavos(formatarBRL(47425))).toBe(47425);
  });
});
