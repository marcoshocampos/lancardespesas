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
import { alcanceDaFaixa, type Alcance } from '@/domain/divisao';
import type { Faixa } from '@/domain/parcelamento';
import { descreverTrava, type FaturaTravada } from '@/domain/trava';
import { acaoExcluirLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { alcanceInicial, faixaDaLinha, opcoesDeAlcance, temAlcance, travaDoAlcance } from './alcance-da-linha';
import { ControleAlcance } from './controle-alcance';

/**
 * A grade mostra a PARCELA (`3/12`), mas excluir age sobre o alcance escolhido
 * — uma parcela, ela e as seguintes, ou todas. A confirmacao soletra quais
 * parcelas somem e em qual faixa de meses: a `competencia` da grade e a da
 * parcela clicada, e `avancarCompetencia` acha as pontas sem nova consulta.
 */
function mensagemExclusao(linha: LinhaGrade, competencia: string, alvo: Faixa): string {
  const fim = 'Essa ação não pode ser desfeita por aqui.';
  if (linha.numeroParcelas <= 1) return `Excluir "${linha.descricao}"? ${fim}`;

  const primeira = formatarCompetencia(avancarCompetencia(competencia, alvo.inicial - linha.numero));
  if (alvo.inicial === alvo.final) {
    return `Excluir a parcela ${alvo.inicial} de "${linha.descricao}", de ${primeira}. ${fim}`;
  }
  const ultima = formatarCompetencia(avancarCompetencia(competencia, alvo.final - linha.numero));
  return (
    `Excluir "${linha.descricao}" remove as parcelas ${alvo.inicial} a ${alvo.final}, ` +
    `de ${primeira} a ${ultima}. ${fim}`
  );
}

type Props = {
  linha: LinhaGrade;
  competencia: string;
  travadas: readonly FaturaTravada[];
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
export function DialogoExclusao({ linha, competencia, travadas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const opcoes = opcoesDeAlcance(linha, competencia, travadas);
  const padrao = (): Alcance => (temAlcance(linha) ? (alcanceInicial(opcoes) ?? 'SO_ESTA') : 'TODAS');
  const [alcance, setAlcance] = useState<Alcance>(padrao);
  /** O mes da propria linha esta travado: nenhum alcance sai daqui. */
  const travaDaLinha = travaDoAlcance(linha, competencia, travadas, 'SO_ESTA');
  const alvo = alcanceDaFaixa(faixaDaLinha(linha), linha.numero, alcance);

  // Mesmo padrao de `painel-lancamento.tsx` (`PainelLancamento`, achado 1 da
  // revisao de bc54df3): Esc e o Cancelar pedem fechar via `onOpenChange`
  // direto, sem passar pelos handlers de baixo — so da pra barrar aqui.
  // Ignorar o pedido enquanto `pendente` e o que evita perder a mensagem de
  // recusa (FATURA_TRAVADA ou CONFLITO) se o servidor recusar a exclusao:
  // fechar cedo demais faz a pessoa achar que excluiu quando nao excluiu.
  function aoMudarAberto(novoAberto: boolean) {
    if (!novoAberto && pendente) return;
    setAberto(novoAberto);
    // O dialogo fica montado com a linha, e as travadas podem ter mudado desde a ultima abertura.
    if (novoAberto) setAlcance(padrao());
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
        const resultado = await acaoExcluirLancamento(linha.lancamentoId, linha.versao, alcance, linha.numero);
        if (!resultado.ok) {
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? descreverTrava(resultado.travada)
              : 'Alguém alterou esse lançamento antes. Atualize a página e tente de novo.',
          );
          return;
        }
        setAberto(false);
        const quantas = alvo.final - alvo.inicial + 1;
        toast.success(
          linha.numeroParcelas <= 1
            ? 'Lançamento excluído'
            : quantas === 1
              ? 'Parcela excluída'
              : `${quantas} parcelas excluídas`,
        );
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
          <AlertDialogDescription>{mensagemExclusao(linha, competencia, alvo)}</AlertDialogDescription>
        </AlertDialogHeader>
        {travaDaLinha ? (
          <p role="alert" className="rounded-caixa border border-atencao bg-atencao-fundo p-3 text-sm text-atencao">
            {descreverTrava(travaDaLinha)}
          </p>
        ) : (
          temAlcance(linha) && (
            <ControleAlcance
              nome={`alcance-exclusao-${linha.parcelaId}`}
              valor={alcance}
              opcoes={opcoes}
              onMudar={setAlcance}
              desabilitado={pendente}
            />
          )
        )}
        {erro && (
          <p role="alert" className="text-sm text-negativo">
            {erro}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pendente || travaDaLinha !== null}
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
