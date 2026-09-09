import type { ReactNode } from 'react';

/**
 * Casco comum as telas autenticadas (Despesas, Resumo): barra lateral fixa a
 * esquerda e o conteudo da pagina ocupando o resto. `min-w-0` no main e o que
 * impede uma grade larga de estourar o flex em vez de rolar dentro do proprio
 * container.
 *
 * A competencia mora na query string, e layout do App Router nao recebe
 * `searchParams` — por isso o casco nao le nem repassa competencia aqui.
 * Cada pagina continua resolvendo isso sozinha.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      {/* Reserva o lugar da barra lateral. A Tarefa 2 troca esta div por
          <BarraLateral><Identidade /></BarraLateral> dentro de um Suspense
          (BarraLateral usa useSearchParams, que exige essa fronteira). */}
      <div className="w-56 shrink-0 border-r border-borda" />

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
