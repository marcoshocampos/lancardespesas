'use client';

import { useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Grupo } from '@/domain/agrupamento';
import { avancarCompetencia, formatarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import { acaoExcluirLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { idBotaoEditar } from './painel-lancamento';

type Categoria = { id: string; nome: string; cor: string };

/** O que `agrupar` recebe e devolve: a chave da secao, mais a parcela original. */
export type ItemDeGrupo = { chave: string; valorCentavos: number; linha: LinhaGrade };

type Props = {
  /** Nome do membro, ou "Conjunto". */
  titulo: string;
  /** Uma cor pinta a faixa inteira; duas a bipartem (usado so pelo grupo Conjunto). */
  cores: readonly string[];
  grupo: Grupo<ItemDeGrupo>;
  /** Quantas colunas a linha de cabecalho ocupa — mesmo numero de `CABECALHOS`. */
  colSpan: number;
  competencia: string;
  categorias: Categoria[];
  /** Abre o painel de edicao (`painel-lancamento.tsx`) para esta linha. */
  onEditar: (linha: LinhaGrade) => void;
};

/**
 * A grade mostra a PARCELA (`3/12`), mas excluir age no lancamento inteiro — as
 * doze parcelas. A pessoa que ve so a linha "3/12" nao tem como adivinhar isso,
 * entao a confirmacao precisa soletrar quantas parcelas somem e em qual faixa de
 * competencia. `linha.numero` e `linha.numeroParcelas` dizem "sou a 3a de 12"; a
 * `competenciaDaLinha` (a competencia atual da grade, onde esta parcela caiu) mais
 * `avancarCompetencia` bastam para achar a primeira e a ultima sem nova consulta.
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

type AcoesLinhaProps = {
  linha: LinhaGrade;
  competencia: string;
  onEditar: () => void;
};

/**
 * Editar e excluir so aparecem sob o cursor. `opacity-0` some visualmente sem
 * tirar os botoes do fluxo de foco — ao contrario de `hidden`, que tiraria — e
 * `focus-within` no proprio wrapper cobre o Tab chegando em qualquer um dos
 * dois, sem depender do mouse estar sobre a linha.
 *
 * A mensagem de erro fica FORA desse wrapper: se a exclusao falhar (fatura
 * travada, conflito de versao), quem clicou precisa continuar vendo o motivo
 * mesmo depois de tirar o mouse ou o foco da linha.
 */
function AcoesLinha({ linha, competencia, onEditar }: AcoesLinhaProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function excluir() {
    setErro(null);
    if (!window.confirm(mensagemExclusao(linha, competencia))) return;

    iniciar(async () => {
      try {
        const resultado = await acaoExcluirLancamento(linha.lancamentoId, linha.versao);
        if (!resultado.ok) {
          setErro(
            resultado.motivo === 'FATURA_TRAVADA'
              ? 'Esse mês já está fechado. Destrave a fatura para excluir.'
              : 'Alguém alterou esse lançamento antes. Atualize a página e tente de novo.',
          );
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível excluir.');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          id={idBotaoEditar(linha.parcelaId)}
          onClick={onEditar}
        >
          <Pencil aria-hidden="true" />
          <span className="sr-only">Editar</span>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={excluir} disabled={pendente}>
          <Trash2 aria-hidden="true" />
          <span className="sr-only">{pendente ? 'Excluindo…' : 'Excluir'}</span>
        </Button>
      </div>
      {erro && (
        <span role="alert" className="text-xs text-negativo">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Faixa de identidade do cabecalho: uma cor so, ou bipartida para o Conjunto. */
function FaixaCor({ cores }: { cores: readonly string[] }) {
  return (
    <span aria-hidden="true" className="flex h-5 w-1.5 shrink-0 overflow-hidden rounded-full">
      {cores.map((cor, indice) => (
        <span key={indice} className="flex-1" style={{ backgroundColor: cor }} />
      ))}
    </span>
  );
}

/** Vazio quando a compra e a vista — o `—` de hoje era ruido, nao informacao. */
function rotuloParcela(linha: LinhaGrade): string {
  return linha.numeroParcelas > 1 ? `${linha.numero}/${linha.numeroParcelas}` : '';
}

type LinhaProps = {
  linha: LinhaGrade;
  /** A data repete a da linha anterior, na mesma secao — esmaece para reduzir ruido. */
  esmaecida: boolean;
  categoriaCor: string | undefined;
  competencia: string;
  onEditar: (linha: LinhaGrade) => void;
};

function LinhaDaSecao({ linha, esmaecida, categoriaCor, competencia, onEditar }: LinhaProps) {
  return (
    <tr className="group border-b border-borda-suave last:border-0 hover:bg-realce">
      <td className={`px-3 py-2 ${esmaecida ? 'text-tinta-apagada' : 'text-tinta-fraca'}`}>
        {linha.dataCompra.slice(8, 10)}/{linha.dataCompra.slice(5, 7)}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-tinta">{linha.descricao}</span>
          {linha.ehReembolso && (
            <Badge variant="secondary" className="bg-atencao-fundo text-atencao">
              a receber
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-tinta-fraca">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: categoriaCor }}
          />
          {linha.categoriaNome}
        </div>
      </td>
      <td className="px-3 py-2 text-tinta-fraca">{rotuloParcela(linha)}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums text-tinta">
        {formatarBRL(linha.valorCentavos)}
      </td>
      <td className="px-3 py-2 text-right align-top">
        <AcoesLinha linha={linha} competencia={competencia} onEditar={() => onEditar(linha)} />
      </td>
    </tr>
  );
}

/**
 * Uma secao da grade: cabecalho com a faixa de cor, o nome, a contagem e o
 * subtotal, seguido das linhas do grupo. Um grupo vazio ainda recebe esta
 * secao — zerada, nao omitida; quem decide se a tela inteira deve mostrar o
 * estado vazio em vez das secoes e `GradeLancamentos`, olhando todos os grupos
 * de uma vez.
 */
export function SecaoPessoa({ titulo, cores, grupo, colSpan, competencia, categorias, onEditar }: Props) {
  const vazia = grupo.quantidade === 0;

  return (
    <tbody className="border-b border-borda last:border-0">
      <tr className="bg-superficie-alta">
        <th scope="rowgroup" colSpan={colSpan} className="px-3 py-2 text-left align-middle font-normal">
          <div className="flex items-center gap-3">
            <FaixaCor cores={cores} />
            <span className="text-sm font-semibold text-tinta">{titulo}</span>
            <span className={`text-xs ${vazia ? 'text-tinta-apagada' : 'text-tinta-fraca'}`}>
              {grupo.quantidade} {grupo.quantidade === 1 ? 'lançamento' : 'lançamentos'}
            </span>
            <span
              className={`ml-auto text-sm font-semibold tabular-nums ${vazia ? 'text-tinta-apagada' : 'text-tinta'}`}
            >
              {formatarBRL(grupo.subtotalCentavos)}
            </span>
          </div>
        </th>
      </tr>
      {grupo.itens.map((item, indice) => {
        const anterior = grupo.itens[indice - 1];
        const esmaecida = anterior !== undefined && anterior.linha.dataCompra === item.linha.dataCompra;
        const categoriaCor = categorias.find((c) => c.id === item.linha.categoriaId)?.cor;

        return (
          <LinhaDaSecao
            key={item.linha.parcelaId}
            linha={item.linha}
            esmaecida={esmaecida}
            categoriaCor={categoriaCor}
            competencia={competencia}
            onEditar={onEditar}
          />
        );
      })}
    </tbody>
  );
}
