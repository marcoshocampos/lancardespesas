'use client';

import { useState, useTransition } from 'react';
import { Lock, LockOpen } from 'lucide-react';
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
import { formatarCompetencia, type Competencia } from '@/domain/competencia';
import { acaoDestravarFatura, acaoTravarFatura } from '@/server/actions/fatura';

type Props = {
  contaId: string;
  competencia: Competencia;
  nome: string;
  travada: boolean;
  /** Travar exige extrato registrado; sem ele o botao explica em vez de falhar. */
  temExtrato: boolean;
};

type Motivo = 'FATURA_TRAVADA' | 'SEM_EXTRATO' | 'NAO_EXISTE' | 'NAO_ESTAVA_TRAVADA';

/**
 * As recusas do servidor em palavras. `switch` sem `default`: no dia em que
 * `ResultadoTrava` ganhar um motivo, o TypeScript reclama aqui em vez de a
 * tela mostrar uma mensagem vazia.
 */
function textoDaRecusa(motivo: Motivo): string {
  switch (motivo) {
    case 'SEM_EXTRATO':
      return 'Registre o valor do extrato antes de fechar o mês.';
    case 'NAO_EXISTE':
      return 'Esse mês ainda não tem conferência registrada.';
    case 'FATURA_TRAVADA':
      return 'Essa fatura já estava travada — alguém fechou o mês antes de você.';
    case 'NAO_ESTAVA_TRAVADA':
      return 'Essa fatura já não estava travada.';
  }
}

/**
 * Fechar e reabrir o mês, ao lado do número que se acabou de conferir.
 *
 * Até esta tarefa a trava existia no banco, era respeitada por toda gravação e
 * **não tinha como ser acionada**: três mensagens da interface mandavam
 * "destrave a fatura" apontando para algo impossível de fazer pela tela. Era
 * trabalho de SQL.
 *
 * Os dois gestos pedem confirmação, e não só o destravar. O invariante 5 exige
 * explicitude ao destravar, mas travar também é consequente: deixa o mês
 * inteiro somente-leitura, e descobrir isso por acidente, ao tentar lançar, é
 * pior do que um diálogo a mais.
 *
 * Quem travou **não** vem da tela: a action resolve o membro pela sessão. O
 * cliente não tem como afirmar que foi outra pessoa.
 */
export function TravaFatura({ contaId, competencia, nome, travada, temExtrato }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const mes = formatarCompetencia(competencia);

  function aoMudarAberto(proximo: boolean) {
    // Fechar no meio do envio deixaria a transicao orfa e a mensagem de recusa
    // sem onde aparecer. Mesma trava do dialogo de exclusao.
    if (pendente) return;
    setAberto(proximo);
    if (!proximo) setErro(null);
  }

  function agir() {
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = travada
          ? await acaoDestravarFatura({ contaId, competencia })
          : await acaoTravarFatura({ contaId, competencia });

        if (!resultado.ok) {
          setErro(textoDaRecusa(resultado.motivo));
          return;
        }
        setAberto(false);
        toast.success(
          travada ? `${mes} reaberto em ${nome}` : `${mes} fechado em ${nome}`,
        );
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  // Botao desabilitado tem que dizer por que: sem isto a pessoa fica clicando
  // num controle morto sem relacao visivel com o campo vazio ao lado.
  const impedido = !travada && !temExtrato;

  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAberto}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={travada ? 'outline' : 'ghost'}
          disabled={impedido}
          title={impedido ? 'Registre o valor do extrato antes de fechar o mês' : undefined}
        >
          {travada ? <LockOpen aria-hidden="true" /> : <Lock aria-hidden="true" />}
          {travada ? 'Reabrir' : 'Fechar o mês'}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent
        onEscapeKeyDown={(evento) => {
          if (pendente) evento.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {travada ? `Reabrir ${mes} em ${nome}?` : `Fechar ${mes} em ${nome}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {travada
              ? `Lançar, editar e excluir voltam a funcionar nas competências desta fatura, e o valor do extrato volta a aceitar correção. Fica registrado quem reabriu e quando.`
              : `A fatura passa a somente-leitura: ninguém lança, edita ou exclui nas competências dela, nem corrige o valor do extrato. Dá para reabrir depois, e fica registrado quem fechou.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendente}
            onClick={(evento) => {
              evento.preventDefault();
              agir();
            }}
          >
            {pendente ? 'Salvando…' : travada ? 'Reabrir' : 'Fechar o mês'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
