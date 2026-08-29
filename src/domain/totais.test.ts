import { describe, expect, it } from 'vitest';
import { C6, EXTERNA, NARDY, NICK, PARCELAS_AGOSTO_2026 } from './fixtures/agosto-2026';
import { COLUNA_TOTAL, calcularResumo } from './totais';

const MEMBROS = [NARDY, NICK];
const CONTAS = [C6, EXTERNA];

describe('calcularResumo, com os dados reais de agosto de 2026', () => {
  const resumo = calcularResumo(PARCELAS_AGOSTO_2026, MEMBROS, CONTAS);

  it('reproduz os totais pessoais da planilha na coluna do C6', () => {
    expect(resumo.pessoal[NARDY]?.[C6]).toBe(42375);
    expect(resumo.pessoal[NICK]?.[C6]).toBe(50075);
  });

  it('reproduz o total do conjunto e a metade', () => {
    expect(resumo.conjunto[C6]).toBe(10101);
    expect(resumo.metade[NARDY]?.[C6]).toBe(5050);
    expect(resumo.metade[NICK]?.[C6]).toBe(5050);
  });

  it('reproduz o TOTAL GERAL de cada pessoa no C6', () => {
    expect(resumo.totalGeral[NARDY]?.[C6]).toBe(47425);
    expect(resumo.totalGeral[NICK]?.[C6]).toBe(55126);
  });

  it('reproduz a fatura do C6, que e o somado daquela coluna', () => {
    expect(resumo.somado[C6]).toBe(102551);
  });

  it('separa a despesa externa na coluna dela', () => {
    expect(resumo.pessoal[NICK]?.[EXTERNA]).toBe(8000);
    expect(resumo.pessoal[NARDY]?.[EXTERNA]).toBe(0);
    expect(resumo.somado[EXTERNA]).toBe(8000);
  });

  it('soma cartao e conta externa na coluna de total', () => {
    expect(resumo.pessoal[NICK]?.[COLUNA_TOTAL]).toBe(58075);
    expect(resumo.totalGeral[NICK]?.[COLUNA_TOTAL]).toBe(63126);
    expect(resumo.totalGeral[NARDY]?.[COLUNA_TOTAL]).toBe(47425);
    expect(resumo.somado[COLUNA_TOTAL]).toBe(110551);
  });

  it('mantem a identidade contabil: somado e a soma dos dois totais gerais', () => {
    const soma =
      (resumo.totalGeral[NARDY]?.[COLUNA_TOTAL] ?? 0) +
      (resumo.totalGeral[NICK]?.[COLUNA_TOTAL] ?? 0);
    expect(soma).toBe(resumo.somado[COLUNA_TOTAL]);
  });

  it('expoe as contas na ordem pedida, para as colunas da tela', () => {
    expect(resumo.contas).toEqual([C6, EXTERNA]);
  });
});

describe('calcularResumo, casos de borda', () => {
  it('devolve zeros quando o mes nao tem lancamento', () => {
    const resumo = calcularResumo([], MEMBROS, CONTAS);
    expect(resumo.somado[COLUNA_TOTAL]).toBe(0);
    expect(resumo.totalGeral[NARDY]?.[C6]).toBe(0);
  });

  it('reduz os totais quando ha estorno', () => {
    const resumo = calcularResumo(
      [
        { contaId: C6, escopo: 'PESSOAL', membroId: NICK, valorCentavos: 10000 },
        { contaId: C6, escopo: 'PESSOAL', membroId: NICK, valorCentavos: -2500 },
      ],
      MEMBROS,
      CONTAS,
    );
    expect(resumo.pessoal[NICK]?.[C6]).toBe(7500);
    expect(resumo.somado[C6]).toBe(7500);
  });

  it('recusa parcela pessoal sem membro', () => {
    expect(() =>
      calcularResumo([{ contaId: C6, escopo: 'PESSOAL', valorCentavos: 100 }], MEMBROS, CONTAS),
    ).toThrow('Parcela pessoal sem membro');
  });

  it('recusa parcela de conjunto sem cotas', () => {
    expect(() =>
      calcularResumo([{ contaId: C6, escopo: 'CONJUNTO', valorCentavos: 100 }], MEMBROS, CONTAS),
    ).toThrow('Parcela de conjunto sem rateio');
  });

  it('recusa parcela pessoal com conta desconhecida', () => {
    expect(() =>
      calcularResumo(
        [{ contaId: 'conta-inexistente', escopo: 'PESSOAL', membroId: NICK, valorCentavos: 100 }],
        MEMBROS,
        CONTAS,
      ),
    ).toThrow('Conta desconhecida no resumo');
  });

  it('recusa parcela de conjunto com conta desconhecida', () => {
    expect(() =>
      calcularResumo(
        [
          {
            contaId: 'conta-inexistente',
            escopo: 'CONJUNTO',
            valorCentavos: 100,
            cotas: [
              { membroId: NARDY, valorCentavos: 50 },
              { membroId: NICK, valorCentavos: 50 },
            ],
          },
        ],
        MEMBROS,
        CONTAS,
      ),
    ).toThrow('Conta desconhecida no resumo');
  });

  it('recusa rateio cuja soma das cotas nao fecha com o valor da parcela', () => {
    expect(() =>
      calcularResumo(
        [
          {
            contaId: C6,
            escopo: 'CONJUNTO',
            valorCentavos: 10000,
            cotas: [
              { membroId: NARDY, valorCentavos: 4000 },
              { membroId: NICK, valorCentavos: 5000 },
            ],
          },
        ],
        MEMBROS,
        CONTAS,
      ),
    ).toThrow('Rateio nao fecha com o valor da parcela');
  });

  it('mantem a identidade contabil com rateio assimetrico', () => {
    const resumo = calcularResumo(
      [
        {
          contaId: C6,
          escopo: 'CONJUNTO',
          valorCentavos: 10000,
          cotas: [
            { membroId: NARDY, valorCentavos: 7000 },
            { membroId: NICK, valorCentavos: 3000 },
          ],
        },
      ],
      MEMBROS,
      CONTAS,
    );
    const soma =
      (resumo.totalGeral[NARDY]?.[COLUNA_TOTAL] ?? 0) + (resumo.totalGeral[NICK]?.[COLUNA_TOTAL] ?? 0);
    expect(soma).toBe(resumo.somado[COLUNA_TOTAL]);
  });
});
