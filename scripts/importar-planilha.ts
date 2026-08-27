/**
 * Importa o mes corrente e as parcelas em aberto da planilha do Google Sheets.
 *
 * Script de uso unico: le o CSV exportado da aba do mes e cria os lancamentos
 * com as parcelas ja posicionadas nas competencias corretas, gravando pelo
 * mesmo repositorio que a aplicacao usa. Nao vira tela nem funcionalidade.
 *
 * Uso:
 *   npx tsx scripts/importar-planilha.ts <caminho.csv> <competencia AAAA-MM> <contaCartaoId> <contaExternaId>
 *
 * Formato esperado do CSV (exportado como "Valores separados por virgula"):
 * uma linha com o nome do bloco ("Nardy", "Nick", "Conjunto" ou "Outros")
 * sozinho na primeira coluna, seguida das linhas de lancamento daquele bloco
 * nas colunas Descricao, Valor, Parcela, Categoria. Uma linha "TOTAL:",
 * "METADE:" ou "TOTAL GERAL:" fecha cada bloco (e e ignorada). Uma linha
 * "FATURA:" com o valor total do cartao, em qualquer ponto do arquivo, e
 * usada para conferir a soma importada nos blocos Nardy/Nick/Conjunto.
 *
 * O bloco "Outros" hoje significa despesa paga fora do cartao (revisao da
 * spec de 2026-08-09, secao 12) — nao mais divida entre o casal, que e o
 * unico pedaco do significado antigo que continua fora de escopo. Essas
 * linhas viram lancamentos na conta EXTERNA. Dentro de "Outros" ha
 * sub-blocos com nomes herdados do significado antigo (ex.: "Nardy > Nick"),
 * que precisam ser mapeados ao dono real do gasto em DONO_DO_SUBBLOCO_OUTROS,
 * abaixo — o script nao adivinha essa direcao.
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

// --- Interpretacao da planilha inteira (pura, sem banco) ---

type Bloco = 'Nardy' | 'Nick' | 'Conjunto';
type BlocoPrincipal = Bloco | 'Outros';
const BLOCOS_PRINCIPAIS: BlocoPrincipal[] = ['Nardy', 'Nick', 'Conjunto', 'Outros'];

/**
 * Dentro do bloco Outros, os sub-blocos herdam nomes do significado antigo da
 * planilha — direcao de divida entre o casal, ex.: "Nardy > Nick". Hoje o
 * bloco significa despesa paga fora do cartao (spec, revisao 2026-08-09,
 * secao 12), e o dono do gasto NAO e o mesmo que o nome antigo sugere sem
 * confirmar com quem editou a planilha. Por isso o mapa comeca vazio: um
 * cabecalho de sub-bloco desconhecido faz a importacao abortar (ver
 * interpretarPlanilha) em vez de adivinhar a quem o gasto pertence.
 *
 * Preencha depois de confirmar a direcao real, por exemplo:
 *   'Nardy > Nick': 'Nick',
 *   'Nick > Nardy': 'Nardy',
 */
const DONO_DO_SUBBLOCO_OUTROS: Record<string, 'Nardy' | 'Nick'> = {};

/** Remove acento e normaliza caixa, porque o seed usa "Veículo" e a planilha varia. */
function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
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

/** Nome do bloco principal se a linha e um cabecalho ("Nardy", "Nick", "Conjunto", "Outros"). */
function blocoPrincipalDe(primeiraColuna: string): BlocoPrincipal | null {
  const normalizado = semAcento(primeiraColuna);
  return BLOCOS_PRINCIPAIS.find((b) => semAcento(b) === normalizado) ?? null;
}

/** Cabecalho de coluna repetido no topo do arquivo ou de cada bloco ("Descricao,Valor,..."). */
function ehCabecalhoDeColuna(primeiraColuna: string): boolean {
  return semAcento(primeiraColuna) === 'descricao';
}

/** Uma linha "cabecalho" tem descricao mas nenhum valor — e assim que um sub-bloco se anuncia. */
function ehLinhaDeCabecalho(colunas: string[]): boolean {
  const descricao = (colunas[0] ?? '').trim();
  const valor = (colunas[1] ?? '').trim();
  return descricao !== '' && valor === '';
}

