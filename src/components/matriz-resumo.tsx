import { formatarBRL } from '@/domain/money';
import { COLUNA_TOTAL, type ResumoMes } from '@/domain/totais';

type Props = {
  resumo: ResumoMes;
  nomesDeConta: Record<string, string>;
  nomesDeMembro: Record<string, string>;
  membroIds: string[];
};

export function MatrizResumo({ resumo, nomesDeConta, nomesDeMembro, membroIds }: Props) {
  const colunas = [...resumo.contas, COLUNA_TOTAL];

  const linhas: { rotulo: string; valores: Record<string, number>; forte?: boolean }[] = [
    ...membroIds.map((id) => ({
      rotulo: nomesDeMembro[id] ?? id,
      valores: resumo.pessoal[id] ?? {},
    })),
    { rotulo: 'Conjunto', valores: resumo.conjunto },
    ...membroIds.map((id) => ({
      rotulo: `Metade · ${nomesDeMembro[id] ?? id}`,
      valores: resumo.metade[id] ?? {},
    })),
    ...membroIds.map((id) => ({
      rotulo: `${nomesDeMembro[id] ?? id} total`,
      valores: resumo.totalGeral[id] ?? {},
      forte: true,
    })),
    { rotulo: 'Somado', valores: resumo.somado, forte: true },
  ];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-3 py-2 text-left">&nbsp;</th>
            {colunas.map((coluna) => (
              <th key={coluna} className="px-3 py-2 text-right">
                {coluna === COLUNA_TOTAL ? 'Total' : (nomesDeConta[coluna] ?? coluna)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.rotulo} className={`border-b last:border-0 ${linha.forte ? 'font-semibold' : ''}`}>
              <td className="px-3 py-1.5 text-left">{linha.rotulo}</td>
              {colunas.map((coluna) => (
                <td key={coluna} className="px-3 py-1.5 text-right">
                  {formatarBRL(linha.valores[coluna] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
