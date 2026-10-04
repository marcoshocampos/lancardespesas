import type { Centavos } from './money';
import type { Cota } from './rateio';

/** Chave da coluna que soma todas as contas. */
export const COLUNA_TOTAL = 'TOTAL';

export type ParcelaResumo = {
  contaId: string;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroId?: string;
  valorCentavos: Centavos;
  cotas?: Cota[];
  /** Alguem de fora vai devolver. Entra na fatura, sai do gasto do casal. */
  ehReembolso?: boolean;
};

/** Uma linha da matriz: contaId para valor, mais a coluna COLUNA_TOTAL. */
export type LinhaMatriz = Record<string, Centavos>;

export type ResumoMes = {
  contas: string[];
  pessoal: Record<string, LinhaMatriz>;
  conjunto: LinhaMatriz;
  metade: Record<string, LinhaMatriz>;
  totalGeral: Record<string, LinhaMatriz>;
  /**
   * O que alguem de fora deve devolver, por pessoa. Fica FORA de `pessoal`,
   * `conjunto`, `metade` e `totalGeral`, e DENTRO de `somado`.
   *
   * E o que a regra manda (regras-de-negocio.md, secao 6): o dinheiro saiu da
   * conta, entao esta na fatura; mas nao e gasto do casal, entao nao entra no
   * relatorio. A identidade contabil muda de forma por causa disso:
   * `somado` = soma dos `totalGeral` + soma dos `reembolso`.
   */
  reembolso: Record<string, LinhaMatriz>;
  somado: LinhaMatriz;
};

function linhaZerada(contaIds: string[]): LinhaMatriz {
  const linha: LinhaMatriz = { [COLUNA_TOTAL]: 0 };
  for (const contaId of contaIds) linha[contaId] = 0;
  return linha;
}

function acumular(linha: LinhaMatriz, contaId: string, valor: Centavos): void {
  linha[contaId] = (linha[contaId] ?? 0) + valor;
  linha[COLUNA_TOTAL] = (linha[COLUNA_TOTAL] ?? 0) + valor;
}

/**
 * Matriz de pessoas por contas para uma competencia.
 *
 * As linhas seguem a escada da planilha: TOTAL de cada pessoa, TOTAL do conjunto,
 * METADE, TOTAL GERAL por pessoa e SOMADO. Cada linha e aberta por conta, com uma
 * coluna de total. Para uma conta de cartao, o SOMADO daquela coluna e a fatura.
 *
 * A planilha nao tinha a linha A RECEBER, e por isso nela o SOMADO fechava com a
 * soma dos TOTAL GERAL. Aqui nao fecha quando ha reembolso, e nao deveria: a
 * identidade e `somado = soma dos totalGeral + soma dos reembolso`.
 */
export function calcularResumo(
  parcelas: ParcelaResumo[],
  membroIds: string[],
  contaIds: string[],
): ResumoMes {
  const pessoal: Record<string, LinhaMatriz> = {};
  const metade: Record<string, LinhaMatriz> = {};
  const totalGeral: Record<string, LinhaMatriz> = {};
  const reembolso: Record<string, LinhaMatriz> = {};
  for (const membroId of membroIds) {
    pessoal[membroId] = linhaZerada(contaIds);
    metade[membroId] = linhaZerada(contaIds);
    totalGeral[membroId] = linhaZerada(contaIds);
    reembolso[membroId] = linhaZerada(contaIds);
  }
  const conjunto = linhaZerada(contaIds);
  const somado = linhaZerada(contaIds);
  const contasValidas = new Set(contaIds);

  for (const parcela of parcelas) {
    if (!contasValidas.has(parcela.contaId)) {
      throw new Error(`Conta desconhecida no resumo: ${parcela.contaId}`);
    }
    // Reembolso desvia para a linha propria ANTES de qualquer acumulo de
    // gasto. As validacoes de membro e de rateio continuam valendo: um
    // reembolso mal formado tem que gritar igual, e nao passar por ser
    // reembolso.
    if (parcela.escopo === 'PESSOAL') {
      const membroId = parcela.membroId;
      if (!membroId) throw new Error('Parcela pessoal sem membro');
      const linha = (parcela.ehReembolso ? reembolso : pessoal)[membroId];
      if (!linha) throw new Error(`Membro desconhecido no resumo: ${membroId}`);
      acumular(linha, parcela.contaId, parcela.valorCentavos);
    } else {
      const cotas = parcela.cotas;
      if (!cotas || cotas.length === 0) throw new Error('Parcela de conjunto sem rateio');
      const somaCotas = cotas.reduce((acc, cota) => acc + cota.valorCentavos, 0);
      if (somaCotas !== parcela.valorCentavos) {
        throw new Error('Rateio nao fecha com o valor da parcela');
      }
      // Reembolso de conjunto nao entra em `conjunto` nem em `metade`: essas
      // duas linhas respondem "quanto o casal gastou junto", e isto nao e
      // gasto. A cota de cada um vira o que ele tem a receber.
      if (!parcela.ehReembolso) acumular(conjunto, parcela.contaId, parcela.valorCentavos);
      for (const cota of cotas) {
        const linha = (parcela.ehReembolso ? reembolso : metade)[cota.membroId];
        if (!linha) throw new Error(`Membro desconhecido no rateio: ${cota.membroId}`);
        acumular(linha, parcela.contaId, cota.valorCentavos);
      }
    }
    // A fatura e a fatura: o dinheiro saiu da conta, reembolso ou nao.
    acumular(somado, parcela.contaId, parcela.valorCentavos);
  }

  const colunas = [...contaIds, COLUNA_TOTAL];
  for (const membroId of membroIds) {
    for (const coluna of colunas) {
      const destino = totalGeral[membroId];
      if (!destino) continue;
      destino[coluna] = (pessoal[membroId]?.[coluna] ?? 0) + (metade[membroId]?.[coluna] ?? 0);
    }
  }

  return { contas: [...contaIds], pessoal, conjunto, metade, totalGeral, reembolso, somado };
}