/**
 * Conta quantas linhas e qual soma ficariam presas atras de um cabecalho de
 * sub-bloco desconhecido, para o erro de abortar citar o que esta em risco
 * em vez de so dizer "cabecalho desconhecido" sem contexto.
 */
function contarLinhasAfetadas(
  linhas: string[],
  indiceInicial: number,
): { quantidade: number; somaCentavos: number } {
  let quantidade = 0;
  let somaCentavos = 0;

  for (let i = indiceInicial; i < linhas.length; i += 1) {
    const linhaBruta = linhas[i] ?? '';
    if (linhaBruta.trim() === '') continue;

    const colunas = dividirLinhaCsv(linhaBruta);
    const primeiraColuna = (colunas[0] ?? '').trim();

    if (ehCabecalhoDeColuna(primeiraColuna)) continue;
    if (primeiraColuna.toLowerCase() === 'fatura:') break;
    if (blocoPrincipalDe(primeiraColuna)) break;
    if (ehLinhaDeCabecalho(colunas)) break; // proximo sub-bloco

    let linha: LinhaPlanilha | null;
    try {
      linha = interpretarLinha(colunas);
    } catch {
      quantidade += 1; // malformada, mas ainda conta como "em risco"
      continue;
    }
    if (!linha) continue;

    quantidade += 1;
    somaCentavos += linha.valorCentavos;
  }

  return { quantidade, somaCentavos };
}

export type ItemPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
  contaTipo: 'CARTAO' | 'EXTERNA';
  escopo: 'PESSOAL' | 'CONJUNTO';
  dono: 'Nardy' | 'Nick' | null;
};

export type PlanilhaInterpretada = {
  itens: ItemPlanilha[];
  faturaEsperada: number | null;
};

/**
 * Le o conteudo inteiro do CSV e devolve a lista de itens prontos para virar
 * lancamento, mais o valor da linha FATURA: para conferencia. Funcao pura:
 * nenhum I/O, nenhum banco — e por isso testavel sem TESTE_DESTRUTIVO.
 *
 * Lanca erro alto (nunca descarta em silencio) quando: uma linha aparece
 * fora de qualquer bloco reconhecido; uma linha de Outros aparece antes de
 * qualquer sub-bloco; ou um cabecalho de sub-bloco de Outros nao esta em
 * `donoDoSubBlocoOutros`.
 */
export function interpretarPlanilha(
  conteudoCsv: string,
  donoDoSubBlocoOutros: Record<string, 'Nardy' | 'Nick'> = DONO_DO_SUBBLOCO_OUTROS,
): PlanilhaInterpretada {
  const linhas = conteudoCsv.split(/\r?\n/);
  const itens: ItemPlanilha[] = [];
  let faturaEsperada: number | null = null;

  let blocoAtual: BlocoPrincipal | null = null;
  let donoOutros: 'Nardy' | 'Nick' | null = null;

  for (let i = 0; i < linhas.length; i += 1) {
    const linhaBruta = linhas[i] ?? '';
    if (linhaBruta.trim() === '') continue;

    const colunas = dividirLinhaCsv(linhaBruta);
    const primeiraColuna = (colunas[0] ?? '').trim();

    if (ehCabecalhoDeColuna(primeiraColuna)) continue;

    if (primeiraColuna.toLowerCase() === 'fatura:') {
      const valorBruto = (colunas[1] ?? '').trim();
      if (valorBruto !== '') faturaEsperada = reaisParaCentavos(valorBruto);
      continue;
    }

    const blocoPrincipal = blocoPrincipalDe(primeiraColuna);
    if (blocoPrincipal) {
      blocoAtual = blocoPrincipal;
      donoOutros = null;
      continue;
    }

    if (blocoAtual === 'Outros' && ehLinhaDeCabecalho(colunas)) {
      const dono = donoDoSubBlocoOutros[primeiraColuna];
      if (!dono) {
        const { quantidade, somaCentavos } = contarLinhasAfetadas(linhas, i + 1);
        throw new Error(
          `Cabecalho de sub-bloco desconhecido no bloco Outros: "${primeiraColuna}". ` +
            `${quantidade} linha(s), soma ${formatarBRL(somaCentavos)}, estao em risco de ` +
            'nao ser importadas. Complete o mapa DONO_DO_SUBBLOCO_OUTROS antes de importar.',
        );
      }
      donoOutros = dono;
      continue;
    }

    const linha = interpretarLinha(colunas);
    if (!linha) continue;

    if (blocoAtual === null) {
      throw new Error(`Lancamento fora de qualquer bloco reconhecido: ${linha.descricao}`);
    }

    if (blocoAtual === 'Outros') {
      if (donoOutros === null) {
        throw new Error(
          `Linha do bloco Outros sem sub-bloco definido: ${linha.descricao}. Toda linha de ` +
            'Outros precisa vir depois de um cabecalho de sub-bloco reconhecido.',
        );
      }
      itens.push({
        descricao: linha.descricao,
        valorCentavos: linha.valorCentavos,
        parcelaAtual: linha.parcelaAtual,
        totalParcelas: linha.totalParcelas,
        categoria: linha.categoria,
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: donoOutros,
      });
      continue;
    }

    itens.push({
      descricao: linha.descricao,
      valorCentavos: linha.valorCentavos,
      parcelaAtual: linha.parcelaAtual,
      totalParcelas: linha.totalParcelas,
      categoria: linha.categoria,
      contaTipo: 'CARTAO',
      escopo: blocoAtual === 'Conjunto' ? 'CONJUNTO' : 'PESSOAL',
      dono: blocoAtual === 'Conjunto' ? null : blocoAtual,
    });
  }

  return { itens, faturaEsperada };
}

