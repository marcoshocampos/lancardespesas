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
 * subtotal zero. Lanca erro se encontrar um item com chave desconhecida, para
 * evitar descartar dados em silencio — exatamente o tipo de bug que esta base
 * ja pagou caro.
 */
export function agrupar<T extends ItemAgrupavel>(
  itens: readonly T[],
  ordemDasChaves: readonly string[],
): Grupo<T>[] {
  // Mapa das chaves para acumuladores (itens e subtotal).
  const acumuladores = new Map<string, { itens: T[]; subtotalCentavos: Centavos }>();

  // Inicializa um acumulador para cada chave na ordem.
  for (const chave of ordemDasChaves) {
    acumuladores.set(chave, { itens: [], subtotalCentavos: 0 });
  }

  // Percorre os itens e acumula em cada grupo.
  for (const item of itens) {
    const acumulador = acumuladores.get(item.chave);
    if (!acumulador) {
      throw new Error(`Chave desconhecida em agrupamento: ${item.chave}`);
    }
    acumulador.itens.push(item);
    acumulador.subtotalCentavos += item.valorCentavos;
  }

  // Constroi os grupos na ordem de ordemDasChaves.
  return ordemDasChaves.map((chave) => {
    const acumulador = acumuladores.get(chave)!;
    return {
      chave,
      itens: acumulador.itens,
      subtotalCentavos: acumulador.subtotalCentavos,
      quantidade: acumulador.itens.length,
    };
  });
}
