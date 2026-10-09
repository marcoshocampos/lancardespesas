import { prisma } from './db';
import { auth } from './auth';

/**
 * O `Membro` correspondente a quem esta logado, ou `null`.
 *
 * O vinculo e o e-mail: a sessao traz o do Google, e `Membro.email` e unico no
 * schema. O seed ja gravou os dois e-mails da allowlist, entao na pratica isto
 * sempre resolve — mas devolve `null` em vez de lancar, porque a acao que
 * precisa disso (travar fatura) nao deve falhar por nao saber de quem foi o
 * gesto. O nome fica ausente na auditoria; a trava continua valendo.
 *
 * Fica em `src/server/` e nao em `repositorios/`: nao e dado de dominio, e a
 * traducao entre a identidade do provedor e a do sistema.
 */
export async function membroDaSessao(): Promise<string | null> {
  const sessao = await auth();
  const email = sessao?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const membro = await prisma.membro.findUnique({ where: { email }, select: { id: true } });
  return membro?.id ?? null;
}
