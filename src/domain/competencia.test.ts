import { describe, expect, it } from 'vitest';
import {
  avancarCompetencia,
  compararCompetencias,
  competenciaDeCartao,
  competenciaDeContaExterna,
} from './competencia';

// C6: fecha dia 4, vence dia 10. A competencia e o mes do vencimento.
const C6_FECHAMENTO = 4;

describe('competenciaDeCartao', () => {
  it('coloca a compra do proprio dia do fechamento na fatura que fecha naquele dia', () => {
    expect(competenciaDeCartao('2026-08-04', C6_FECHAMENTO)).toBe('2026-08');
  });

  it('joga a compra do dia seguinte ao fechamento para a fatura seguinte', () => {
    expect(competenciaDeCartao('2026-08-05', C6_FECHAMENTO)).toBe('2026-09');
  });

  it('coloca a compra do meio do ciclo na fatura que fecha depois dela', () => {
    expect(competenciaDeCartao('2026-07-20', C6_FECHAMENTO)).toBe('2026-08');
  });

  it('vira o ano quando a compra e depois do fechamento de dezembro', () => {
    expect(competenciaDeCartao('2026-12-28', C6_FECHAMENTO)).toBe('2027-01');
  });

  it('usa o ultimo dia do mes quando o fechamento nao existe naquele mes', () => {
    // Fechamento 31 em fevereiro de 2026, que termina no dia 28.
    expect(competenciaDeCartao('2026-02-28', 31)).toBe('2026-02');
    expect(competenciaDeCartao('2026-03-01', 31)).toBe('2026-03');
  });

  it('recusa dia de fechamento fora do intervalo valido', () => {
    expect(() => competenciaDeCartao('2026-08-04', 0)).toThrow('Dia de fechamento invalido');
    expect(() => competenciaDeCartao('2026-08-04', 32)).toThrow('Dia de fechamento invalido');
  });
});

describe('competenciaDeContaExterna', () => {
  it('usa o mes do pagamento, sem fechamento nenhum', () => {
    expect(competenciaDeContaExterna('2026-08-28')).toBe('2026-08');
    expect(competenciaDeContaExterna('2026-08-01')).toBe('2026-08');
  });
});

describe('avancarCompetencia', () => {
  it('avanca dentro do mesmo ano', () => {
    expect(avancarCompetencia('2026-08', 1)).toBe('2026-09');
  });

  it('vira o ano', () => {
    expect(avancarCompetencia('2026-08', 5)).toBe('2027-01');
    expect(avancarCompetencia('2026-12', 1)).toBe('2027-01');
  });

  it('cobre o parcelamento do moto: parcela 2 em agosto, parcela 12 em junho de 2027', () => {
    expect(avancarCompetencia('2026-08', 10)).toBe('2027-06');
  });

  it('aceita zero e valores negativos', () => {
    expect(avancarCompetencia('2026-08', 0)).toBe('2026-08');
    expect(avancarCompetencia('2026-01', -1)).toBe('2025-12');
  });

  it('recusa competencia mal formada', () => {
    expect(() => avancarCompetencia('2026-8', 1)).toThrow('Competencia invalida');
    expect(() => avancarCompetencia('2026-13', 1)).toThrow('Competencia invalida');
  });
});

describe('compararCompetencias', () => {
  it('ordena cronologicamente', () => {
    expect(compararCompetencias('2026-08', '2026-09')).toBeLessThan(0);
    expect(compararCompetencias('2027-01', '2026-12')).toBeGreaterThan(0);
    expect(compararCompetencias('2026-08', '2026-08')).toBe(0);
  });
});
