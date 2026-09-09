'use client';

import { useState, useTransition } from 'react';
import { avancarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import { acaoExcluirLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import { LinhaEdicao } from './linha-edicao';

type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = { id: string; nome: string; tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

type Props = {
  linhas: LinhaGrade[];
  competencia: string;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
};

const CABECALHOS = ['Data', 'Descrição', 'De quem', 'Categoria', 'Parc.', 'Valor', 'Ações'];

function rotuloParcela(linha: LinhaGrade): string {
  return linha.numeroParcelas > 1 ? `${linha.numero}/${linha.numeroParcelas}` : '—';
}

function deQuem(linha: LinhaGrade): string {
  return linha.escopo === 'CONJUNTO' ? 'Conjunto' : (linha.membroNome ?? '—');
}

function formatarMesAno(competencia: string): string {
  const [anoTexto, mesTexto] = competencia.split('-');
  const data = new Date(Date.UTC(Number(anoTexto), Number(mesTexto) - 1, 1));
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(data);
}

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
    `de ${formatarMesAno(primeira)} a ${formatarMesAno(ultima)}. ` +
    'Essa ação não pode ser desfeita por aqui.'
  );
}

type AcoesLinhaProps = {
  linha: LinhaGrade;
  competencia: string;
  onEditar: () => void;
};

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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onEditar} className="text-xs text-neutral-600 underline">
        Editar
      </button>
      <button
        type="button"
        onClick={excluir}
        disabled={pendente}
        className="text-xs text-red-700 underline disabled:opacity-50"
      >
        {pendente ? 'Excluindo…' : 'Excluir'}
      </button>
      {erro && (
        <span role="alert" className="w-full text-right text-xs text-red-700">
          {erro}
        </span>
      )}
    </div>
  );
}

export function GradeLancamentos({ linhas, competencia, contas, categorias, membros }: Props) {
  const [editandoId, setEditandoId] = useState<string | null>(null);

  if (linhas.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-neutral-500">
        Nenhum lançamento nesta competência.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
            {CABECALHOS.map((c) => (
              <th
                key={c}
                className={
                  c === 'Valor' || c === 'Ações' ? 'px-3 py-2 text-right' : 'px-3 py-2 text-left'
                }
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            if (linha.lancamentoId === editandoId) {
              return (
                <tr key={linha.parcelaId} className="border-b last:border-0">
                  <td colSpan={CABECALHOS.length} className="p-0">
                    <LinhaEdicao
                      linha={linha}
                      contas={contas}
                      categorias={categorias}
                      membros={membros}
                      onCancelar={() => setEditandoId(null)}
                      onSalvo={() => setEditandoId(null)}
                    />
                  </td>
                </tr>
              );
            }

            return (
              <tr key={linha.parcelaId} className="border-b last:border-0">
                <td className="px-3 py-1.5">
                  {linha.dataCompra.slice(8, 10)}/{linha.dataCompra.slice(5, 7)}
                </td>
                <td className="px-3 py-1.5">
                  {linha.descricao}
                  {linha.ehReembolso && <span className="ml-2 text-xs text-amber-700">a receber</span>}
                </td>
                <td className="px-3 py-1.5">{deQuem(linha)}</td>
                <td className="px-3 py-1.5 text-neutral-600">{linha.categoriaNome}</td>
                <td className="px-3 py-1.5 text-neutral-600">{rotuloParcela(linha)}</td>
                <td className="px-3 py-1.5 text-right">{formatarBRL(linha.valorCentavos)}</td>
                <td className="px-3 py-1.5">
                  <AcoesLinha
                    linha={linha}
                    competencia={competencia}
                    onEditar={() => setEditandoId(linha.lancamentoId)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
