import { Badge } from '@/components/ui/badge';
import type { SituacaoConferencia } from '@/domain/conferencia';
import { formatarBRL } from '@/domain/money';

/**
 * Texto e cor do selo para cada situacao que `conferir` devolve. `diferenca`
 * so e lido, nunca recalculado — BATE e SEM_EXTRATO nem o usam.
 *
 * As quatro trazem fundo E tinta, e e isso que as deixa com a mesma FORMA.
 * Quem sobrar sem fundo herda o `bg-superficie-alta` do `variant="secondary"`,
 * que em cima do cartao some — era o caso de SEM_EXTRATO, e o selo parecia
 * texto solto ao lado de tres pilulas. O `cn` resolve o conflito em favor da
 * classe daqui, entao quem manda na cor de qualquer selo e esta tabela, nao a
 * variante.
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
    // `realce` e o cinza de destaque da casa — o mesmo do hover e do campo
    // desabilitado. Neutro de proposito: enquanto o extrato nao chega nao ha
    // nem o que comemorar nem do que se preocupar. E pesa contra o cartao o
    // mesmo que os outros tres: 1,117:1 sobre `superficie`, entre o
    // `positivo-fundo` (1,137) e o `atencao-fundo` (1,113). O
    // `superficie-alta` que a variante dava pesava 1,043 — dai o selo sumir.
    // `tinta-fraca` sobre `realce` da 5,03:1, acima do 4,5:1 que `text-xs` pede.
    case 'SEM_EXTRATO':
      return { texto: 'aguardando o extrato', classe: 'bg-realce text-tinta-fraca' };
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
