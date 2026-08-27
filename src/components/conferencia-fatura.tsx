'use client';

import { useState, useTransition } from 'react';
import { conferir } from '@/domain/conferencia';
import { formatarBRL, reaisParaCentavos } from '@/domain/money';
import { acaoRegistrarValorReal } from '@/server/actions/fatura';

type Props = {
  contaId: string;
  competencia: string;
  nome: string;
  somado: number;
  valorReal: number | null;
};

// O brief da Tarefa 13 (Passo 6) so desenha o texto da situacao, lendo `valoresReais[c.id]`
// sem mostrar de onde esse valor viria. Sem um formulario, a unica forma de preencher o
// extrato seria mexer direto no banco — contradiz a propria descricao da tarefa ("a pessoa
// digita o valor que veio no extrato"). Este componente acrescenta o campo que falta,
// reaproveitando o padrao de `LinhaNova` (useTransition + FormData + reaisParaCentavos).
export function ConferenciaFatura({ contaId, competencia, nome, somado, valorReal }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const resultado = conferir(somado, valorReal);

  function enviar(dados: FormData) {
    setErro(null);

    let valorCentavos: number;
    try {
      valorCentavos = reaisParaCentavos(String(dados.get('valorReal') ?? ''));
    } catch {
      setErro('Valor inválido. Use o formato 1.234,56.');
      return;
    }

    iniciar(async () => {
      try {
        const resultado = await acaoRegistrarValorReal({ contaId, competencia, valorCentavos });
        if (!resultado.ok) {
          setErro('Essa fatura está travada. Destrave para registrar um novo valor do extrato.');
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <strong>{nome}</strong>
      <span>
        {resultado.situacao === 'SEM_EXTRATO' && 'aguardando o valor do extrato.'}
        {resultado.situacao === 'BATE' && 'bate com o extrato.'}
        {resultado.situacao === 'FALTA_LANCAR' &&
          `falta lançar ${formatarBRL(resultado.diferenca ?? 0)}.`}
        {resultado.situacao === 'SOBRA_LANCAMENTO' &&
          `tem ${formatarBRL(Math.abs(resultado.diferenca ?? 0))} a mais que o extrato.`}
      </span>
      <form action={enviar} className="flex items-center gap-2">
        <input
          key={valorReal ?? 'vazio'}
          name="valorReal"
          placeholder="Valor do extrato"
          defaultValue={valorReal !== null ? formatarBRL(valorReal).replace('R$ ', '') : ''}
          inputMode="decimal"
          className="w-28 rounded border px-2 py-1 text-right text-sm tabular-nums"
        />
        <button
          type="submit"
          disabled={pendente}
          className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          {pendente ? 'Salvando…' : 'Conferir'}
        </button>
      </form>
      {erro && (
        <p role="alert" className="w-full text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
