import type { Centavos } from './money';

export type ItemAgrupavel = { chave: string; valorCentavos: Centavos };

export type Grupo<T> = {
  chave: string;
  itens: T[];
  subtotalCentavos: Centavos;
  quantidade: number;
};

/**
 * Agrupa itens por chave, somando subtotais e contando quantidades.
 *
 * Devolve os grupos na ordem de `ordemDasChaves`, incluindo grupos vazios com
 * subtotal zero. Lanca erro se encontrar um item com chave desconhecida, ou se
 * `ordemDasChaves` tiver uma chave repetida, para evitar descartar ou duplicar
 * dados em silencio — exatamente o tipo de bug que esta base ja pagou caro.
 */
export function agrupar<T extends ItemAgrupavel>(
  itens: readonly T[],
  ordemDasChaves: readonly string[],
): Grupo<T>[] {
  const acumuladores = new Map<string, { itens: T[]; subtotalCentavos: Centavos }>();

  for (const chave of ordemDasChaves) {
    // Chave repetida faria o passo final abaixo buscar a mesma entrada do Map
    // duas vezes e devolver o grupo duplicado, com o subtotal contado em dobro
    // sem lancar nada — a soma dos subtotais deixaria de fechar com o total dos
    // itens sem ninguem perceber. E erro de quem chama, entao lanca aqui, pelo
    // mesmo motivo que uma chave desconhecida abaixo tambem lanca.
    if (acumuladores.has(chave)) {
      throw new Error(`Chave repetida em ordemDasChaves: ${chave}`);
    }
    acumuladores.set(chave, { itens: [], subtotalCentavos: 0 });
  }

  for (const item of itens) {
    const acumulador = acumuladores.get(item.chave);
    if (!acumulador) {
      throw new Error(`Chave desconhecida em agrupamento: ${item.chave}`);
    }
    acumulador.itens.push(item);
    acumulador.subtotalCentavos += item.valorCentavos;
  }

  // A ordem da saida segue ordemDasChaves, nao a ordem de chegada dos itens:
  // e o parametro que decide em que coluna cada grupo aparece na tela. Grupos
  // sem nenhum item ainda entram, com subtotal zero, porque a tela espera uma
  // coluna por chave e nao so as que tiveram lancamento no mes.
  return ordemDasChaves.map((chave) => {
    const acumulador = acumuladores.get(chave);
    // A validacao de chave repetida acima garante exatamente uma entrada por
    // chave de ordemDasChaves; nao achar aqui seria bug interno desta funcao,
    // nao dado invalido de quem chama.
    if (!acumulador) {
      throw new Error(`Falha interna: acumulador ausente para chave ${chave}`);
    }
    return {
      chave,
      itens: acumulador.itens,
      subtotalCentavos: acumulador.subtotalCentavos,
      quantidade: acumulador.itens.length,
    };
  });
}
