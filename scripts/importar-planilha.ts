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
 * a planilha e COLUNAR, nao empilhada — os blocos ficam lado a lado, em faixas
 * de colunas, nao um embaixo do outro. Uma linha (a "linha de grupos", perto do
 * topo do arquivo) tem os titulos "C6" e "OUTROS", cada um na coluna onde seu
 * primeiro bloco comeca. Mais abaixo, a "linha de blocos" tem "Nardy", "Nick",
 * "Conjunto" (sob C6) e sub-blocos como "Nardy > Nick" (sob OUTROS), cada nome
 * tambem na coluna onde o bloco comeca. Logo abaixo dela, a "linha de colunas"
 * repete "Descricao", "Valor", "Parcela", "Categoria" para cada bloco — mas nem
 * todo bloco tem as quatro: os sub-blocos de OUTROS variam entre si (um pode
 * ter Parcela, outro nao) e nenhum bloco de OUTROS tem Categoria. O leitor
 * deriva a faixa de colunas de cada bloco (da coluna do seu nome ate a coluna
 * do proximo bloco) e quais campos ele tem a partir dessas linhas — nunca de
 * posicao fixa, porque a planilha ganha coluna e muda de largura com o tempo.
 *
 * Uma linha de lancamento tem Descricao e Valor preenchidos; uma linha "TOTAL:",
 * "TOTAL GERAL:", "METADE:" ou "FATURA:" fecha um bloco (e e ignorada) — o texto
 * decide, nao a posicao, porque celulas mescladas fazem essas linhas mudarem de
 * coluna conforme o bloco. A linha "FATURA:", em qualquer ponto do arquivo, tem
 * o valor total do cartao e e usada para conferir a soma importada dos blocos
 * de C6 (Nardy/Nick/Conjunto).
 *
 * O bloco "Outros" hoje significa despesa paga fora do cartao (revisao da
 * spec de 2026-08-09, secao 12) — nao mais divida entre o casal, que e o
 * unico pedaco do significado antigo que continua fora de escopo. Essas
 * linhas viram lancamentos na conta EXTERNA. Dentro de "Outros" ha
 * sub-blocos com nomes herdados do significado antigo (ex.: "Nardy > Nick"),
 * que precisam ser mapeados ao dono real do gasto em DONO_DO_SUBBLOCO_OUTROS,
 * abaixo — o script nao adivinha essa direcao. Nenhum sub-bloco de Outros tem
 * coluna Categoria, e nenhuma linha de C6 sem Categoria preenchida tem uma
 * classificacao adivinhada: as duas situacoes caem em CATEGORIA_SEM_CATEGORIA
 * ("Sem categoria"), criada pelo importador se ainda nao existir.
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

/** Interpreta as quatro celulas (Descricao, Valor, Parcela, Categoria) de um bloco numa linha. Devolve null para linha que nao e lancamento. */
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
type ContaTipo = 'CARTAO' | 'EXTERNA';

const CATEGORIA_SEM_CATEGORIA = 'Sem categoria';
const COR_CATEGORIA_SEM_CATEGORIA = '#9E9E9E';

/** Grupo (linha 1, celulas "C6"/"OUTROS") decide se o bloco vira lancamento de cartao ou de conta externa. */
const CONTA_TIPO_POR_GRUPO: Record<string, ContaTipo> = { c6: 'CARTAO', outros: 'EXTERNA' };

/** Nomes de bloco que o grupo C6 realmente usa hoje: um por membro, mais o conjunto. */
const DONO_DO_BLOCO_CARTAO: Record<string, Bloco> = { Nardy: 'Nardy', Nick: 'Nick', Conjunto: 'Conjunto' };

