import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { formatarCompetencia } from '@/domain/competencia';
import { rotuloDaFaixa } from '@/domain/divisao';
import { formatarBRL } from '@/domain/money';
import type { ItemDaBusca, ResultadoDaBusca } from '@/server/repositorios/busca';

/** Em que meses o lancamento aparece, no formato da Lixeira. */
function faixaDeMeses(item: ItemDaBusca): string | null {
  if (!item.primeiraCompetencia || !item.ultimaCompetencia) return null;
  const primeiro = formatarCompetencia(item.primeiraCompetencia);
  if (item.primeiraCompetencia === item.ultimaCompetencia) return primeiro;
  return `${primeiro} a ${formatarCompetencia(item.ultimaCompetencia)}`;
}

/** "2026-11-05" vira "05/11/2026". A data vem sem fuso; nada de `Date` aqui. */
function dataCurta(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/**
 * Os resultados da busca, no lugar da grade do mes. Um item por LANCAMENTO,
 * como a Lixeira: parcelado e uma linha, com a faixa de meses, e nao doze.
 *
 * O cabecalho diz "em todos os meses" porque a faixa de totais logo acima e do
 * mes aberto — sem o aviso, ela pareceria descrever estes resultados.
 */
export function ResultadosBusca({ resultado, termo }: { resultado: ResultadoDaBusca; termo: string }) {
  if (resultado.total === 0) {
    return (
      <div className="mt-4 rounded-caixa border border-borda bg-superficie px-6 py-10 text-center">
        <p className="text-sm text-tinta">Nada encontrado para “{termo}”.</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-tinta-fraca">
          A busca olha a descrição e o nome do terceiro, ou o valor exato, em todos os meses. O que
          está na lixeira fica de fora.
        </p>
      </div>
    );
  }

  const cortado = resultado.total > resultado.itens.length;

  return (
    <section aria-labelledby="titulo-resultados" className="mt-4">
      <h2 id="titulo-resultados" className="text-sm text-tinta-fraca">
        {cortado
          ? `Mostrando os ${resultado.itens.length} mais recentes de ${resultado.total} lançamentos, em todos os meses. Use um termo mais específico para ver os outros.`
          : `${resultado.total} ${resultado.total === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'} em todos os meses`}
      </h2>
      <ul className="mt-2 divide-y divide-borda-suave overflow-hidden rounded-caixa border border-borda bg-superficie">
        {resultado.itens.map((item) => (
          <ItemResultado key={item.lancamentoId} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ItemResultado({ item }: { item: ItemDaBusca }) {
  const meses = faixaDeMeses(item);
  const dono = item.escopo === 'CONJUNTO' ? 'Conjunto' : (item.membroNome ?? 'sem pessoa');

  const corpo = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm text-tinta">
          <span className="truncate">{item.descricao}</span>
          {item.ehReembolso && (
            <Badge variant="secondary" className="bg-atencao-fundo text-atencao">
              {item.devedorNome ? `a receber de ${item.devedorNome}` : 'a receber'}
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-xs text-tinta-fraca">
          {dataCurta(item.dataCompra)} · {dono} · {item.categoriaNome} · {item.contaNome}
          {meses && <> · {meses}</>}
        </p>
      </div>
      <p className="text-sm text-tinta tabular-nums">
        {formatarBRL(item.totalCentavos)}
        {(() => {
          const rotulo =
            rotuloDaFaixa(item.faixa, item.numeroParcelas) ??
            (item.numeroParcelas > 1 ? `em ${item.numeroParcelas}x` : null);
          return rotulo && <span className="ml-1 text-xs text-tinta-fraca">{rotulo}</span>;
        })()}
      </p>
    </div>
  );

  if (!item.competenciaDestino) {
    return (
      <li className="px-4 py-3">
        {corpo}
        <p className="mt-1 text-xs text-tinta-apagada">
          Todas as parcelas foram canceladas: o lançamento não aparece em nenhum mês.
        </p>
      </li>
    );
  }

  // Sem `conta` no link, de proposito: um filtro ligado antes esconderia a linha.
  return (
    <li>
      <Link
        href={`/despesas?competencia=${item.competenciaDestino}&destaque=${item.lancamentoId}`}
        className="block px-4 py-3 outline-none hover:bg-realce focus-visible:bg-realce focus-visible:ring-3 focus-visible:ring-acento/50 focus-visible:ring-inset"
      >
        {corpo}
      </Link>
    </li>
  );
}
