'use client';

import { useState, useTransition } from 'react';
import { Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import { acaoRestaurarLancamento } from '@/server/actions/lancamento';
import type { ItemDaLixeira } from '@/server/repositorios/lixeira';

/**
 * Em que meses as parcelas caem — a pergunta que a lista precisa responder e
 * que nenhuma outra tela precisa, porque todas as outras já são de um mês só.
 */
function faixaDeMeses(item: ItemDaLixeira): string | null {
  if (!item.primeiraCompetencia || !item.ultimaCompetencia) return null;
  const primeiro = formatarCompetencia(item.primeiraCompetencia);
  if (item.primeiraCompetencia === item.ultimaCompetencia) return primeiro;
  return `${primeiro} a ${formatarCompetencia(item.ultimaCompetencia)}`;
}

/** Data e hora curtas, no fuso de casa — a lixeira é sobre "o que eu acabei de fazer". */
function quando(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(data);
}

export function ListaLixeira({ itens }: { itens: ItemDaLixeira[] }) {
  if (itens.length === 0) {
    return (
      <div className="rounded-caixa border border-borda bg-superficie px-6 py-10 text-center">
        <p className="text-sm text-tinta">A lixeira está vazia.</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-tinta-fraca">
          Lançamento excluído vem parar aqui, com as parcelas dele, e pode voltar a qualquer
          momento. Nada é apagado de verdade.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-borda-suave overflow-hidden rounded-caixa border border-borda bg-superficie">
      {itens.map((item) => (
        <ItemLixeira key={item.lancamentoId} item={item} />
      ))}
    </ul>
  );
}

function ItemLixeira({ item }: { item: ItemDaLixeira }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const meses = faixaDeMeses(item);
  const dono = item.escopo === 'CONJUNTO' ? 'Conjunto' : (item.membroNome ?? 'sem pessoa');

  function restaurar() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoRestaurarLancamento(item.lancamentoId, item.versao);
        if (!resultado.ok) {
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? 'Uma das faturas deste lançamento foi fechada depois da exclusão. Destrave para restaurar.'
              : 'Alguém mexeu neste lançamento. Recarregue a página.',
          );
          return;
        }
        toast.success(`"${item.descricao}" restaurado`);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível restaurar.');
      }
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-tinta">
            {item.descricao}
            {item.numeroParcelas > 1 && (
              <span className="ml-1.5 text-xs text-tinta-fraca tabular-nums">
                {item.numeroParcelas}x
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-tinta-fraca">
            {dono} · {item.categoriaNome} · {item.contaNome}
            {meses && <> · {meses}</>}
          </p>
          <p className="mt-0.5 text-xs text-tinta-apagada">
            Excluído em {quando(item.excluidoEm)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-tinta tabular-nums">{formatarBRL(item.valorCentavos)}</span>
          <Button type="button" variant="outline" size="sm" onClick={restaurar} disabled={pendente}>
            <Undo2 aria-hidden="true" />
            {pendente ? 'Restaurando…' : 'Restaurar'}
          </Button>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mt-2 text-sm text-negativo">
          {erro}
        </p>
      )}
    </li>
  );
}
