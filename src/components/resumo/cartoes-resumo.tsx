import { SeloConferencia } from '@/components/resumo/selo-conferencia';
import { conferir } from '@/domain/conferencia';
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
 * Por que o nome do membro e o "Fatura X" sao `span`, e nao heading.
 *
 * Foi avaliado na Etapa 07 e recusado. Nenhum nivel serve:
 *
 * - `h2` poria "Nardy", "Nick" e "Fatura Nubank" no mesmo degrau do `h2` que
 *   a faixa de conferencia ja usa para "Nubank" — o mesmo cartao apareceria
 *   duas vezes no sumario, e tres numeros soltos virariam secoes da pagina ao
 *   lado da matriz e da conferencia, que sao secoes de verdade.
 * - `h3` pularia nivel: acima destes cartoes nao ha `h2` nenhum. O que nomeia
 *   o grupo e o `aria-label` da `section` logo abaixo, e troca-lo por um
 *   heading `sr-only` seria redesenhar como a secao se apresenta, nao acabar
 *   o que ela ja e.
 *
 * E nao ha o que ganhar. A `section` com `aria-label` ja e um landmark
 * `region`, entao o grupo se alcanca pelo rotor sem heading nenhum. E o que
 * esta no cartao nao e uma secao de conteudo, e um rotulo grudado num numero:
 * como `span`, o cartao inteiro e lido de uma vez — "Nardy, R$ 551,26,
 * R$ 539,34 proprio mais R$ 474,25 da metade". Como heading, a navegacao por
 * H entrega "Nardy" e deixa o numero para tras.
 */
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

  return (
    <div className={CLASSE_CARTAO}>
      <span className="text-sm font-medium text-tinta-fraca">Fatura {conta.nome}</span>
      <p className="mt-2 text-right text-2xl font-semibold tabular-nums text-tinta">
        {formatarBRL(somado)}
      </p>
      <div className="mt-1 flex justify-end">
        <SeloConferencia situacao={resultado.situacao} diferenca={resultado.diferenca} />
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
