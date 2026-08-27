/**
 * Importa o mes corrente e as parcelas em aberto da planilha do Google Sheets.
 *
 * Script de uso unico: le o CSV exportado da aba do mes e cria os lancamentos
 * com as parcelas ja posicionadas nas competencias corretas, gravando pelo
 * mesmo repositorio que a aplicacao usa. Nao vira tela nem funcionalidade.
 *
 * Uso:
 *   npx tsx scripts/importar-planilha.ts <caminho.csv> <competencia AAAA-MM> <contaId>
 *
 * Formato esperado do CSV (exportado como "Valores separados por virgula"):
 * uma linha com o nome do bloco ("Nardy", "Nick" ou "Conjunto") sozinho na
 * primeira coluna, seguida das linhas de lancamento daquele bloco nas colunas
 * Descricao, Valor, Parcela, Categoria. Uma linha "TOTAL:", "METADE:" ou
 * "TOTAL GERAL:" fecha cada bloco (e e ignorada). Uma linha "FATURA:" com o
 * valor total da planilha, em qualquer ponto do arquivo, e usada para
 * conferir a soma importada. Um bloco "Outros" (fora do escopo do sistema:
 * nao ha controle de dividas entre as duas pessoas) e reconhecido e pulado.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { avancarCompetencia } from '../src/domain/competencia';
import { formatarBRL, reaisParaCentavos } from '../src/domain/money';
import { criarLancamento, type EntradaLancamento } from '../src/server/repositorios/lancamento';
import { prisma } from '../src/server/db';

export type LinhaPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
};

const ROTULOS_DE_TOTAL = ['total:', 'total geral:', 'fatura:', 'metade:'];
const PARCELA = /^(\d+)\/(\d+)$/;

/** Interpreta uma linha do CSV da aba do mes. Devolve null para linha que nao e lancamento. */
export function interpretarLinha(colunas: string[]): LinhaPlanilha | null {
  const [descricaoBruta = '', valorBruto = '', parcelaBruta = '', categoria = ''] = colunas;
  const descricao = descricaoBruta.trim();

  if (descricao === '' || valorBruto.trim() === '') return null;
  if (ROTULOS_DE_TOTAL.includes(descricao.toLowerCase())) return null;

  const parcela = parcelaBruta.trim();
  let parcelaAtual = 1;
  let totalParcelas = 1;

  if (parcela !== '') {
    const casou = PARCELA.exec(parcela);
    if (!casou) throw new Error(`Parcela invalida: ${parcela}`);
    parcelaAtual = Number(casou[1]);
    totalParcelas = Number(casou[2]);
  }

  return {
    descricao,
    valorCentavos: reaisParaCentavos(valorBruto),
    parcelaAtual,
    totalParcelas,
    categoria: categoria.trim(),
  };
}

// --- Rotina de importacao (le o banco, grava pelo repositorio real) ---

type Bloco = 'Nardy' | 'Nick' | 'Conjunto';
const BLOCOS: Bloco[] = ['Nardy', 'Nick', 'Conjunto'];

/** Remove acento e normaliza caixa, porque o seed usa "Veículo" e a planilha varia. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Divide uma linha de CSV em colunas, respeitando campos entre aspas com virgula. */
export function dividirLinhaCsv(linha: string): string[] {
  const colunas: string[] = [];
  let atual = '';
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i] ?? '';

    if (dentroDeAspas) {
      if (caractere === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        atual += caractere;
      }
      continue;
    }

    if (caractere === '"') {
      dentroDeAspas = true;
    } else if (caractere === ',') {
      colunas.push(atual);
      atual = '';
    } else {
      atual += caractere;
    }
  }
  colunas.push(atual);
  return colunas;
}

/** Nome do bloco se a linha e um cabecalho de bloco ("Nardy", "Nick", "Conjunto", "Outros"). */
function cabecalhoDeBloco(primeiraColuna: string): Bloco | 'Outros' | null {
  const normalizado = semAcento(primeiraColuna);
  const bloco = BLOCOS.find((b) => semAcento(b) === normalizado);
  if (bloco) return bloco;
  if (normalizado === 'outros') return 'Outros';
  return null;
}

/** Cabecalho de coluna repetido no topo do arquivo ou de cada bloco ("Descricao,Valor,..."). */
function ehCabecalhoDeColuna(primeiraColuna: string): boolean {
  return semAcento(primeiraColuna) === 'descricao';
}

export type ResultadoImportacao = {
  totalPorBloco: Record<Bloco, number>;
  totalGeral: number;
  faturaEsperada: number | null;
  lancamentosCriados: number;
};

/**
 * Le o CSV, cria um lancamento por linha de venda (pulando totais e linhas
 * vazias) e confere a soma importada contra a linha FATURA: do proprio CSV.
 *
 * A competencia da parcela 1 e avancarCompetencia(competencia, -(parcelaAtual
 * - 1)): uma linha "6/12" na aba de agosto tem a parcela 1 em marco, e as
 * parcelas 7 a 12 caem nos meses seguintes a agosto — e assim que o sistema
 * ja nasce sabendo o que esta comprometido no futuro, sem redigitacao.
 */
