import { avancarCompetencia, competenciaDeCartao, type Competencia } from './competencia';
import { diaClampeado, type DataISO } from './data';

/** O que da conta decide em que data a recorrente cai. */
export type ContaDaRecorrente = {
  tipo: 'CARTAO' | 'EXTERNA';
  diaFechamento: number | null;
};

function montarData(competencia: Competencia, dia: number): DataISO {
  const [ano, mes] = competencia.split('-').map(Number);
  if (!ano || !mes) throw new Error(`Competencia invalida: ${competencia}`);
  const diaEfetivo = diaClampeado(ano, mes, dia);
  return `${competencia}-${String(diaEfetivo).padStart(2, '0')}`;
}

/**
 * A data de compra do lancamento que uma recorrente gera para uma competencia.
 *
 * E a regra do cartao lida ao contrario. `competenciaDeCartao` responde "esta
 * compra cai em que fatura?"; aqui a fatura e dada, e a pergunta e "em que dia
 * a cobranca aconteceu para cair nela?". Cobranca no dia 15, num cartao que
 * fecha dia 4, pertence a fatura do mes SEGUINTE — entao a recorrente de
 * dezembro e datada de 15 de novembro, igual ao extrato.
 *
 * **O resultado e conferido pela propria `competenciaDeCartao` antes de sair
 * daqui, e isso nao e zelo.** Editar um lancamento recalcula a competencia a
 * partir da data (`editarLancamento` nao guarda competencia manual). Uma data
 * que nao reproduz a competencia faria o lancamento MUDAR DE MES sozinho na
 * primeira edicao — corrigir o valor da assinatura de dezembro a jogaria para
 * novembro.
 *
 * O caso em que a conta ingenua falha existe: dia 31, fechamento dia 30,
 * competencia de marco. A cobranca cairia em fevereiro, que nao tem dia 31; o
 * dia vira 28, o fechamento de fevereiro tambem vira 28, e 28 <= 28 poe a
 * compra na fatura de FEVEREIRO. Ai vale o dia 1 do mes da competencia, que
 * cai nela com qualquer fechamento. A recorrente gera uma por competencia,
 * sempre — o calendario real, nesse canto, cobraria duas em fevereiro e
 * nenhuma em marco, e ninguem quer reproduzir isso.
 */
export function dataDaRecorrente(
  competencia: Competencia,
  diaDoMes: number,
  conta: ContaDaRecorrente,
): DataISO {
  if (!Number.isInteger(diaDoMes) || diaDoMes < 1 || diaDoMes > 31) {
    throw new Error(`Dia da recorrente invalido: ${diaDoMes}`);
  }

  // Conta externa nao tem fatura: a competencia e o mes do proprio pagamento.
  if (conta.tipo === 'EXTERNA') return montarData(competencia, diaDoMes);

  const fechamento = conta.diaFechamento;
  if (fechamento === null) throw new Error('Conta de cartao sem dia de fechamento');

  const candidata =
    diaDoMes <= fechamento
      ? montarData(competencia, diaDoMes)
      : montarData(avancarCompetencia(competencia, -1), diaDoMes);

  if (competenciaDeCartao(candidata, fechamento) === competencia) return candidata;

  // Dia 1 <= qualquer fechamento valido, entao sempre cai na propria competencia.
  return montarData(competencia, 1);
}

/** O minimo que a triagem de pendencia precisa saber de uma recorrente. */
export type RecorrenteParaTriagem = {
  id: string;
  ativa: boolean;
  competenciaInicio: Competencia;
  contaId: string;
};

/**
 * Quais recorrentes ainda faltam lancar numa competencia.
 *
 * Fica de fora a que:
 * - esta desativada;
 * - so comeca depois desta competencia;
 * - ja gerou lancamento para ela — **mesmo que o lancamento esteja na
 *   lixeira**. Excluir o lancamento gerado e o jeito de pular um mes, e o
 *   sistema tem que lembrar que aquele mes ja foi tratado;
 * - pertence a uma conta com fatura travada nesta competencia. Oferecer o
 *   clique para o servidor recusar seria pior que nao oferecer.
 */
export function recorrentesPendentes<T extends RecorrenteParaTriagem>(
  recorrentes: T[],
  competencia: Competencia,
  jaGeradas: ReadonlySet<string>,
  contasTravadas: ReadonlySet<string>,
): T[] {
  return recorrentes.filter(
    (r) =>
      r.ativa &&
      r.competenciaInicio <= competencia &&
      !jaGeradas.has(r.id) &&
      !contasTravadas.has(r.contaId),
  );
}
