import { LogOut } from 'lucide-react';
import { auth, signOut } from '@/server/auth';

/**
 * Quem esta logado, no rodape da barra lateral: inicial, nome, e o botao de
 * sair — que ate esta tarefa nao existia em lugar nenhum do sistema.
 *
 * Componente de servidor porque `auth()` le a sessao no servidor. Chega na
 * `BarraLateral` como `children`: e o unico jeito de um componente de
 * servidor viver dentro de um de cliente sem virar prop serializada.
 *
 * O nome vira `sr-only` abaixo de 1180px, junto com o resto da barra — o
 * botao de sair continua so com o icone, sempre, com o rotulo em `sr-only`.
 */
export async function Identidade() {
  const sessao = await auth();
  const nome = sessao?.user?.name?.trim() || sessao?.user?.email?.trim() || 'Conta';
  const inicial = nome.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2 p-3" title={nome}>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-superficie-alta text-sm font-medium text-tinta"
        aria-hidden="true"
      >
        {inicial}
      </span>

      <span className="sr-only min-w-0 flex-1 min-[1180px]:not-sr-only">
        <span className="block truncate text-sm text-tinta">{nome}</span>
      </span>

      <form
        className="shrink-0"
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/entrar' });
        }}
      >
        <button
          type="submit"
          className="flex size-8 shrink-0 items-center justify-center rounded-campo text-tinta-fraca transition-colors hover:bg-realce hover:text-tinta"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span className="sr-only">Sair</span>
        </button>
      </form>
    </div>
  );
}
