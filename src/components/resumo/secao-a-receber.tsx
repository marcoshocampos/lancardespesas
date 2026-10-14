'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { formatarBRL } from '@/domain/money';
import { acaoMarcarReembolso } from '@/server/actions/lancamento';
import type { LinhaAReceber } from '@/server/repositorios/resumo';

/**
 * A lista que explica a linha *A receber* da matriz: o que o casal pagou neste
 * mês e alguém de fora vai devolver.
 *
 * Fica logo abaixo da matriz, e não numa tela própria, porque o número já está
 * ali em cima — lista e total a um palmo um do outro, em vez de a pessoa ter
 * que lembrar de conferir noutro lugar. Para duas ou três linhas por mês, uma
 * entrada na barra lateral seria navegação sem conteúdo.
 *
 * **Não aparece em mês sem reembolso**, mesma regra das linhas da matriz: sem
 * nada a receber, o `Somado` fecha com a soma dos *Cabe a*, e uma seção vazia
 * permanente sugeriria uma lacuna que não existe.
 *
 * Marcar como recebido **não altera número nenhum**. O valor está fora do gasto
 * do casal e dentro do `Somado` nos dois estados; a marca responde de quem
 * ainda cobrar. Dívida aqui é informação, não contabilidade.
 */
export function SecaoAReceber({ linhas }: { linhas: LinhaAReceber[] }) {
  if (linhas.length === 0) return null;

  const total = linhas.reduce((acc, l) => acc + l.valorCentavos, 0);
  const aberto = linhas.filter((l) => !l.recebido).reduce((acc, l) => acc + l.valorCentavos, 0);

  return (
    <section
      aria-label="A receber de terceiros"
      className="mt-4 rounded-caixa border border-borda bg-superficie px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-medium text-tinta">A receber de terceiros</h2>
        <p className="text-xs text-tinta-fraca">
          {aberto === total ? (
            <>
              <span className="tabular-nums">{formatarBRL(total)}</span> em aberto
            </>
          ) : (
            <>
              <span className="tabular-nums">{formatarBRL(aberto)}</span> em aberto, de{' '}
              <span className="tabular-nums">{formatarBRL(total)}</span>
            </>
          )}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-borda-suave">
        {linhas.map((linha) => (
          <ItemAReceber key={`${linha.lancamentoId}-${linha.numero}`} linha={linha} />
        ))}
      </ul>
    </section>
  );
}

function ItemAReceber({ linha }: { linha: LinhaAReceber }) {
  // Otimista de propósito: o interruptor responde na hora e volta atrás se o
  // servidor recusar. Sem isso o controle fica parado por meio segundo e a
  // pessoa clica de novo, mandando a marca contrária.
  const [recebido, setRecebido] = useState(linha.recebido);
  const [pendente, iniciar] = useTransition();

  const idRotulo = `a-receber-${linha.lancamentoId}-${linha.numero}`;
  const dono = linha.escopo === 'CONJUNTO' ? 'Conjunto' : (linha.membroNome ?? 'sem pessoa');

  function alternar(proximo: boolean) {
    setRecebido(proximo);
    iniciar(async () => {
      try {
        const resultado = await acaoMarcarReembolso({
          id: linha.lancamentoId,
          versao: linha.versao,
          recebido: proximo,
        });
        if (!resultado.ok) {
          setRecebido(!proximo);
          toast.error(
            resultado.motivo === 'CONFLITO'
              ? 'Alguém mexeu neste lançamento. Recarregue a página.'
              : 'Não foi possível marcar.',
          );
        }
      } catch {
        setRecebido(!proximo);
        toast.error('Não foi possível marcar.');
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-0">
        <p id={idRotulo} className={`truncate text-sm ${recebido ? 'text-tinta-fraca' : 'text-tinta'}`}>
          {linha.descricao}
          {linha.numeroParcelas > 1 && (
            <span className="ml-1.5 text-xs text-tinta-fraca tabular-nums">
              {linha.numero}/{linha.numeroParcelas}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-tinta-fraca">
          {/* Sem nome do devedor a lista ainda serve: o valor e a descricao
              dizem o bastante para a pessoa lembrar de quem e. */}
          {linha.devedorNome ? `${linha.devedorNome} · ` : ''}
          pago por {dono} no {linha.contaNome}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className={`text-sm tabular-nums ${recebido ? 'text-tinta-fraca line-through' : 'text-tinta'}`}>
          {formatarBRL(linha.valorCentavos)}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-tinta-fraca">Recebido</span>
          <Switch
            checked={recebido}
            onCheckedChange={alternar}
            disabled={pendente}
            aria-labelledby={idRotulo}
          />
        </span>
      </div>
    </li>
  );
}
