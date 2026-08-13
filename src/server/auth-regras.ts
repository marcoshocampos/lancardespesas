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
