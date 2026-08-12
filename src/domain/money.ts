/** Dinheiro sempre em centavos, inteiro. Nunca use float para valor. */
export type Centavos = number;

const NAO_NUMERICO = /[^\d,-]/g;

/** Converte texto no formato brasileiro ("474,25", "R$ 65", "-100,00") em centavos. */
export function reaisParaCentavos(texto: string): Centavos {
  const limpo = texto.trim().replace(NAO_NUMERICO, '');
  if (limpo === '' || limpo === '-') throw new Error(`Valor invalido: ${texto}`);

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;
  const [inteira = '', decimal = ''] = semSinal.split(',');

  if (inteira === '' || !/^\d+$/.test(inteira)) throw new Error(`Valor invalido: ${texto}`);
  if (decimal !== '' && !/^\d{1,2}$/.test(decimal)) throw new Error(`Valor invalido: ${texto}`);

  const centavos = Number(inteira) * 100 + Number(decimal.padEnd(2, '0'));
  return negativo ? -centavos : centavos;
}

/** Formata centavos como moeda brasileira: 102551 vira "R$ 1.025,51". */
export function formatarBRL(valor: Centavos): string {
  const negativo = valor < 0;
  const absoluto = Math.abs(valor);
  const inteira = Math.trunc(absoluto / 100).toLocaleString('pt-BR');
  const decimal = String(absoluto % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}R$ ${inteira},${decimal}`;
}
