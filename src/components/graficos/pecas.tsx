'use client';

import type { ReactNode } from 'react';
import { formatarBRL } from '@/domain/money';

/**
 * O que os três gráficos têm em comum: a caixa da dica, o estado vazio e a
 * moldura com título.
 *
 * Mora num arquivo só para os três não divergirem no que é pura repetição —
 * tooltip com formato diferente entre gráficos da mesma tela faz a pessoa
 * reaprender a ler a cada seção.
 */

/** Mês sem dado não vira gráfico vazio: vira frase. */
export function SemDado({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-caixa border border-dashed border-borda px-4 py-8 text-center text-sm text-tinta-fraca">
      {children}
    </p>
  );
}

export type ItemDaDica = {
  nome: string;
  valorCentavos: number;
  /** Quadradinho de cor ao lado do nome. Omitido em série única. */
  cor?: string;
};

/**
 * A dica que aparece no hover.
 *
 * O texto usa cor de tinta, nunca a cor da série: quem carrega identidade é o
 * quadradinho ao lado. Valor colorido fica ilegível justamente nas séries de
 * tom mais claro.
 */
export function CaixaDaDica({ titulo, itens }: { titulo: string; itens: ItemDaDica[] }) {
  return (
    <div className="rounded-campo border border-borda bg-superficie px-3 py-2 shadow-flutuante">
      <p className="text-xs font-medium text-tinta">{titulo}</p>
      <ul className="mt-1 space-y-0.5">
        {itens.map((i) => (
          <li key={i.nome} className="flex items-center gap-2 text-xs text-tinta-fraca">
            {i.cor && (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: i.cor }}
              />
            )}
            <span>{i.nome}</span>
            <span className="ml-auto tabular-nums text-tinta">{formatarBRL(i.valorCentavos)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cada gráfico leva título e uma linha que diz o que ele responde. */
export function Moldura({
  titulo,
  explicacao,
  children,
}: {
  titulo: string;
  explicacao: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-caixa border border-borda bg-superficie px-5 py-4">
      <h2 className="text-sm font-medium text-tinta">{titulo}</h2>
      <p className="mt-0.5 mb-4 text-xs text-tinta-fraca">{explicacao}</p>
      {children}
    </section>
  );
}

/** `AAAA-MM` para `mar/26` — eixo de mês não cabe com o nome inteiro. */
export function mesCurto(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const indice = Number(mes) - 1;
  return `${nomes[indice] ?? mes}/${(ano ?? '').slice(2)}`;
}
