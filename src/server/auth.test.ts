import { describe, expect, it } from 'vitest';
import { emailAutorizado, loginPermitido } from './auth-regras';

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

describe('loginPermitido', () => {
  it('aceita perfil com e-mail da lista e email_verified true', () => {
    expect(
      loginPermitido({ email: 'nick@exemplo.com', email_verified: true }, LISTA),
    ).toBe(true);
  });

  it('recusa perfil com e-mail da lista mas email_verified false', () => {
    expect(
      loginPermitido({ email: 'nick@exemplo.com', email_verified: false }, LISTA),
    ).toBe(false);
  });

  it('recusa perfil com e-mail da lista e email_verified ausente', () => {
    expect(loginPermitido({ email: 'nick@exemplo.com' }, LISTA)).toBe(false);
  });

  it('recusa perfil com email_verified true mas e-mail fora da lista', () => {
    expect(
      loginPermitido({ email: 'estranho@gmail.com', email_verified: true }, LISTA),
    ).toBe(false);
  });

  it('recusa perfil nulo ou indefinido', () => {
    expect(loginPermitido(null, LISTA)).toBe(false);
    expect(loginPermitido(undefined, LISTA)).toBe(false);
  });
});
