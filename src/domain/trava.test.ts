import { describe, expect, it } from 'vitest';
import { acharTrava, competenciasTravadasDaConta, descreverTrava, divergenciaDaData } from './trava';

describe('acharTrava', () => {
  it('acha a primeira parcela, pelo numero, que cai em mes travado', () => {
    const parcelas = [
      { numero: 3, competencia: '2026-12' },
      { numero: 2, competencia: '2026-11' },
      { numero: 1, competencia: '2026-10' },
    ];
    expect(acharTrava(parcelas, new Set(['2026-11', '2026-12']))).toEqual({
      numero: 2,
      competencia: '2026-11',
    });
  });

  it('devolve null quando nenhuma cai em mes travado', () => {
    expect(acharTrava([{ numero: 1, competencia: '2026-12' }], new Set(['2026-11']))).toBeNull();
  });
});

describe('competenciasTravadasDaConta', () => {
  it('fica so com os meses da conta pedida', () => {
    const travadas = [
      { contaId: 'c6', competencia: '2026-11' },
      { contaId: 'nubank', competencia: '2026-12' },
    ];
    expect(competenciasTravadasDaConta(travadas, 'c6')).toEqual(new Set(['2026-11']));
  });
});

describe('descreverTrava', () => {
  it('nomeia a parcela, o mes e o cartao', () => {
    expect(
      descreverTrava({ numero: 3, numeroParcelas: 6, competencia: '2026-11', contaNome: 'C6' }),
    ).toBe(
      'A parcela 3 cai em novembro de 2026, e a fatura do C6 desse mês está travada. ' +
        'Destrave-a no Resumo de novembro para mudá-la.',
    );
  });

  it('a vista fala do lancamento, e nao de parcela', () => {
    expect(
      descreverTrava({ numero: 1, numeroParcelas: 1, competencia: '2026-11', contaNome: 'C6' }),
    ).toBe(
      'Esse lançamento cai em novembro de 2026, e a fatura do C6 desse mês está travada. ' +
        'Destrave-a no Resumo de novembro para mudá-lo.',
    );
  });
});

describe('divergenciaDaData', () => {
  const c6 = { tipo: 'CARTAO' as const, diaFechamento: 4 };

  it('concorda: compra depois do fechamento cai no mes seguinte', () => {
    expect(divergenciaDaData('2026-11-19', c6, '2026-12', 1)).toBeNull();
  });

  it('diverge: compra de 3/nov cai em novembro, e nao em dezembro', () => {
    expect(divergenciaDaData('2026-11-03', c6, '2026-12', 1)).toBe('2026-11');
  });

  it('compara pela base: a parcela 9 de uma compra de abril concorda em dezembro', () => {
    expect(divergenciaDaData('2026-04-01', c6, '2026-12', 9)).toBeNull();
  });

  it('diz em que fatura a parcela cairia pela data', () => {
    expect(divergenciaDaData('2026-04-01', c6, '2027-01', 9)).toBe('2026-12');
  });

  it('conta externa usa o mes do pagamento', () => {
    expect(
      divergenciaDaData('2026-11-19', { tipo: 'EXTERNA', diaFechamento: null }, '2026-12', 1),
    ).toBe('2026-11');
  });

  it('data incompleta ou inexistente nao avisa', () => {
    expect(divergenciaDaData('', c6, '2026-12', 1)).toBeNull();
    expect(divergenciaDaData('2026-11', c6, '2026-12', 1)).toBeNull();
    expect(divergenciaDaData('2026-02-31', c6, '2026-12', 1)).toBeNull();
  });
});
