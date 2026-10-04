import { describe, expect, it } from 'vitest';
import { conferir } from './conferencia';

describe('conferir', () => {
  it('nao opina quando o extrato ainda nao foi informado', () => {
    expect(conferir(102551, null)).toEqual({
      somado: 102551,
      real: null,
      diferenca: null,
      situacao: 'SEM_EXTRATO',
    });
  });

  it('reconhece o mes que fecha exato', () => {
    const resultado = conferir(102551, 102551);
    expect(resultado.diferenca).toBe(0);
    expect(resultado.situacao).toBe('BATE');
  });

  it('aponta que falta lancar quando o extrato e maior', () => {
    const resultado = conferir(100000, 102551);
    expect(resultado.diferenca).toBe(2551);
    expect(resultado.situacao).toBe('FALTA_LANCAR');
  });

  it('aponta lancamento sobrando quando o extrato e menor', () => {
    const resultado = conferir(102551, 100000);
    expect(resultado.diferenca).toBe(-2551);
    expect(resultado.situacao).toBe('SOBRA_LANCAMENTO');
  });

  it('lida com estorno que deixa a fatura negativa', () => {
    const resultado = conferir(-5000, -5000);
    expect(resultado.situacao).toBe('BATE');
  });
});
