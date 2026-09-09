import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { BarraLateral } from '@/components/casco/barra-lateral';
import { Identidade } from '@/components/casco/identidade';

/**
 * Casco comum as telas autenticadas (Despesas, Resumo): barra lateral fixa a
 * esquerda e o conteudo da pagina ocupando o resto. `min-w-0` no main e o que
 * impede uma grade larga de estourar o flex em vez de rolar dentro do proprio
 * container.
 *
 * A competencia mora na query string, e layout do App Router nao recebe
 * `searchParams` — por isso o casco nao le nem repassa competencia aqui.
 * Cada pagina continua resolvendo isso sozinha; quem le a competencia para
 * preservar o mes ao trocar de tela e a propria `BarraLateral`, via
 * `useSearchParams()`.
 *
 * `BarraLateral` e componente de cliente por causa desse `useSearchParams()`,
 * e o Next exige uma fronteira de `Suspense` em volta de quem usa esse hook —
 * sem ela, `npm run build` falha com "useSearchParams should be wrapped in a
 * suspense boundary". O fallback repete a largura exata da barra para a tela
 * nao pular ao hidratar.
 *
 * `Identidade` e componente de servidor (le a sessao com `auth()`) e entra
 * como `children` da `BarraLateral` — e o jeito de um componente de servidor
 * viver dentro de um de cliente sem virar prop serializada.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <Suspense fallback={<div className="w-56 shrink-0 border-r border-borda" />}>
        <BarraLateral>
          <Identidade />
        </BarraLateral>
      </Suspense>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
