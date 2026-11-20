'use client';

import { useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Grupo } from '@/domain/agrupamento';
import { formatarBRL } from '@/domain/money';
import type { FaturaTravada } from '@/domain/trava';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { DialogoExclusao } from './dialogo-exclusao';
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
  /** Faturas travadas: o dialogo de exclusao decide o alcance por elas. */
  travadas: readonly FaturaTravada[];
  categorias: Categoria[];
  /** Lancamento que a busca mandou mostrar (`?destaque=`): a linha dele realca e rola ate a vista. */
  destaque?: string | undefined;
  /** Abre o painel de edicao (`painel-lancamento.tsx`) para esta linha. */
  onEditar: (linha: LinhaGrade) => void;
};

type AcoesLinhaProps = {
  linha: LinhaGrade;
  competencia: string;
  travadas: readonly FaturaTravada[];
  onEditar: () => void;
};

/**
 * Editar e excluir so aparecem sob o cursor. `opacity-0` some visualmente sem
 * tirar os botoes do fluxo de foco — ao contrario de `hidden`, que tiraria — e
 * `focus-within` no proprio wrapper cobre o Tab chegando em qualquer um dos
 * dois, sem depender do mouse estar sobre a linha.
 *
 * Excluir abre `DialogoExclusao` (modal, radix-ui) em vez de decidir na hora —
 * a mensagem de erro (fatura travada, conflito de versao) mora dentro do
 * dialogo agora, entao nao depende mais do mouse ou do foco continuarem
 * nesta linha para seguir visivel.
 */
function AcoesLinha({ linha, competencia, travadas, onEditar }: AcoesLinhaProps) {
  return (
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
      <DialogoExclusao linha={linha} competencia={competencia} travadas={travadas} />
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
  travadas: readonly FaturaTravada[];
  /** E o lancamento que a busca mandou mostrar. */
  destacada: boolean;
  onEditar: (linha: LinhaGrade) => void;
};

function LinhaDaSecao({
  linha,
  esmaecida,
  categoriaCor,
  competencia,
  travadas,
  destacada,
  onEditar,
}: LinhaProps) {
  const ref = useRef<HTMLTableRowElement>(null);

  // Uma vez, ao abrir: quem chega da busca precisa achar a linha sem procurar
  // de novo. `block: 'center'` deixa contexto acima e abaixo. O realce fica
  // enquanto o `?destaque=` estiver na URL; trocar de mes pelas setas o solta,
  // porque a faixa monta os links so com competencia e conta.
  useEffect(() => {
    if (destacada) ref.current?.scrollIntoView({ block: 'center' });
  }, [destacada]);

  return (
    <tr
      ref={ref}
      data-destaque={destacada || undefined}
      className={`group border-b border-borda-suave last:border-0 hover:bg-realce ${destacada ? 'bg-acento/10' : ''}`}
    >
      {/* A barra de acento na primeira celula, e nao borda no <tr>: borda e
          sombra em linha de tabela nao desenham igual em todo navegador. */}
      <td
        className={`px-3 py-2 ${destacada ? 'shadow-[inset_3px_0_0_var(--color-acento)]' : ''} ${esmaecida ? 'text-tinta-apagada' : 'text-tinta-fraca'}`}
      >
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
        <AcoesLinha linha={linha} competencia={competencia} travadas={travadas} onEditar={() => onEditar(linha)} />
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
export function SecaoPessoa({
  titulo,
  cores,
  grupo,
  colSpan,
  competencia,
  travadas,
  categorias,
  destaque,
  onEditar,
}: Props) {
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
            travadas={travadas}
            destacada={item.linha.lancamentoId === destaque}
            onEditar={onEditar}
          />
        );
      })}
    </tbody>
  );
}
