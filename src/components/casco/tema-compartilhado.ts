/**
 * O pouco que o servidor e o cliente precisam saber em comum sobre o tema.
 *
 * Arquivo separado, sem `'use client'`, porque `layout.tsx` é componente de
 * servidor e não pode importar de um módulo de cliente. São três linhas de
 * contrato; duplicá-las seria convidar as duas pontas a divergir no nome do
 * cookie, que falharia em silêncio.
 */

/** Nome do cookie. Só existe quando a pessoa forçou um tema. */
export const COOKIE_TEMA = 'tema';

/** `sistema` é a ausência do cookie, nunca um valor gravado. */
export type TemaForcado = 'claro' | 'escuro';

export function ehTemaForcado(valor: string | undefined | null): valor is TemaForcado {
  return valor === 'claro' || valor === 'escuro';
}
