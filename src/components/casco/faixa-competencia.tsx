import Link from 'next/link';
import { avancarCompetencia, formatarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';

type TotalDeMembro = { membroId: string; nome: string; cor: string; centavos: number };
type TotalDeFatura = { contaId: string; nome: string; centavos: number };

type Props = {
  competencia: string;
  rota: '/despesas' | '/resumo';
  conta?: string | undefined;
  totais?: { membros: TotalDeMembro[]; faturas: TotalDeFatura[] } | undefined;
  filtroAtivo?: boolean;
};

const CLASSE_SETA =
  'flex size-7 shrink-0 items-center justify-center rounded-campo border border-borda text-tinta-fraca transition-colors hover:bg-realce hover:text-tinta';

/**
 * Faixa de competencia: o mes atual em tipo grande, com setas para o mes
 * anterior e o seguinte, e — quando `totais` vier — os totais do mes por
 * membro e por fatura de cartao, calculados pelo mesmo `calcularResumo` que
 * a tela de Resumo usa.
 *
 * Componente de servidor, sem estado: `searchParams` so existe na pagina, e
 * e ela quem repassa competencia, conta e totais por prop — o layout do
 * grupo de rota nao recebe `searchParams`. As setas usam `next/link`, nao
 * `<a>`, porque a faixa vive dentro do casco persistente: um `<a>` cru
 * recarregaria o documento inteiro a cada troca de mes, remontando a barra
 * lateral e relendo a sessao.
 */
export function FaixaCompetencia({ competencia, rota, conta, totais, filtroAtivo }: Props) {
  const sufixoConta = conta ? `&conta=${conta}` : '';
  const anterior = avancarCompetencia(competencia, -1);
  const proxima = avancarCompetencia(competencia, 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-caixa border border-borda bg-superficie px-5 py-4">
      <nav aria-label="Navegação de mês" className="flex items-center gap-3">
        <Link href={`${rota}?competencia=${anterior}${sufixoConta}`} className={CLASSE_SETA}>
          <span aria-hidden="true">‹</span>
          <span className="sr-only">Ir para {formatarCompetencia(anterior)}</span>
        </Link>
        <span className="text-lg font-semibold text-tinta">{formatarCompetencia(competencia)}</span>
        <Link href={`${rota}?competencia=${proxima}${sufixoConta}`} className={CLASSE_SETA}>
          <span aria-hidden="true">›</span>
          <span className="sr-only">Ir para {formatarCompetencia(proxima)}</span>
        </Link>
      </nav>

      {totais ? (
        <div className="flex flex-col items-end gap-1.5">
          {filtroAtivo ? (
            <p className="text-xs text-tinta-fraca">Totais do mês inteiro, não do filtro.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-5">
            {totais.membros.map((membro) => (
              <div key={membro.membroId} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: membro.cor }}
                />
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-tinta-fraca">{membro.nome}</div>
                  <div className="text-sm font-semibold tabular-nums text-tinta">
                    {formatarBRL(membro.centavos)}
                  </div>
                </div>
              </div>
            ))}
            {totais.faturas.map((fatura) => (
              <div key={fatura.contaId} className="text-right">
                <div className="text-xs uppercase tracking-wide text-tinta-fraca">
                  Fatura {fatura.nome}
                </div>
                <div className="text-sm font-semibold tabular-nums text-tinta">
                  {formatarBRL(fatura.centavos)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