/**
 * Dentro do bloco Outros, os sub-blocos que a planilha realmente tem sao
 * "Nardy > Nick" e "Nick > Nardy" — nomes herdados de quando Outros era
 * direcao de divida entre o casal. Nessa forma o PRIMEIRO nome e o dono do
 * gasto ("manutencao da moto" sob "Nick > Nardy" e despesa de Nick, nao de
 * Nardy).
 *
 * O conceito de divida entre o casal foi abandonado (confirmado com o
 * usuario em 2026-08-27): Outros e so lancamento comum de debito e boleto, e
 * "Nardy > Nick" / "Nick > Nardy" sao resquicio desse significado antigo, nao
 * mais direcao de divida — essa questao nao volta a ser reaberta. O mapa
 * aceita so os cabecalhos que a planilha de fato usa hoje; nao especula
 * sobre um formato futuro. Se a planilha ganhar um sub-bloco com cabecalho
 * novo, o aborto abaixo (cabecalho de sub-bloco desconhecido) avisa qual
 * texto apareceu, quantas linhas e qual soma estao em risco — e a linha e
 * acrescentada aqui nesse momento, com o dono confirmado, nao adivinhado.
 */
const DONO_DO_SUBBLOCO_OUTROS: Record<string, Bloco> = {
  'Nardy > Nick': 'Nardy',
  'Nick > Nardy': 'Nick',
};

/**
 * Normaliza um cabecalho de bloco (de C6 ou de sub-bloco de Outros) para
 * comparar com as chaves dos mapas de dono acima: sem acento, sem depender de
 * caixa, tolerando espaco em volta do ">".
 */
function normalizarCabecalhoDeBloco(texto: string): string {
  return semAcento(texto).replace(/\s*>\s*/g, '>');
}

/** Dono de um bloco, comparando o cabecalho normalizado contra o mapa (de C6 ou de Outros). */
function encontrarDono(mapa: Record<string, Bloco>, cabecalho: string): Bloco | undefined {
  const normalizado = normalizarCabecalhoDeBloco(cabecalho);
  const encontrada = Object.entries(mapa).find(
    ([chave]) => normalizarCabecalhoDeBloco(chave) === normalizado,
  );
  return encontrada?.[1];
}

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

/** Uma linha "em branco" nao tem nenhuma celula com conteudo — separa secoes do cabecalho. */
function linhaEmBranco(linha: string[]): boolean {
  return linha.every((celula) => celula.trim() === '');
}

/**
 * Linha de cabecalho de colunas: a primeira linha do arquivo com alguma celula
 * "Descricao" — repetida uma vez por bloco, lado a lado, nessa mesma linha.
 */
function localizarLinhaDeColunas(matriz: string[][]): number {
  const indice = matriz.findIndex((linha) =>
    linha.some((celula) => semAcento(celula.trim()) === 'descricao'),
  );
  if (indice === -1) {
    throw new Error('Nao encontrei a linha de cabecalho de colunas ("Descricao") no CSV.');
  }
  return indice;
}

/**
 * Linha de cabecalho de blocos: a primeira linha nao-em-branco encontrada
 * subindo a partir da linha de colunas (pula apenas a linha separadora em
 * branco entre as duas, se houver).
 */
function localizarLinhaDeBlocos(matriz: string[][], linhaDeColunas: number): number {
  for (let i = linhaDeColunas - 1; i >= 0; i -= 1) {
    const linha = matriz[i];
    if (linha !== undefined && !linhaEmBranco(linha)) return i;
  }
  throw new Error('Nao encontrei a linha de cabecalho de blocos acima da linha de colunas.');
}

/**
 * Linha de cabecalho de grupos ("C6"/"OUTROS"): a primeira linha nao-em-branco
 * do arquivo. O titulo do grupo fica sempre no topo da planilha exportada.
 */
function localizarLinhaDeGrupos(matriz: string[][]): number {
  const indice = matriz.findIndex((linha) => !linhaEmBranco(linha));
  if (indice === -1) throw new Error('CSV vazio: nenhuma linha com conteudo.');
  return indice;
}

type Marcador = { coluna: number; texto: string };

