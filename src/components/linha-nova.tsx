'use client';

import { useRef, useState, useTransition } from 'react';
import { reaisParaCentavos } from '@/domain/money';
import { acaoCriarLancamento } from '@/server/actions/lancamento';

type Membro = { id: string; nome: string; cor: string };
type Categoria = { id: string; nome: string; cor: string };
type Conta = { id: string; nome: string; tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

type Props = {
  contas: Conta[];
  categorias: Categoria[];
  membros: Membro[];
};

export function LinhaNova({ contas, categorias, membros }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const primeiroCampo = useRef<HTMLInputElement>(null);

  function enviar(dados: FormData) {
    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valor') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    const escopo = String(dados.get('escopo'));
    iniciar(async () => {
      try {
        const resultado = await acaoCriarLancamento({
          descricao: String(dados.get('descricao') ?? ''),
          valorCentavos,
          origemValor: 'POR_PARCELA',
          dataCompra: String(dados.get('dataCompra') ?? ''),
          numeroParcelas: Number(dados.get('numeroParcelas') ?? 1),
          escopo: escopo === 'CONJUNTO' ? 'CONJUNTO' : 'PESSOAL',
          contaId: String(dados.get('contaId') ?? ''),
          categoriaId: String(dados.get('categoriaId') ?? ''),
          ...(escopo === 'CONJUNTO' ? {} : { membroId: escopo }),
        });

        if (!resultado.ok) {
          setErro('Esse mês já está fechado. Destrave a fatura para lançar.');
          return;
        }

        primeiroCampo.current?.form?.reset();
        primeiroCampo.current?.focus();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <form action={enviar} className="flex flex-wrap items-center gap-2 border-t bg-neutral-50 p-2">
      <input ref={primeiroCampo} name="dataCompra" type="date" required className="rounded border px-2 py-1 text-sm" />
      <input name="descricao" placeholder="Descrição" required className="min-w-40 flex-1 rounded border px-2 py-1 text-sm" />
      <select name="escopo" required className="rounded border px-2 py-1 text-sm">
        {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        <option value="CONJUNTO">Conjunto</option>
      </select>
      <select name="categoriaId" required className="rounded border px-2 py-1 text-sm">
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <select name="contaId" required className="rounded border px-2 py-1 text-sm">
        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input name="numeroParcelas" type="number" min={1} max={72} defaultValue={1} className="w-16 rounded border px-2 py-1 text-sm" />
      <input name="valor" placeholder="0,00" required inputMode="decimal" className="w-28 rounded border px-2 py-1 text-right text-sm tabular-nums" />
      <button type="submit" disabled={pendente} className="rounded bg-neutral-900 px-3 py-1 text-sm text-white disabled:opacity-50">
        {pendente ? 'Salvando…' : 'Adicionar'}
      </button>
      {erro && <p role="alert" className="w-full text-sm text-red-700">{erro}</p>}
    </form>
  );
}
