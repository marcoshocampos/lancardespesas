import { describe, expect, it } from 'vitest';
import { diaClampeado, partesDaData, ultimoDiaDoMes } from './data';

describe('partesDaData', () => {
  it('decompoe sem envolver fuso horario', () => {
    expect(partesDaData('2026-08-04')).toEqual({ ano: 2026, mes: 8, dia: 4 });
    expect(partesDaData('2026-01-31')).toEqual({ ano: 2026, mes: 1, dia: 31 });
  });

  it('recusa formato diferente de AAAA-MM-DD', () => {
    expect(() => partesDaData('04/08/2026')).toThrow('Data invalida');
    expect(() => partesDaData('2026-8-4')).toThrow('Data invalida');
  });

  it('recusa data que nao existe no calendario', () => {
    expect(() => partesDaData('2026-02-30')).toThrow('Data invalida');
    expect(() => partesDaData('2026-13-01')).toThrow('Data invalida');
  });
});

describe('ultimoDiaDoMes', () => {
  it('conhece os meses de 30 e 31 dias', () => {
    expect(ultimoDiaDoMes(2026, 1)).toBe(31);
    expect(ultimoDiaDoMes(2026, 4)).toBe(30);
  });

  it('trata fevereiro e ano bissexto', () => {
    expect(ultimoDiaDoMes(2026, 2)).toBe(28);
    expect(ultimoDiaDoMes(2028, 2)).toBe(29);
    expect(ultimoDiaDoMes(2000, 2)).toBe(29);
    expect(ultimoDiaDoMes(1900, 2)).toBe(28);
  });
});

describe('diaClampeado', () => {
  it('deixa passar o dia que existe no mes', () => {
    expect(diaClampeado(2026, 8, 4)).toBe(4);
  });

  it('limita dia 31 num mes de 30 dias', () => {
    expect(diaClampeado(2026, 4, 31)).toBe(30);
  });

  it('limita dia 31 em fevereiro comum', () => {
    expect(diaClampeado(2026, 2, 31)).toBe(28);
  });

  it('limita dia 31 em fevereiro bissexto', () => {
    expect(diaClampeado(2028, 2, 31)).toBe(29);
  });

  it('respeita as duas regras de seculo do ano bissexto', () => {
    expect(diaClampeado(2000, 2, 31)).toBe(29);
    expect(diaClampeado(1900, 2, 31)).toBe(28);
  });
});