// --- Rotina de importacao (le o banco, grava pelo repositorio real) ---

export type ResultadoImportacao = {
  totalPorBloco: Record<Bloco, number>;
  totalCartao: number;
  totalExterno: number;
  faturaEsperada: number;
  lancamentosCriados: number;
};

/**
 * Le o CSV, cria um lancamento por item (Nardy/Nick/Conjunto na conta de
 * cartao, Outros na conta externa) e confere a soma do cartao contra a linha
 * FATURA: do proprio CSV. O total da conta externa e so impresso, para
 * conferencia manual contra o bloco Outros da planilha — a FATURA nunca
 * inclui despesa fora do cartao.
 *
 * A competencia da parcela 1 e avancarCompetencia(competencia, -(parcelaAtual
 * - 1)): uma linha "6/12" na aba de agosto tem a parcela 1 em marco, e as
 * parcelas 7 a 12 caem nos meses seguintes a agosto — e assim que o sistema
 * ja nasce sabendo o que esta comprometido no futuro, sem redigitacao.
 *
 * Sem transacao (o repositorio nao aceita um cliente de transacao, e nao
 * vale a pena mudar isso por um script de uso unico): em qualquer falha —
 * lancamento recusado, categoria/membro nao encontrado, ou divergencia na
 * conferencia final — os lancamentos ja criados NESTA rodada sao apagados
 * antes do erro subir, para que "apagar tudo e refazer" nao vire cacada
 * manual.
 */
