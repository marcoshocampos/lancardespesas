import type { Centavos } from './money';

export type SituacaoConferencia = 'SEM_EXTRATO' | 'BATE' | 'FALTA_LANCAR' | 'SOBRA_LANCAMENTO';

export type Conferencia = {
  somado: Centavos;
  real: Centavos | null;
  diferenca: Centavos | null;
  situacao: SituacaoConferencia;
};

/** Compara o que o sistema somou com o valor real do extrato. */
export function conferir(somado: Centavos, real: Centavos | null): Conferencia {
  if (real === null) {
    return { somado, real: null, diferenca: null, situacao: 'SEM_EXTRATO' };
  }

  const diferenca = real - somado;
  const situacao: SituacaoConferencia =
    diferenca === 0 ? 'BATE' : diferenca > 0 ? 'FALTA_LANCAR' : 'SOBRA_LANCAMENTO';

  return { somado, real, diferenca, situacao };
}
