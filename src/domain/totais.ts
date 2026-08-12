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
};

/** Uma linha da matriz: contaId para valor, mais a coluna COLUNA_TOTAL. */
export type LinhaMatriz = Record<string, Centavos>;

export type ResumoMes = {
  contas: string[];
  pessoal: Record<string, LinhaMatriz>;
  conjunto: LinhaMatriz;
  metade: Record<string, LinhaMatriz>;
  totalGeral: Record<string, LinhaMatriz>;
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
 */
export function calcularResumo(
  parcelas: ParcelaResumo[],
  membroIds: string[],
  contaIds: string[],
): ResumoMes {
  const pessoal: Record<string, LinhaMatriz> = {};
  const metade: Record<string, LinhaMatriz> = {};
  const totalGeral: Record<string, LinhaMatriz> = {};
  for (const membroId of membroIds) {
    pessoal[membroId] = linhaZerada(contaIds);
    metade[membroId] = linhaZerada(contaIds);
    totalGeral[membroId] = linhaZerada(contaIds);
  }
  const conjunto = linhaZerada(contaIds);
  const somado = linhaZerada(contaIds);

  for (const parcela of parcelas) {
    if (parcela.escopo === 'PESSOAL') {
      const membroId = parcela.membroId;
      if (!membroId) throw new Error('Parcela pessoal sem membro');
      const linha = pessoal[membroId];
      if (!linha) throw new Error(`Membro desconhecido no resumo: ${membroId}`);
      acumular(linha, parcela.contaId, parcela.valorCentavos);
    } else {
      const cotas = parcela.cotas;
      if (!cotas || cotas.length === 0) throw new Error('Parcela de conjunto sem rateio');
      acumular(conjunto, parcela.contaId, parcela.valorCentavos);
      for (const cota of cotas) {
        const linha = metade[cota.membroId];
        if (!linha) throw new Error(`Membro desconhecido no rateio: ${cota.membroId}`);
        acumular(linha, parcela.contaId, cota.valorCentavos);
      }
    }
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

  return { contas: [...contaIds], pessoal, conjunto, metade, totalGeral, somado };
}