/** Celulas nao-vazias de uma linha, com a coluna de cada uma — usado para blocos e grupos. */
function marcadoresDaLinha(linha: string[] | undefined): Marcador[] {
  if (!linha) return [];
  const marcadores: Marcador[] = [];
  linha.forEach((celula, coluna) => {
    const texto = celula.trim();
    if (texto !== '') marcadores.push({ coluna, texto });
  });
  return marcadores;
}

/** O grupo de um bloco e o marcador de grupo mais proximo a esquerda: mesma coluna, ou antes. */
function grupoDoBloco(grupos: Marcador[], colunaDoBloco: number): Marcador | undefined {
  let encontrado: Marcador | undefined;
  for (const grupo of grupos) {
    if (grupo.coluna > colunaDoBloco) break;
    encontrado = grupo;
  }
  return encontrado;
}

/** Maior numero de colunas entre todas as linhas do arquivo — limite da faixa do ultimo bloco de cada linha de grupos. */
function larguraDaMatriz(matriz: string[][]): number {
  return matriz.reduce((maior, linha) => Math.max(maior, linha.length), 0);
}

type CampoBloco = 'descricao' | 'valor' | 'parcela' | 'categoria';
type OffsetsDoBloco = Partial<Record<CampoBloco, number>>;

const CAMPOS_RECONHECIDOS: Record<string, CampoBloco> = {
  descricao: 'descricao',
  valor: 'valor',
  parcela: 'parcela',
  categoria: 'categoria',
};

/**
 * Mapeia, para um bloco (faixa de colunas [colunaInicio, colunaFim)), qual
 * coluna absoluta tem cada campo — lido da linha de cabecalho de colunas.
 * Um bloco pode nao ter Parcela e/ou Categoria; o offset correspondente
 * simplesmente nao aparece no resultado.
 */
function offsetsDoBloco(
  linhaDeColunas: string[] | undefined,
  colunaInicio: number,
  colunaFim: number,
): OffsetsDoBloco {
  const offsets: OffsetsDoBloco = {};
  for (let coluna = colunaInicio; coluna < colunaFim; coluna += 1) {
    const texto = semAcento((linhaDeColunas?.[coluna] ?? '').trim());
    const campo = CAMPOS_RECONHECIDOS[texto];
    if (campo) offsets[campo] = coluna;
  }
  return offsets;
}

/** Le, de uma linha de dados, as quatro celulas de um bloco na ordem que interpretarLinha espera. */
function celulasDoBloco(linha: string[] | undefined, offsets: OffsetsDoBloco): string[] {
  const celula = (coluna: number | undefined): string =>
    coluna === undefined || linha === undefined ? '' : (linha[coluna] ?? '');
  return [celula(offsets.descricao), celula(offsets.valor), celula(offsets.parcela), celula(offsets.categoria)];
}

/**
 * Conta quantas linhas e qual soma ficariam presas atras de um cabecalho de
 * bloco desconhecido, para o erro de abortar citar o que esta em risco em vez
 * de so dizer "cabecalho desconhecido" sem contexto.
 */