export async function importar(
  caminhoCsv: string,
  competencia: string,
  contaCartaoId: string,
  contaExternaId: string,
  donoDoSubBlocoOutros: Record<string, 'Nardy' | 'Nick'> = DONO_DO_SUBBLOCO_OUTROS,
): Promise<ResultadoImportacao> {
  const conteudo = readFileSync(caminhoCsv, 'utf8');
  const { itens, faturaEsperada } = interpretarPlanilha(conteudo, donoDoSubBlocoOutros);

  const membros = await prisma.membro.findMany({ where: { ativo: true } });
  const categorias = await prisma.categoria.findMany();

  function acharMembro(dono: 'Nardy' | 'Nick'): string {
    const achado = membros.find((m) => semAcento(m.nome) === semAcento(dono));
    if (!achado) throw new Error(`Membro nao encontrado para o dono ${dono}`);
    return achado.id;
  }

  function acharCategoria(nome: string): string {
    const achada = categorias.find((c) => semAcento(c.nome) === semAcento(nome));
    if (!achada) throw new Error(`Categoria nao encontrada: ${nome}`);
    return achada.id;
  }

  const idsCriados: string[] = [];
  const totalPorBloco: Record<Bloco, number> = { Nardy: 0, Nick: 0, Conjunto: 0 };
  let totalExterno = 0;
  let criados = 0;

  try {
    for (const item of itens) {
      const contaId = item.contaTipo === 'CARTAO' ? contaCartaoId : contaExternaId;
      const competenciaBase = avancarCompetencia(competencia, -(item.parcelaAtual - 1));

      const entrada: EntradaLancamento = {
        descricao: item.descricao,
        valorCentavos: item.valorCentavos,
        origemValor: 'POR_PARCELA',
        dataCompra: `${competenciaBase}-01`,
        numeroParcelas: item.totalParcelas,
        escopo: item.escopo,
        contaId,
        categoriaId: acharCategoria(item.categoria),
        competenciaManual: competenciaBase,
        ...(item.dono === null ? {} : { membroId: acharMembro(item.dono) }),
      };

      const resultado = await criarLancamento(entrada);
      if (!resultado.ok) {
        throw new Error(`Lancamento recusado (${resultado.motivo}): ${item.descricao}.`);
      }

      idsCriados.push(resultado.id);
      criados += 1;

      if (item.contaTipo === 'EXTERNA') {
        totalExterno += item.valorCentavos;
      } else if (item.escopo === 'CONJUNTO') {
        totalPorBloco.Conjunto += item.valorCentavos;
      } else if (item.dono !== null) {
        totalPorBloco[item.dono] += item.valorCentavos;
      }
    }

    const totalCartao = totalPorBloco.Nardy + totalPorBloco.Nick + totalPorBloco.Conjunto;

    if (faturaEsperada === null) {
      throw new Error('Nao encontrei uma linha FATURA: no CSV para conferir o total do cartao.');
    }
    if (totalCartao !== faturaEsperada) {
      throw new Error(
        `Divergencia no cartao: importado ${formatarBRL(totalCartao)}, planilha ` +
          `${formatarBRL(faturaEsperada)}.`,
      );
    }

    console.log(`Lancamentos criados: ${criados}`);
    console.log('--- Cartao ---');
    console.log(`Nardy: ${formatarBRL(totalPorBloco.Nardy)}`);
    console.log(`Nick: ${formatarBRL(totalPorBloco.Nick)}`);
    console.log(`Conjunto: ${formatarBRL(totalPorBloco.Conjunto)}`);
    console.log(`Total cartao: ${formatarBRL(totalCartao)}`);
    console.log(`Fatura da planilha: ${formatarBRL(faturaEsperada)}`);
    console.log('Conferido: a soma do cartao bate com a fatura da planilha.');
    console.log('--- Fora do cartao (bloco Outros) ---');
    console.log(
      `Total externo: ${formatarBRL(totalExterno)} ` +
        '(confira contra o bloco Outros na planilha; a FATURA nao inclui esse valor)',
    );

    return {
      totalPorBloco,
      totalCartao,
      totalExterno,
      faturaEsperada,
      lancamentosCriados: criados,
    };
  } catch (erro) {
    if (idsCriados.length > 0) {
      const apagados = await prisma.lancamento.deleteMany({ where: { id: { in: idsCriados } } });
      console.error(
        `Falha na importacao: desfeitos ${apagados.count} lancamento(s) criados nesta rodada.`,
      );
    } else {
      console.error('Falha na importacao antes de criar qualquer lancamento; nada para desfazer.');
    }
    throw erro;
  }
}

async function main(): Promise<void> {
  const [, , caminhoCsv, competencia, contaCartaoId, contaExternaId] = process.argv;
  if (!caminhoCsv || !competencia || !contaCartaoId || !contaExternaId) {
    console.error(
      'Uso: npx tsx scripts/importar-planilha.ts ' +
        '<caminho.csv> <competencia AAAA-MM> <contaCartaoId> <contaExternaId>',
    );
    process.exit(1);
  }
  await importar(caminhoCsv, competencia, contaCartaoId, contaExternaId);
}

// So roda quando o arquivo e executado diretamente (tsx), nunca quando e
// importado pelo teste do interpretarLinha/interpretarPlanilha.
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
