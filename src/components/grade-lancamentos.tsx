import { formatarBRL } from '@/domain/money';
import type { LinhaGrade } from '@/server/repositorios/resumo';

const CABECALHOS = ['Data', 'Descrição', 'De quem', 'Categoria', 'Parc.', 'Valor'];

function rotuloParcela(linha: LinhaGrade): string {
  return linha.numeroParcelas > 1 ? `${linha.numero}/${linha.numeroParcelas}` : '—';
}

function deQuem(linha: LinhaGrade): string {
  return linha.escopo === 'CONJUNTO' ? 'Conjunto' : (linha.membroNome ?? '—');
}

export function GradeLancamentos({ linhas }: { linhas: LinhaGrade[] }) {
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
              <th key={c} className={c === 'Valor' ? 'px-3 py-2 text-right' : 'px-3 py-2 text-left'}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.parcelaId} className="border-b last:border-0">
              <td className="px-3 py-1.5">{linha.dataCompra.slice(8, 10)}/{linha.dataCompra.slice(5, 7)}</td>
              <td className="px-3 py-1.5">
                {linha.descricao}
                {linha.ehReembolso && <span className="ml-2 text-xs text-amber-700">a receber</span>}
              </td>
              <td className="px-3 py-1.5">{deQuem(linha)}</td>
              <td className="px-3 py-1.5 text-neutral-600">{linha.categoriaNome}</td>
              <td className="px-3 py-1.5 text-neutral-600">{rotuloParcela(linha)}</td>
              <td className="px-3 py-1.5 text-right">{formatarBRL(linha.valorCentavos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