function contarLinhasDoBloco(
  matriz: string[][],
  primeiraLinhaDeDados: number,
  offsets: OffsetsDoBloco,
): { quantidade: number; somaCentavos: number } {
  let quantidade = 0;
  let somaCentavos = 0;

  for (let i = primeiraLinhaDeDados; i < matriz.length; i += 1) {
    const celulas = celulasDoBloco(matriz[i], offsets);
    let linha: LinhaPlanilha | null;
    try {
      linha = interpretarLinha(celulas);
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

/**
 * Procura a linha "FATURA:" em qualquer coluna (celulas mescladas fazem essa
 * linha mudar de coluna conforme o bloco) e devolve o valor da celula
 * seguinte, na mesma linha. null quando nao ha linha FATURA: no arquivo.
 */
function localizarFatura(matriz: string[][], primeiraLinhaDeDados: number): number | null {
  for (let i = primeiraLinhaDeDados; i < matriz.length; i += 1) {
    const linha = matriz[i];
    if (!linha) continue;
    for (let coluna = 0; coluna < linha.length; coluna += 1) {
      if ((linha[coluna] ?? '').trim().toLowerCase() === 'fatura:') {
        const valorBruto = (linha[coluna + 1] ?? '').trim();
        return valorBruto === '' ? null : reaisParaCentavos(valorBruto);
      }
    }
  }
  return null;
}

export type ItemPlanilha = {
  descricao: string;
  valorCentavos: number;
  parcelaAtual: number;
  totalParcelas: number;
  categoria: string;
  contaTipo: ContaTipo;
  escopo: 'PESSOAL' | 'CONJUNTO';
  dono: 'Nardy' | 'Nick' | null;
};

export type PlanilhaInterpretada = {
  itens: ItemPlanilha[];
  faturaEsperada: number | null;
};

/**
 * Le o conteudo inteiro do CSV colunar e devolve a lista de itens prontos
 * para virar lancamento, mais o valor da linha FATURA: para conferencia.
 * Funcao pura: nenhum I/O, nenhum banco — e por isso testavel sem
 * TESTE_DESTRUTIVO.
 *
 * A planilha e colunar: os blocos (Nardy, Nick, Conjunto sob C6; os
 * sub-blocos de Outros) ficam lado a lado em faixas de coluna, nao
 * empilhados. O leitor deriva essas faixas da linha de blocos e da linha de
 * colunas — nunca de posicao fixa — e le cada bloco da coluna do seu nome
 * ate a coluna do proximo bloco.
 *
 * Lanca erro alto (nunca descarta em silencio) quando: um bloco nao tem
 * grupo (C6/OUTROS) reconhecivel a esquerda; o grupo de um bloco nao e nem
 * C6 nem OUTROS; um bloco nao tem coluna Descricao ou Valor reconhecida; ou
 * o nome de um bloco (de C6 ou de um sub-bloco de Outros) nao esta no mapa
 * de donos correspondente.
 */
export function interpretarPlanilha(
  conteudoCsv: string,
  donoDoSubBlocoOutros: Record<string, Bloco> = DONO_DO_SUBBLOCO_OUTROS,
): PlanilhaInterpretada {
  const matriz = conteudoCsv.split(/\r?\n/).map(dividirLinhaCsv);

  const linhaDeColunas = localizarLinhaDeColunas(matriz);
  const linhaDeBlocos = localizarLinhaDeBlocos(matriz, linhaDeColunas);
  const linhaDeGrupos = localizarLinhaDeGrupos(matriz);
  const primeiraLinhaDeDados = linhaDeColunas + 1;

  const grupos = marcadoresDaLinha(matriz[linhaDeGrupos]);
  const blocos = marcadoresDaLinha(matriz[linhaDeBlocos]);
  const largura = larguraDaMatriz(matriz);

  const faturaEsperada = localizarFatura(matriz, primeiraLinhaDeDados);
  const itens: ItemPlanilha[] = [];

  for (const [indice, bloco] of blocos.entries()) {
    const proximoBloco = blocos[indice + 1];
    const colunaFim = proximoBloco ? proximoBloco.coluna : largura;

    const grupo = grupoDoBloco(grupos, bloco.coluna);
    if (!grupo) {
      throw new Error(
        `Bloco "${bloco.texto}" nao tem grupo (C6/OUTROS) a esquerda na linha de titulos.`,
      );
    }

    const contaTipo = CONTA_TIPO_POR_GRUPO[semAcento(grupo.texto)];
    if (!contaTipo) {
      throw new Error(
        `Grupo desconhecido na linha de titulos: "${grupo.texto}". Os grupos reconhecidos ` +
          'sao C6 e OUTROS.',
      );
    }

    const offsets = offsetsDoBloco(matriz[linhaDeColunas], bloco.coluna, colunaFim);
    if (offsets.descricao === undefined || offsets.valor === undefined) {
      throw new Error(`Bloco "${bloco.texto}" sem coluna Descricao ou Valor reconhecida.`);
    }

    const dono =
      contaTipo === 'CARTAO'
        ? encontrarDono(DONO_DO_BLOCO_CARTAO, bloco.texto)
        : encontrarDono(donoDoSubBlocoOutros, bloco.texto);

    if (!dono) {
      const { quantidade, somaCentavos } = contarLinhasDoBloco(matriz, primeiraLinhaDeDados, offsets);
      if (contaTipo === 'CARTAO') {
        throw new Error(
          `Cabecalho de bloco desconhecido no grupo C6: "${bloco.texto}". ${quantidade} ` +
            `linha(s), soma ${formatarBRL(somaCentavos)}, estao em risco de nao ser ` +
            'importadas. Os nomes reconhecidos sao Nardy, Nick e Conjunto.',
        );
      }
      throw new Error(
        `Cabecalho de sub-bloco desconhecido no bloco Outros: "${bloco.texto}". ${quantidade} ` +
          `linha(s), soma ${formatarBRL(somaCentavos)}, estao em risco de nao ser importadas. ` +
          'Complete o mapa DONO_DO_SUBBLOCO_OUTROS antes de importar.',
      );
    }

    for (let i = primeiraLinhaDeDados; i < matriz.length; i += 1) {
      const linha = interpretarLinha(celulasDoBloco(matriz[i], offsets));
      if (!linha) continue;

      itens.push({
        descricao: linha.descricao,
        valorCentavos: linha.valorCentavos,
        parcelaAtual: linha.parcelaAtual,
        totalParcelas: linha.totalParcelas,
        // Sem Categoria na planilha — todo bloco de Outros (nao tem a coluna),
        // ou uma linha de C6 ainda nao classificada (a coluna existe, a celula
        // esta em branco) — vira "Sem categoria" em vez de ficar sem valor:
        // decisao do casal de nao inventar classificacao, mas deixar visivel
        // o que falta reclassificar.
        categoria: linha.categoria === '' ? CATEGORIA_SEM_CATEGORIA : linha.categoria,
        contaTipo,
        escopo: dono === 'Conjunto' ? 'CONJUNTO' : 'PESSOAL',
        dono: dono === 'Conjunto' ? null : dono,
      });
    }
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
 * A categoria "Sem categoria" (destino de todo item sem classificacao na
 * planilha) e criada sob demanda, na primeira vez que um item precisa dela —
 * qualquer outra categoria ausente continua sendo erro fatal, porque so
 * "Sem categoria" e um destino que o importador tem autoridade para inventar.
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
  donoDoSubBlocoOutros: Record<string, Bloco> = DONO_DO_SUBBLOCO_OUTROS,
): Promise<ResultadoImportacao> {
  const conteudo = readFileSync(caminhoCsv, 'utf8');
  const { itens, faturaEsperada } = interpretarPlanilha(conteudo, donoDoSubBlocoOutros);

  const membros = await prisma.membro.findMany({ where: { ativo: true } });
  let categorias = await prisma.categoria.findMany();

  function acharMembro(dono: 'Nardy' | 'Nick'): string {
    const achado = membros.find((m) => semAcento(m.nome) === semAcento(dono));
    if (!achado) throw new Error(`Membro nao encontrado para o dono ${dono}`);
    return achado.id;
  }

  async function acharCategoria(nome: string): Promise<string> {
    const achada = categorias.find((c) => semAcento(c.nome) === semAcento(nome));
    if (achada) return achada.id;

    if (semAcento(nome) !== semAcento(CATEGORIA_SEM_CATEGORIA)) {
      throw new Error(`Categoria nao encontrada: ${nome}`);
    }

    const criada = await prisma.categoria.upsert({
      where: { nome: CATEGORIA_SEM_CATEGORIA },
      update: {},
      create: { nome: CATEGORIA_SEM_CATEGORIA, cor: COR_CATEGORIA_SEM_CATEGORIA },
    });
    categorias = [...categorias, criada];
    return criada.id;
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
        categoriaId: await acharCategoria(item.categoria),
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
