import { formatarCompetencia, type Competencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import { COLUNA_TOTAL, type LinhaMatriz, type ResumoMes } from '@/domain/totais';

type Membro = { id: string; nome: string; cor: string };

type Props = {
  resumo: ResumoMes;
  competencia: Competencia;
  membros: Membro[];
  nomesDeConta: Record<string, string>;
};

type Linha = {
  chave: string;
  rotulo: string;
  valores: LinhaMatriz;
  cor?: string;
  forte?: boolean;
};

type Banda = {
  titulo: string;
  linhas: Linha[];
};

/**
 * Zero e "nao gastou nada", nao "gastou zero reais" — o travessao apagado
 * marca a diferenca. O `sr-only` existe porque o travessao sozinho, lido por
 * um leitor de tela, tende a virar "traco" em vez de dizer o que a celula
 * significa.
 */
function Celula({ valor }: { valor: number }) {
  if (valor === 0) {
    return (
      <span className="text-tinta-apagada">
        <span aria-hidden="true">—</span>
        <span className="sr-only">zero</span>
      </span>
    );
  }
  return <>{formatarBRL(valor)}</>;
}

/** Faixa vertical da cor do membro, do lado do rotulo da linha. Cor vem do banco. */
function FaixaDeMembro({ cor }: { cor: string }) {
  return <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: cor }} />;
}

/**
 * A matriz de pessoas por conta, em tres bandas: o que foi gasto, o rateio
 * calculado a partir disso, e o resultado calculado a partir dos dois.
 *
 * As mesmas oito linhas de sempre — nenhuma soma, subtracao ou ordenacao de
 * dinheiro acontece aqui. Tudo vem pronto de `resumo`, o `ResumoMes` que a
 * pagina monta com `calcularResumo`; os cartoes acima leem o mesmo objeto,
 * entao os dois so podem divergir se um deles parar de ler daqui.
 */
export function MatrizResumo({ resumo, competencia, membros, nomesDeConta }: Props) {
  const colunas = [...resumo.contas, COLUNA_TOTAL];
  const totalColunas = colunas.length + 1;

  const bandas: Banda[] = [
    {
      titulo: 'Gastos do mês',
      linhas: [
        ...membros.map((membro) => ({
          chave: `pessoal-${membro.id}`,
          rotulo: membro.nome,
          valores: resumo.pessoal[membro.id] ?? {},
          cor: membro.cor,
        })),
        { chave: 'conjunto', rotulo: 'Conjunto', valores: resumo.conjunto },
      ],
    },
    {
      titulo: 'Rateio do conjunto, 50/50',
      linhas: membros.map((membro) => ({
        chave: `metade-${membro.id}`,
        rotulo: `Metade de ${membro.nome}`,
        valores: resumo.metade[membro.id] ?? {},
        cor: membro.cor,
      })),
    },
    {
      titulo: 'Resultado',
      linhas: [
        ...membros.map((membro) => ({
          chave: `total-${membro.id}`,
          rotulo: `Cabe a ${membro.nome}`,
          valores: resumo.totalGeral[membro.id] ?? {},
          cor: membro.cor,
          forte: true,
        })),
        { chave: 'somado', rotulo: 'Somado', valores: resumo.somado, forte: true },
      ],
    },
  ];

  return (
    <div className="overflow-x-auto rounded-caixa border border-borda">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">
          Resumo de {formatarCompetencia(competencia)} por pessoa e por conta, em três blocos: gastos
          do mês, rateio do conjunto e resultado.
        </caption>
        <thead>
          <tr className="border-b border-borda text-xs tracking-wide text-tinta-fraca uppercase">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              {formatarCompetencia(competencia)}
            </th>
            {colunas.map((coluna) => (
              <th
                key={coluna}
                scope="col"
                className={`px-3 py-2 text-right font-medium ${
                  coluna === COLUNA_TOTAL ? 'border-l border-borda-suave' : ''
                }`}
              >
                {coluna === COLUNA_TOTAL ? 'Total' : (nomesDeConta[coluna] ?? coluna)}
              </th>
            ))}
          </tr>
        </thead>
        {bandas.map((banda) => (
          <tbody key={banda.titulo} className="border-b border-borda last:border-0">
            <tr className="bg-superficie-alta">
              <th
                scope="rowgroup"
                colSpan={totalColunas}
                className="px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-tinta-fraca uppercase"
              >
                {banda.titulo}
              </th>
            </tr>
            {banda.linhas.map((linha) => (
              <tr
                key={linha.chave}
                className={`border-b border-borda-suave last:border-0 ${linha.forte ? 'bg-realce' : ''}`}
              >
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    {linha.cor ? <FaixaDeMembro cor={linha.cor} /> : null}
                    <span className={linha.forte ? 'font-semibold text-tinta' : 'text-tinta-fraca'}>
                      {linha.rotulo}
                    </span>
                  </span>
                </th>
                {colunas.map((coluna) => (
                  <td
                    key={coluna}
                    className={`px-3 py-1.5 text-right text-tinta ${linha.forte ? 'font-semibold' : ''} ${
                      coluna === COLUNA_TOTAL ? 'border-l border-borda-suave' : ''
                    }`}
                  >
                    <Celula valor={linha.valores[coluna] ?? 0} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
