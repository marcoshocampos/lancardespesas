import { compararCompetencias, type Competencia } from './competencia';
import { reaisParaCentavos, type Centavos } from './money';

/**
 * A busca do Despesas, pura. O repositorio carrega os lancamentos e filtra com
 * estas funcoes, em memoria — o Postgres nao ignora acento sem a extensao
 * `unaccent`, e a regra inteira morando aqui e o que a torna testavel em
 * milissegundos. Ver docs/specs/2026-11-17-busca-design.md.
 */

/** O termo ja interpretado. `interpretarBusca` devolve `null` para "nao busque". */
export type Busca = {
  /** As palavras do termo, normalizadas. Todas precisam aparecer. */
  palavras: string[];
  /** O termo lido como dinheiro, quando ele tem forma de valor; `null` quando nao tem. */
  centavos: Centavos | null;
};

/** O minimo de um lancamento que a busca precisa olhar. */
export type CandidatoDaBusca = {
  descricao: string;
  devedorNome: string | null;
  /** Todas as parcelas, canceladas inclusive: o total da compra e a soma de todas. */
  parcelas: readonly { valorCentavos: number; cancelada: boolean }[];
};

/**
 * So um valor, e nada mais: "R$" opcional, sinal opcional, digitos, ponto e
 * virgula. Existe porque `reaisParaCentavos` descarta tudo o que nao e digito
 * antes de ler — o certo no campo de valor do painel, e o errado aqui: "uber 89"
 * viraria R$ 89,00, e a busca acharia toda compra de 89 reais.
 */
const FORMA_DE_VALOR = /^(?:r\$\s*)?-?\s*\d[\d.,]*$/i;

/**
 * Sem acento e em minuscula: "Farmácia" e "farmacia" viram a mesma coisa.
 *
 * O NFD separa a letra do acento, e a faixa U+0300–U+036F e a dos acentos
 * combinantes — cobre o portugues inteiro, cedilha inclusive. A faixa, e nao
 * `\p{M}`, porque o `target` do tsconfig e ES2017 e o escape de propriedade
 * Unicode so existe a partir do ES2018.
 */
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

export function interpretarBusca(termo: string): Busca | null {
  const limpo = termo.trim();
  if (limpo === '') return null;

  const palavras = normalizarTexto(limpo)
    .split(/\s+/)
    .filter((palavra) => palavra !== '');
  return { palavras, centavos: lerValor(limpo) };
}

function lerValor(termo: string): Centavos | null {
  if (!FORMA_DE_VALOR.test(termo)) return null;
  try {
    return reaisParaCentavos(termo);
  } catch {
    // "89.90": tem forma de valor, mas o parser recusa por ambiguo. Vale so
    // como texto — adivinhar o decimal e como um valor vira 100x maior.
    return null;
  }
}

/** Casa por texto OU por valor: os dois criterios se somam, nunca se excluem. */
export function correspondeABusca(busca: Busca, candidato: CandidatoDaBusca): boolean {
  return casaPorTexto(busca, candidato) || casaPorValor(busca, candidato);
}

function casaPorTexto(busca: Busca, candidato: CandidatoDaBusca): boolean {
  const texto = normalizarTexto(`${candidato.descricao} ${candidato.devedorNome ?? ''}`);
  return busca.palavras.every((palavra) => texto.includes(palavra));
}

/**
 * Valor exato, sem sinal: o extrato e a memoria raramente carregam o sinal, e
 * "50,00" tem que achar o estorno de -50,00. Parcela cancelada nao casa pelo
 * proprio valor — ela nao aparece em mes nenhum —, mas entra no total, que e o
 * valor da compra (invariante 4).
 */
function casaPorValor(busca: Busca, candidato: CandidatoDaBusca): boolean {
  if (busca.centavos === null) return false;
  const alvo = Math.abs(busca.centavos);

  const pelaParcela = candidato.parcelas.some(
    (p) => !p.cancelada && Math.abs(p.valorCentavos) === alvo,
  );
  if (pelaParcela) return true;

  const total = candidato.parcelas.reduce((soma, p) => soma + p.valorCentavos, 0);
  return Math.abs(total) === alvo;
}

/**
 * Para qual mes o clique leva. A competencia de onde a pessoa veio, se o
 * lancamento tiver parcela nela — quem busca "89,90" olhando novembro quer a
 * parcela de novembro —; senao, a primeira, onde a compra entrou. `null`
 * quando nao ha parcela ativa: nao existe mes em que a linha seja visivel.
 */
export function competenciaDeDestino(
  competenciasAtivas: readonly Competencia[],
  origem: Competencia,
): Competencia | null {
  if (competenciasAtivas.includes(origem)) return origem;
  return [...competenciasAtivas].sort(compararCompetencias)[0] ?? null;
}
