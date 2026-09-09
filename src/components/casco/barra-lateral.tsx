'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, ClipboardList, Receipt, Settings, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Destino = {
  rotulo: string;
  /** null marca destino desabilitado — sem rota para navegar ainda. */
  rota: string | null;
  Icone: LucideIcon;
};

/**
 * Destinos da barra, nesta ordem exata. Graficos e Lixeira nao existem no
 * sistema ainda; Configuracoes so nasce na Etapa 06. `docs/arquitetura.md` e
 * explicito: um destino so entra na navegacao depois que a pagina existir —
 * por isso Configuracoes tambem fica desabilitada por enquanto, com os
 * outros dois.
 */
const DESTINOS: Destino[] = [
  { rotulo: 'Despesas', rota: '/despesas', Icone: Receipt },
  { rotulo: 'Resumo', rota: '/resumo', Icone: ClipboardList },
  { rotulo: 'Gráficos', rota: null, Icone: BarChart3 },
  { rotulo: 'Configurações', rota: null, Icone: Settings },
  { rotulo: 'Lixeira', rota: null, Icone: Trash2 },
];

/** O destino atual sai do comeco do caminho, nao de igualdade exata — cobre eventuais sub-rotas. */
function ehDestinoAtual(pathname: string, rota: string): boolean {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

const CLASSE_ITEM =
  'flex items-center gap-3 rounded-campo px-3 py-2 text-sm max-[1179px]:justify-center max-[1179px]:px-2';

/** sr-only abaixo de 1180px (barra so com icones), visivel a partir dali. */
const CLASSE_ROTULO = 'sr-only min-[1180px]:not-sr-only';

/**
 * A barra lateral fixa do casco: identidade do sistema no topo, destinos no
 * meio, e `children` — a `Identidade` de quem esta logado — no rodape,
 * empurrado ate o fim por `mt-auto`.
 *
 * Componente de cliente por causa de `usePathname()` e `useSearchParams()`:
 * precisa saber em que tela esta, para destacar o destino atual, e qual
 * competencia preservar ao trocar de tela. O layout do App Router nao
 * recebe `searchParams`, entao nenhuma das duas informacoes chegaria por
 * prop vinda de cima.
 *
 * `Identidade` e componente de servidor (le a sessao com `auth()`) e chega
 * aqui como `children` — e o unico jeito de um componente de servidor viver
 * dentro de um de cliente sem virar prop serializada.
 */
export function BarraLateral({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const competencia = searchParams.get('competencia');

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-borda bg-superficie max-[1179px]:w-16">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-borda px-4 max-[1179px]:justify-center max-[1179px]:px-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-campo bg-acento text-sm font-semibold text-superficie"
          aria-hidden="true"
        >
          D
        </span>
        <span className={`${CLASSE_ROTULO} text-sm font-semibold text-tinta`}>Despesas</span>
      </div>

      <nav aria-label="Navegação principal" className="p-3">
        <ul className="flex flex-col gap-1">
          {DESTINOS.map((destino) => {
            const ativo = destino.rota ? ehDestinoAtual(pathname, destino.rota) : false;

            return (
              <li key={destino.rotulo}>
                {destino.rota ? (
                  <a
                    href={competencia ? `${destino.rota}?competencia=${competencia}` : destino.rota}
                    aria-current={ativo ? 'page' : undefined}
                    className={`${CLASSE_ITEM} ${
                      ativo
                        ? 'bg-realce font-medium text-tinta'
                        : 'text-tinta-fraca hover:bg-realce hover:text-tinta'
                    }`}
                  >
                    <destino.Icone className="size-4 shrink-0" aria-hidden="true" />
                    <span className={CLASSE_ROTULO}>{destino.rotulo}</span>
                  </a>
                ) : (
                  <span aria-disabled="true" className={`${CLASSE_ITEM} text-tinta-apagada`}>
                    <destino.Icone className="size-4 shrink-0" aria-hidden="true" />
                    <span className={CLASSE_ROTULO}>{destino.rotulo}</span>
                    <span className={`${CLASSE_ROTULO} ml-auto shrink-0 text-xs`}>em breve</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto shrink-0 border-t border-borda">{children}</div>
    </div>
  );
}
