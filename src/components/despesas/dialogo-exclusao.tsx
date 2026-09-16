'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { avancarCompetencia, formatarCompetencia } from '@/domain/competencia';
import { acaoExcluirLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';

/**
 * A grade mostra a PARCELA (`3/12`), mas excluir age no lancamento inteiro — as
 * doze parcelas. A pessoa que ve so a linha "3/12" nao tem como adivinhar isso,
 * entao a confirmacao precisa soletrar quantas parcelas somem e em qual faixa de
 * competencia. `linha.numero` e `linha.numeroParcelas` dizem "sou a 3a de 12"; a
 * `competenciaDaLinha` (a competencia atual da grade, onde esta parcela caiu) mais
 * `avancarCompetencia` bastam para achar a primeira e a ultima sem nova consulta.
 *
 * Movida de `secao-pessoa.tsx` (era ali que o confirm nativo do navegador
 * vivia) para perto do dialogo que agora a mostra — o texto que ela produz
 * nao mudou uma virgula.
 */
function mensagemExclusao(linha: LinhaGrade, competenciaDaLinha: string): string {
  if (linha.numeroParcelas <= 1) {
    return `Excluir "${linha.descricao}"? Essa ação não pode ser desfeita por aqui.`;
  }

  const primeira = avancarCompetencia(competenciaDaLinha, -(linha.numero - 1));
  const ultima = avancarCompetencia(competenciaDaLinha, linha.numeroParcelas - linha.numero);
  return (
    `Excluir "${linha.descricao}" remove as ${linha.numeroParcelas} parcelas, ` +
    `de ${formatarCompetencia(primeira)} a ${formatarCompetencia(ultima)}. ` +
    'Essa ação não pode ser desfeita por aqui.'
  );
}

type Props = {
  linha: LinhaGrade;
  competencia: string;
};

/**
 * Substitui o balao cinza de confirmacao do sistema operacional por um
 * dialogo desenhado. O gatilho e o proprio botao de lixeira da linha; o
 * `AlertDialog` cuida de abrir sobre a grade, prender o foco e nunca fechar
 * por clique fora — essa ultima regra vem de dentro do proprio
 * `AlertDialogContent` do radix-ui (sempre previne o fechamento por
 * interacao externa), entao nao precisa reforco aqui.
 *
 * `negativo` e reservado para mensagem de erro em todo o resto do sistema; o
 * botao de confirmar exclusao e a unica excecao — aqui, e so aqui, e o momento
 * em que a acao destrutiva de fato acontece.
 */
export function DialogoExclusao({ linha, competencia }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // Mesmo padrao de `painel-lancamento.tsx` (`PainelLancamento`, achado 1 da
  // revisao de bc54df3): Esc e o Cancelar pedem fechar via `onOpenChange`
  // direto, sem passar pelos handlers de baixo — so da pra barrar aqui.
  // Ignorar o pedido enquanto `pendente` e o que evita perder a mensagem de
  // recusa (FATURA_TRAVADA ou CONFLITO) se o servidor recusar a exclusao:
  // fechar cedo demais faz a pessoa achar que excluiu quando nao excluiu.
  function aoMudarAberto(novoAberto: boolean) {
    if (!novoAberto && pendente) return;
    setAberto(novoAberto);
    if (!novoAberto) setErro(null);
  }

  // `AlertDialogAction` fecha sozinho ao ser clicado (por baixo, e um
  // `Dialog.Close`) — `preventDefault` no clique cancela esse fechamento
  // automatico, para o dialogo so sumir quando NOS decidirmos (sucesso), e
  // continuar aberto mostrando o erro quando o servidor recusa.
  function excluir() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await acaoExcluirLancamento(linha.lancamentoId, linha.versao);
        if (!resultado.ok) {
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? 'Esse mês já está fechado. Destrave a fatura para excluir.'
              : 'Alguém alterou esse lançamento antes. Atualize a página e tente de novo.',
          );
          return;
        }
        setAberto(false);
        const mensagem =
          linha.numeroParcelas <= 1
            ? 'Lançamento excluído'
            : `${linha.numeroParcelas} parcelas excluídas`;
        toast.success(mensagem);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
      }
    });
  }

  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAberto}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm">
          <Trash2 aria-hidden="true" />
          <span className="sr-only">Excluir</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onEscapeKeyDown={(evento) => {
          if (pendente) evento.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir lançamento</AlertDialogTitle>
          <AlertDialogDescription>{mensagemExclusao(linha, competencia)}</AlertDialogDescription>
        </AlertDialogHeader>
        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pendente}
            onClick={(evento) => {
              evento.preventDefault();
              excluir();
            }}
          >
            {pendente ? 'Excluindo…' : 'Excluir'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
