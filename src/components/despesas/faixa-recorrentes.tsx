'use client';

import { useState, useTransition } from 'react';
import { Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatarBRL } from '@/domain/money';
import { acaoLancarRecorrentes } from '@/server/actions/recorrente';
import type { RecorrentePendente } from '@/server/repositorios/recorrente';

/**
 * O que é fixo no mês e ainda não foi lançado, com um clique para lançar.
 *
 * **Nada nasce sozinho.** A regra original previa gerar "na primeira vez que
 * alguém abre o mês", e isso foi trocado por este clique de propósito: para o
 * framework, renderizar a página não é o mesmo que alguém abri-la — ele
 * renderiza de novo após cada gravação e pode renderizar adiantado. Gerar na
 * renderização seria lançar despesa sem ninguém pedir. Ver `docs/decisoes.md`.
 *
 * O clique manda só a competência. Quais recorrentes entram é decidido no
 * servidor, pela mesma triagem que montou esta lista — então a lista mostrada
 * e o que é gravado não têm como divergir por causa da tela.
 *
 * Some quando não há pendência, que é o estado da maior parte do mês.
 */
export function FaixaRecorrentes({
  pendentes,
  competencia,
}: {
  pendentes: RecorrentePendente[];
  competencia: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (pendentes.length === 0) return null;

  const total = pendentes.reduce((acc, r) => acc + r.valorCentavos, 0);

  function lancar() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoLancarRecorrentes({ competencia });
        if (resultado.lancadas > 0) {
          toast.success(
            resultado.lancadas === 1 ? '1 recorrente lançada' : `${resultado.lancadas} recorrentes lançadas`,
          );
        }
        if (resultado.puladas > 0) {
          // Fatura fechada no meio do caminho, ou a outra pessoa clicou junto.
          // Nao e erro: o que ficou de fora ou ja esta lancado ou nao pode ser.
          setErro(
            resultado.puladas === 1
              ? 'Uma recorrente ficou de fora: a fatura dela foi fechada ou ela já tinha sido lançada.'
              : `${resultado.puladas} recorrentes ficaram de fora: fatura fechada ou já lançadas.`,
          );
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível lançar.');
      }
    });
  }

  return (
    <section
      aria-label="Recorrentes a lançar neste mês"
      className="mt-4 rounded-caixa border border-borda bg-superficie-alta px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-tinta">
            <Repeat aria-hidden="true" className="size-4 shrink-0 text-tinta-fraca" />
            {pendentes.length === 1
              ? '1 recorrente para lançar neste mês'
              : `${pendentes.length} recorrentes para lançar neste mês`}
            <span className="tabular-nums text-tinta-fraca">· {formatarBRL(total)}</span>
          </p>
          <p className="mt-1 text-xs text-tinta-fraca">
            {pendentes.map((r) => `${r.descricao} (${formatarBRL(r.valorCentavos)})`).join(' · ')}
          </p>
        </div>

        <Button type="button" size="sm" onClick={lancar} disabled={pendente}>
          {pendente ? 'Lançando…' : pendentes.length === 1 ? 'Lançar' : 'Lançar todas'}
        </Button>
      </div>

      {erro && (
        <p role="alert" className="mt-2 text-xs text-tinta-fraca">
          {erro}
        </p>
      )}
    </section>
  );
}
