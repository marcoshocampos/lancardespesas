/** Confere um e-mail contra a allowlist. Lista vazia recusa todo mundo. */
export function emailAutorizado(email: string | null | undefined, lista: string): boolean {
  if (!email) return false;

  const autorizados = lista
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (autorizados.length === 0) return false;

  return autorizados.includes(email.trim().toLowerCase());
}

/**
 * Decide se um login com Google pode prosseguir. Exige e-mail verificado pelo
 * Google antes de conferir a allowlist: a ausencia do dado recusa, nunca libera
 * (mesma logica da lista vazia recusar todo mundo).
 */
export function loginPermitido(
  perfil: { email?: string | null; email_verified?: boolean | null } | null | undefined,
  lista: string,
): boolean {
  if (!perfil) return false;
  if (perfil.email_verified !== true) return false;
  return emailAutorizado(perfil.email, lista);
}
