import { describe, expect, it } from 'vitest';
import { emailAutorizado } from './auth-regras';

const LISTA = 'nardy@exemplo.com,nick@exemplo.com';

describe('emailAutorizado', () => {
  it('aceita e-mail que esta na lista', () => {
    expect(emailAutorizado('nick@exemplo.com', LISTA)).toBe(true);
  });

  it('ignora diferenca de caixa e espaco em volta', () => {
    expect(emailAutorizado('  NICK@Exemplo.com ', LISTA)).toBe(true);
    expect(emailAutorizado('nick@exemplo.com', ' nardy@exemplo.com , nick@exemplo.com ')).toBe(true);
  });

  it('recusa conta Google valida que nao esta na lista', () => {
    expect(emailAutorizado('estranho@gmail.com', LISTA)).toBe(false);
  });

  it('recusa quando nao ha e-mail', () => {
    expect(emailAutorizado(null, LISTA)).toBe(false);
    expect(emailAutorizado(undefined, LISTA)).toBe(false);
    expect(emailAutorizado('', LISTA)).toBe(false);
  });

  it('recusa todo mundo quando a lista esta vazia, em vez de liberar geral', () => {
    expect(emailAutorizado('nick@exemplo.com', '')).toBe(false);
    expect(emailAutorizado('nick@exemplo.com', '   ')).toBe(false);
  });
});
