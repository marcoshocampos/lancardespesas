import { Badge } from '@/components/ui/badge';
import type { SituacaoConferencia } from '@/domain/conferencia';
import { formatarBRL } from '@/domain/money';

/**
 * Texto e cor do selo para cada situacao que `conferir` devolve. `diferenca`
 * so e lido, nunca recalculado — BATE e SEM_EXTRATO nem o usam.
 */
function selo(
  situacao: SituacaoConferencia,
  diferenca: number | null,
): { texto: string; classe: string } {
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

/**
 * A situacao da fatura contra o extrato, com o mesmo texto e a mesma cor em
 * todo lugar onde ela aparece.
 *
 * Ela aparece duas vezes no Resumo de proposito: no cartao, que responde de
 * longe, e na faixa de conferencia, ao lado do campo onde se digita o extrato.
 * Duas copias da tabela de situacoes e como elas passam a discordar — por isso
 * o texto, a classe e o proprio `Badge` moram aqui, e nao em cada um dos dois.
 */
export function SeloConferencia({
  situacao,
  diferenca,
}: {
  situacao: SituacaoConferencia;
  diferenca: number | null;
}) {
  const { texto, classe } = selo(situacao, diferenca);

  return (
    <Badge variant="secondary" className={classe}>
      {texto}
    </Badge>
  );
}
