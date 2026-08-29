/** Dinheiro sempre em centavos, inteiro. Nunca use float para valor. */
export type Centavos = number;

const FORA_DO_FORMATO = /[^\d,.-]/g;

/**
 * Converte texto no formato brasileiro ("474,25", "R$ 65", "-100,00") em centavos.
 *
 * A virgula, quando presente, e sempre o decimal — e os pontos, se houver, sao
 * separador de milhar ("474,25"). Sem virgula, um ponto e ambiguo ("1.234" e mil
 * duzentos e trinta e quatro, ou um e vinte e tres?) e por isso e recusado em vez de
 * adivinhado: um ponto de decimal digitado por habito (teclado numerico, valor colado
 * de extrato) nao pode virar silenciosamente um valor 100x maior.
 */
export function reaisParaCentavos(texto: string): Centavos {
  const limpo = texto.trim().replace(FORA_DO_FORMATO, '');
  if (limpo === '' || limpo === '-') throw new Error(`Valor invalido: ${texto}`);

  const negativo = limpo.startsWith('-');
  const semSinal = negativo ? limpo.slice(1) : limpo;

  const partes = semSinal.split(',');
  if (partes.length > 2) throw new Error(`Valor invalido: ${texto}`);
  const [bruto = '', decimal = ''] = partes;

  let inteira: string;
  if (partes.length === 2) {
    // Tem virgula: ela e o decimal, entao qualquer ponto na parte inteira e milhar.
    inteira = bruto.replace(/\./g, '');
  } else if (bruto.includes('.')) {
    throw new Error('Valor ambiguo: use virgula para os centavos, como 100,00');
  } else {
    inteira = bruto;
  }

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