export async function importar(
  caminhoCsv: string,
  competencia: string,
  contaId: string,
): Promise<ResultadoImportacao> {
  const conteudo = readFileSync(caminhoCsv, 'utf8');
  const linhas = conteudo.split(/\r?\n/);

  const membros = await prisma.membro.findMany({ where: { ativo: true } });
  const categorias = await prisma.categoria.findMany();

  function acharMembro(bloco: 'Nardy' | 'Nick'): string {
    const achado = membros.find((m) => semAcento(m.nome) === semAcento(bloco));
    if (!achado) throw new Error(`Membro nao encontrado para o bloco ${bloco}`);
    return achado.id;
  }

  function acharCategoria(nome: string): string {
    const achada = categorias.find((c) => semAcento(c.nome) === semAcento(nome));
    if (!achada) throw new Error(`Categoria nao encontrada: ${nome}`);
    return achada.id;
  }

  let blocoAtual: Bloco | 'Outros' | null = null;
  const totalPorBloco: Record<Bloco, number> = { Nardy: 0, Nick: 0, Conjunto: 0 };
  let faturaEsperada: number | null = null;
  let criados = 0;

  for (const linhaBruta of linhas) {
    if (linhaBruta.trim() === '') continue;

    const colunas = dividirLinhaCsv(linhaBruta);
    const primeiraColuna = (colunas[0] ?? '').trim();

    const cabecalho = cabecalhoDeBloco(primeiraColuna);
    if (cabecalho) {
      blocoAtual = cabecalho;
      continue;
    }
    if (ehCabecalhoDeColuna(primeiraColuna)) continue;

    if (primeiraColuna.toLowerCase() === 'fatura:') {
      const valorBruto = (colunas[1] ?? '').trim();
      if (valorBruto !== '') faturaEsperada = reaisParaCentavos(valorBruto);
      continue;
    }

    const linha = interpretarLinha(colunas);
    if (!linha) continue;

    if (blocoAtual === null) {
      throw new Error(`Lancamento fora de qualquer bloco reconhecido: ${linha.descricao}`);
    }
    if (blocoAtual === 'Outros') {
      // Fora de escopo: o sistema nao controla dividas entre Nardy e Nick.
      console.error(`Ignorando linha do bloco Outros (fora de escopo): ${linha.descricao}`);
      continue;
    }

    const competenciaBase = avancarCompetencia(competencia, -(linha.parcelaAtual - 1));
    const escopo = blocoAtual === 'Conjunto' ? 'CONJUNTO' : 'PESSOAL';

    const entrada: EntradaLancamento = {
      descricao: linha.descricao,
      valorCentavos: linha.valorCentavos,
      origemValor: 'POR_PARCELA',
      dataCompra: `${competenciaBase}-01`,
      numeroParcelas: linha.totalParcelas,
      escopo,
      contaId,
      categoriaId: acharCategoria(linha.categoria),
      competenciaManual: competenciaBase,
      ...(blocoAtual === 'Conjunto' ? {} : { membroId: acharMembro(blocoAtual) }),
    };

    const resultado = await criarLancamento(entrada);
    if (!resultado.ok) {
      throw new Error(
        `Lancamento recusado (${resultado.motivo}): ${linha.descricao}. ` +
          'A importacao parou aqui; nada foi confirmado como concluido.',
      );
    }

    criados += 1;
    totalPorBloco[blocoAtual] += linha.valorCentavos;
  }

  const totalGeral = totalPorBloco.Nardy + totalPorBloco.Nick + totalPorBloco.Conjunto;

  console.log(`Lancamentos criados: ${criados}`);
  console.log(`Nardy: ${formatarBRL(totalPorBloco.Nardy)}`);
  console.log(`Nick: ${formatarBRL(totalPorBloco.Nick)}`);
  console.log(`Conjunto: ${formatarBRL(totalPorBloco.Conjunto)}`);
  console.log(`Total importado: ${formatarBRL(totalGeral)}`);

  if (faturaEsperada === null) {
    throw new Error(
      'Nao encontrei uma linha FATURA: no CSV para conferir o total. ' +
        'A importacao nao pode ser considerada validada; apague os lancamentos criados e refaca.',
    );
  }

  console.log(`Fatura da planilha: ${formatarBRL(faturaEsperada)}`);
  if (totalGeral !== faturaEsperada) {
    throw new Error(
      `Divergencia: importado ${formatarBRL(totalGeral)}, planilha ${formatarBRL(faturaEsperada)}. ` +
        'A importacao falhou: apague os lancamentos criados e refaca, nao corrija na mao.',
    );
  }
  console.log('Conferido: a soma importada bate com a fatura da planilha.');

  return { totalPorBloco, totalGeral, faturaEsperada, lancamentosCriados: criados };
}

async function main(): Promise<void> {
  const [, , caminhoCsv, competencia, contaId] = process.argv;
  if (!caminhoCsv || !competencia || !contaId) {
    console.error(
      'Uso: npx tsx scripts/importar-planilha.ts <caminho.csv> <competencia AAAA-MM> <contaId>',
    );
    process.exit(1);
  }
  await importar(caminhoCsv, competencia, contaId);
}

// So roda quando o arquivo e executado diretamente (tsx), nunca quando e
// importado pelo teste do interpretarLinha.
const executadoDiretamente =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  main()
    .catch((erro) => {
      console.error(erro);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
