import { Badge } from '@/components/ui/badge';
import { conferir, type SituacaoConferencia } from '@/domain/conferencia';
import { formatarBRL } from '@/domain/money';
import { COLUNA_TOTAL, type ResumoMes } from '@/domain/totais';

type Membro = { id: string; nome: string; cor: string };
type ContaCartao = { id: string; nome: string };

type Props = {
  resumo: ResumoMes;
  membros: Membro[];
  contasCartao: ContaCartao[];
  valoresReaisPorConta: Record<string, number | null>;
};

const CLASSE_CARTAO = 'rounded-caixa border border-borda bg-superficie px-5 py-4';

/**
 * Texto e cor do selo para cada situacao que `conferir` devolve. `diferenca`
 * so e lido, nunca recalculado — BATE e SEM_EXTRATO nem o usam.
 */
function selo(situacao: SituacaoConferencia, diferenca: number | null): { texto: string; classe: string } {
  switch (situacao) {
    case 'BATE':
      return { texto: 'bate com o extrato', classe: 'bg-positivo-fundo text-positivo' };
    case 'FALTA_LANCAR':
      return {
        texto: `falta lançar ${formatarBRL(diferenca ?? 0)}`,
        classe: 'bg-atencao-fundo text-atencao',
      };
    case 'SOBRA_LANCAMENTO':
      return {
        texto: `${formatarBRL(Math.abs(diferenca ?? 0))} a mais que o extrato`,
        classe: 'bg-atencao-fundo text-atencao',
      };
    case 'SEM_EXTRATO':
      return { texto: 'aguardando o extrato', classe: 'text-tinta-fraca' };
  }
}

function CartaoMembro({ membro, resumo }: { membro: Membro; resumo: ResumoMes }) {
  const total = resumo.totalGeral[membro.id]?.[COLUNA_TOTAL] ?? 0;
  const proprio = resumo.pessoal[membro.id]?.[COLUNA_TOTAL] ?? 0;
  const metade = resumo.metade[membro.id]?.[COLUNA_TOTAL] ?? 0;

  return (
    <div className={CLASSE_CARTAO}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-6 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: membro.cor }}
        />
        <span className="text-sm font-medium text-tinta-fraca">{membro.nome}</span>
      </div>
      <p className="mt-2 text-right text-2xl font-semibold tabular-nums text-tinta">
        {formatarBRL(total)}
      </p>
      <p className="mt-1 text-right text-xs text-tinta-fraca">
        {formatarBRL(proprio)} próprio + {formatarBRL(metade)} da metade
      </p>
    </div>
  );
}

function CartaoFatura({
  conta,
  somado,
  valorReal,
}: {
  conta: ContaCartao;
  somado: number;
  valorReal: number | null;
}) {
  const resultado = conferir(somado, valorReal);
  const { texto, classe } = selo(resultado.situacao, resultado.diferenca);

  return (
    <div className={CLASSE_CARTAO}>
      <span className="text-sm font-medium text-tinta-fraca">Fatura {conta.nome}</span>
      <p className="mt-2 text-right text-2xl font-semibold tabular-nums text-tinta">
        {formatarBRL(somado)}
      </p>
      <div className="mt-1 flex justify-end">
        <Badge variant="secondary" className={classe}>
          {texto}
        </Badge>
      </div>
    </div>
  );
}

/**
 * Os tres numeros que alguem abre o Resumo para ver: o total de cada membro
 * e a fatura de cada conta de cartao, com a situacao contra o extrato.
 *
 * Tudo lido do `ResumoMes` que a pagina ja monta com `calcularResumo`, mais
 * `conferir` do dominio — nao ha soma nem segunda fonte de verdade aqui. Os
 * mesmos numeros aparecem na matriz logo abaixo; se um dia divergirem, o erro
 * esta em como este componente le o resumo, nao em dois calculos diferentes.
 */
export function CartoesResumo({ resumo, membros, contasCartao, valoresReaisPorConta }: Props) {
  return (
    <section aria-label="Totais do mês" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {membros.map((membro) => (
        <CartaoMembro key={membro.id} membro={membro} resumo={resumo} />
      ))}
      {contasCartao.map((conta) => (
        <CartaoFatura
          key={conta.id}
          conta={conta}
          somado={resumo.somado[conta.id] ?? 0}
          valorReal={valoresReaisPorConta[conta.id] ?? null}
        />
      ))}
    </section>
  );
}
