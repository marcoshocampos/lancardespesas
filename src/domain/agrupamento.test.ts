import { describe, expect, it } from 'vitest';
import { agrupar } from './agrupamento';

const NARDY = 'membro-nardy';
const NICK = 'membro-nick';
const CONJUNTO = 'CONJUNTO';
const ORDEM = [NARDY, NICK, CONJUNTO];

function item(chave: string, valorCentavos: number) {
  return { chave, valorCentavos };
}

describe('agrupar', () => {
  it('soma o subtotal de cada grupo e conta os itens', () => {
    const grupos = agrupar(
      [item(NARDY, 10000), item(NICK, 30000), item(NARDY, 4951)],
      ORDEM,
    );

    expect(grupos[0]).toEqual({
      chave: NARDY,
      itens: [item(NARDY, 10000), item(NARDY, 4951)],
      subtotalCentavos: 17905,
      quantidade: 2,
    });
    expect(grupos[1]?.subtotalCentavos).toBe(30000);
  });

  it('devolve os grupos na ordem pedida, nao na ordem de chegada', () => {
    const grupos = agrupar([item(CONJUNTO, 100), item(NARDY, 200)], ORDEM);

    expect(grupos.map((g) => g.chave)).toEqual([NARDY, NICK, CONJUNTO]);
  });

  it('devolve grupo vazio com subtotal zero em vez de omiti-lo', () => {
    const grupos = agrupar([item(NARDY, 500)], ORDEM);

    expect(grupos).toHaveLength(3);
    expect(grupos[1]).toEqual({ chave: NICK, itens: [], subtotalCentavos: 0, quantidade: 0 });
  });

  it('preserva a ordem dos itens dentro do grupo', () => {
    const grupos = agrupar(
      [item(NARDY, 300), item(NICK, 999), item(NARDY, 100), item(NARDY, 200)],
      ORDEM,
    );

    expect(grupos[0]?.itens.map((i) => i.valorCentavos)).toEqual([300, 100, 200]);
  });

  it('soma valores negativos, porque estorno existe', () => {
    const grupos = agrupar([item(NICK, 10000), item(NICK, -2500)], ORDEM);

    expect(grupos[1]?.subtotalCentavos).toBe(7500);
  });

  it('a soma dos subtotais fecha com o total dos itens', () => {
    const itens = [item(NARDY, 10000), item(NICK, 30000), item(CONJUNTO, 10101), item(NICK, -500)];
    const grupos = agrupar(itens, ORDEM);

    const somaDosSubtotais = grupos.reduce((a, g) => a + g.subtotalCentavos, 0);
    const total = itens.reduce((a, i) => a + i.valorCentavos, 0);

    expect(somaDosSubtotais).toBe(total);
  });

  it('lista vazia devolve todos os grupos zerados', () => {
    const grupos = agrupar([], ORDEM);

    expect(grupos.map((g) => g.subtotalCentavos)).toEqual([0, 0, 0]);
  });

  it('recusa item com chave fora da ordem em vez de descarta-lo em silencio', () => {
    expect(() => agrupar([item('membro-fantasma', 100)], ORDEM)).toThrow();
  });
});
