'use client';

import { useState, useTransition } from 'react';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoEditarLancamento } from '@/server/actions/lancamento';
import type { LinhaGrade } from '@/server/repositorios/resumo';

type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = { id: string; nome: string; tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

type Props = {
  linha: LinhaGrade;
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
  onCancelar: () => void;
  onSalvo: () => void;
};

type EstadoAtual = { descricao: string; valorCentavos: number };

// `atual` chega tipado `unknown` (ResultadoGravacao) porque e o registro cru do
// Prisma na hora do conflito. Sem `as`: so aceitamos o formato se as chaves que
// vamos exibir realmente baterem, e ignoramos silenciosamente caso contrario —
// a mensagem de conflito continua aparecendo mesmo sem o detalhe extra.
function extrairAtual(atual: unknown): EstadoAtual | null {
  if (
    atual !== null &&
    typeof atual === 'object' &&
    'descricao' in atual &&
    'valorCentavos' in atual &&
    typeof atual.descricao === 'string' &&
    typeof atual.valorCentavos === 'number'
  ) {
    return { descricao: atual.descricao, valorCentavos: atual.valorCentavos };
  }
  return null;
}

/**
 * Formulario de edicao de um lancamento, aberto no lugar da linha da grade.
 *
 * Espelha `LinhaNova`: FormData + `useTransition`, valor em `reaisParaCentavos`.
 * Duas diferencas por causa do que esta em jogo aqui — o lançamento inteiro, não
 * uma linha nova em branco:
 *
 * - Em caso de recusa (CONFLITO ou FATURA_TRAVADA), o formulario NUNCA reseta.
 *   E' `linha-nova.tsx` reseta so no sucesso; aqui alem disso os campos usam
 *   `defaultValue` (nao controlados), entao um re-render vindo do
 *   `revalidatePath` do proprio server action nao apaga o que a pessoa digitou.
 * - `origemValor` viaja escondido, igual ao valor que ja estava gravado — o
 *   formulario nao da a opcao de troca-lo (LinhaNova tambem nao da).
 */
export function LinhaEdicao({ linha, contas, categorias, membros, onCancelar, onSalvo }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<EstadoAtual | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar(dados: FormData) {
    setErro(null);
    setConflito(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valor') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    const escopo = String(dados.get('escopo'));
    const numeroParcelas = Number(dados.get('numeroParcelas') ?? 1);

    // O lancamento ja tem mais de uma parcela: editar QUALQUER campo regera
    // todas elas (`gravarFilhos` recria do zero, sem opcao de meio-termo).
    // Avisa antes de mandar pro servidor, nao depois.
    if (linha.numeroParcelas > 1) {
      const confirmar = window.confirm(
        `Editar "${linha.descricao}" regera as ${linha.numeroParcelas} parcelas deste lançamento. Continuar?`,
      );
      if (!confirmar) return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoEditarLancamento(linha.lancamentoId, linha.versao, {
          descricao: String(dados.get('descricao') ?? ''),
          valorCentavos,
          origemValor: linha.origemValor,
          dataCompra: String(dados.get('dataCompra') ?? ''),
          numeroParcelas,
          escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
          contaId: String(dados.get('contaId') ?? ''),
          categoriaId: String(dados.get('categoriaId') ?? ''),
          ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
        });

        if (!resultado.ok) {
          if (resultado.motivo === 'FATURA_TRAVADA') {
            setErro('Esse mês já está fechado. Destrave a fatura para editar.');
          } else {
            setErro(
              'Alguém salvou uma mudança nesse lançamento enquanto você editava. ' +
                'Confira o estado atual abaixo e tente de novo.',
            );
            setConflito(extrairAtual(resultado.atual));
          }
          return;
        }

        onSalvo();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 bg-neutral-50 p-2">
      <input
        name="dataCompra"
        type="date"
        required
        defaultValue={linha.dataCompra}
        className="rounded border px-2 py-1 text-sm"
      />
      <input
        name="descricao"
        placeholder="Descrição"
        required
        defaultValue={linha.descricao}
        className="min-w-40 flex-1 rounded border px-2 py-1 text-sm"
      />
      <select
        name="escopo"
        required
        defaultValue={linha.escopo === 'CONJUNTO' ? 'CONJUNTO' : (linha.membroId ?? '')}
        className="rounded border px-2 py-1 text-sm"
      >
        {membros.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
        <option value="CONJUNTO">Conjunto</option>
      </select>
      <select
        name="categoriaId"
        required
        defaultValue={linha.categoriaId}
        className="rounded border px-2 py-1 text-sm"
      >
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <select
        name="contaId"
        required
        defaultValue={linha.contaId}
        className="rounded border px-2 py-1 text-sm"
      >
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <input
        name="numeroParcelas"
        type="number"
        min={1}
        max={72}
        defaultValue={linha.numeroParcelas}
        className="w-16 rounded border px-2 py-1 text-sm"
      />
      <input
        name="valor"
        placeholder="0,00"
        required
        inputMode="decimal"
        defaultValue={formatarBRL(linha.lancamentoValorCentavos).replace('R$ ', '')}
        className="w-28 rounded border px-2 py-1 text-right text-sm tabular-nums"
      />
      <button
        type="submit"
        disabled={pendente}
        className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {pendente ? 'Salvando…' : 'Salvar'}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        disabled={pendente}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Cancelar
      </button>
      {erro && (
        <p role="alert" className="w-full text-sm text-red-700">
          {erro}
        </p>
      )}
      {conflito && (
        <p className="w-full text-sm text-neutral-600">
          Estado atual gravado: <strong>{conflito.descricao}</strong>,{' '}
          {formatarBRL(conflito.valorCentavos)}.
        </p>
      )}
    </form>
  );
}
