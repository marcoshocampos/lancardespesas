import { describe, expect, it } from 'vitest';
import { pesosMeioAMeio, ratear } from './rateio';

const NARDY = 'membro-nardy';
const NICK = 'membro-nick';

describe('pesosMeioAMeio', () => {
  it('divide igualmente entre duas pessoas', () => {
    expect(pesosMeioAMeio([NARDY, NICK])).toEqual([
      { membroId: NARDY, percentual: 50 },
      { membroId: NICK, percentual: 50 },
    ]);
  });
});

describe('ratear', () => {
  it('divide o caso real do fone sem sobra', () => {
    const cotas = ratear(10101, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 5050 },
      { membroId: NICK, valorCentavos: 5050 },
    ]);
  });

  it('da a sobra de centavos ao primeiro peso, sempre o mesmo', () => {
    const cotas = ratear(10001, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 5001 },
      { membroId: NICK, valorCentavos: 5000 },
    ]);
  });

  it('respeita percentuais diferentes de 50/50', () => {
    const cotas = ratear(10000, [
      { membroId: NARDY, percentual: 30 },
      { membroId: NICK, percentual: 70 },
    ]);
    expect(cotas).toEqual([
      { membroId: NARDY, valorCentavos: 3000 },
      { membroId: NICK, valorCentavos: 7000 },
    ]);
  });

  it('mantem a soma das cotas igual ao valor rateado, sempre', () => {
    for (const valor of [1, 3, 10001, 10101, 99999, 102551]) {
      const cotas = ratear(valor, pesosMeioAMeio([NARDY, NICK]));
      const soma = cotas.reduce((acc, c) => acc + c.valorCentavos, 0);
      expect(soma, `valor ${valor}`).toBe(valor);
    }
  });

  it('rateia estorno, mantendo o sinal negativo', () => {
    const cotas = ratear(-10000, pesosMeioAMeio([NARDY, NICK]));
    expect(cotas.map((c) => c.valorCentavos)).toEqual([-5000, -5000]);
    expect(cotas.reduce((a, c) => a + c.valorCentavos, 0)).toBe(-10000);
  });

  it('recusa percentuais que nao somam 100', () => {
    expect(() =>
      ratear(10000, [
        { membroId: NARDY, percentual: 30 },
        { membroId: NICK, percentual: 30 },
      ]),
    ).toThrow('Percentuais devem somar 100');
  });

  it('recusa lista de pesos vazia', () => {
    expect(() => ratear(10000, [])).toThrow('Rateio exige ao menos um membro');
  });
});
