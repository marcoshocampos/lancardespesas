import { avancarCompetencia, competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import {
  colunasDaFaixa,
  faixaDoLancamento,
  faixaEscrita,
  limitesDeParcelas,
  planejarDivisao,
  type Alcance,
  type LimitesDeParcelas,
} from '@/domain/divisao';
import { gerarParcelas, type Faixa, type ParcelaGerada } from '@/domain/parcelamento';
import { pesosMeioAMeio } from '@/domain/rateio';
import { acharTrava, type ParcelaAlvo, type Trava } from '@/domain/trava';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Cliente de banco que serve tanto o `prisma` solto quanto o `tx` de dentro de
 * uma transacao. Todo helper daqui recebe um, em vez de fechar sobre o
 * `prisma` global: e o que permite as gravacoes rodarem como uma coisa so.
 *
 * Sem isto, uma falha no meio da transacao de edicao (`gravarParcelas` e
 * `gravarRateio`) deixava lancamento sem parcela nenhuma — ele desaparecia da
 * grade e continuava existindo no banco.
 */
type ClienteBanco = Prisma.TransactionClient;

export type EntradaLancamento = {
  descricao: string;
  valorCentavos: number;
  origemValor: 'POR_PARCELA' | 'TOTAL';
  dataCompra: string;
  numeroParcelas: number;
  escopo: 'PESSOAL' | 'CONJUNTO';
  contaId: string;
  categoriaId: string;
  membroId?: string | undefined;
  competenciaManual?: string | undefined;
  /**
   * A primeira parcela que o lancamento grava; padrao 1. E para lancar a
   * compra antiga que so agora apareceu: com 3 de 6, grava as parcelas 3 a 6,
   * e a 1 e a 2 nao existem. So `criarLancamento` le — na edicao, a faixa vem
   * do proprio lancamento.
   */
  parcelaInicial?: number | undefined;
  /** Alguem de fora vai devolver: fica na fatura, sai do gasto do casal. */
  ehReembolso?: boolean | undefined;
  /** Quem vai devolver. So faz sentido com `ehReembolso`. */
  devedorNome?: string | undefined;
  /**
   * A recorrente e a competencia de onde este lancamento nasceu. So
   * `lancarRecorrentes` preenche; o esquema da action de lancamento nao tem
   * estes campos, entao a tela nao consegue forjar a marca.
   *
   * Vao no MESMO `create` do lancamento, nunca num update depois: entre os
   * dois passos o lancamento existiria sem marca, a recorrente continuaria
   * pendente, e um segundo clique a geraria de novo.
   */
  recorrenteId?: string | undefined;
  competenciaRecorrente?: string | undefined;
};

/** A recusa da trava diz qual parcela, em que mes e de que conta — ver `descreverTrava`. */
export type RecusaTravada = { ok: false; motivo: 'FATURA_TRAVADA'; travada: Trava };

export type ResultadoGravacao =
  | { ok: true }
  | RecusaTravada
  | { ok: false; motivo: 'CONFLITO'; atual?: unknown };

/**
 * A recusa de um total de parcelas que o alcance nao comporta, com os limites
 * aceitos — ver `limitesDeParcelas`. So editar devolve: e a unica gravacao que
 * muda o total.
 */
export type RecusaTotal = { ok: false; motivo: 'TOTAL_INVALIDO' } & LimitesDeParcelas;

export type ResultadoEdicao = ResultadoGravacao | RecusaTotal;

export type ResultadoCriacao = { ok: true; id: string } | RecusaTravada;

/**
 * Os campos de reembolso, prontos para o Prisma.
 *
 * `statusReembolso` nulo e o que significa "nao e reembolso" — e o que
 * `carregarParcelasDaCompetencia` testa. O nome do devedor so sobrevive junto
 * com o status: desligar a marca e deixar o nome gravado produziria um
 * lancamento comum carregando o nome de quem devia, que reapareceria do nada
 * se alguem religasse a marca.
 *
 * Sempre PENDENTE, nunca RECEBIDO: se ja devolveram e por parcela
 * (`Parcela.reembolsoRecebido`), e quem preserva isso na edicao sao
 * as marcas que `marcasDe` carrega para `gravarParcelas`.
 */
function camposDeReembolso(entrada: EntradaLancamento): {
  statusReembolso: 'PENDENTE' | null;
  devedorNome: string | null;
} {
  if (!entrada.ehReembolso) return { statusReembolso: null, devedorNome: null };

  const nome = entrada.devedorNome?.trim();
  return { statusReembolso: 'PENDENTE', devedorNome: nome ? nome : null };
}

async function competenciaBaseDe(db: ClienteBanco, entrada: EntradaLancamento): Promise<string> {
  if (entrada.competenciaManual) return entrada.competenciaManual;

  const conta = await db.conta.findUniqueOrThrow({ where: { id: entrada.contaId } });
  if (conta.tipo === 'CARTAO') {
    if (conta.diaFechamento === null) {
      throw new Error(`Conta de cartao sem dia de fechamento: ${conta.nome}`);
    }
    return competenciaDeCartao(entrada.dataCompra, conta.diaFechamento);
  }
  return competenciaDeContaExterna(entrada.dataCompra);
}

/** Os campos do lancamento que a tela escreve, prontos para o Prisma. */
function camposGravaveis(entrada: EntradaLancamento) {
  return {
    descricao: entrada.descricao,
    valorCentavos: entrada.valorCentavos,
    origemValor: entrada.origemValor,
    dataCompra: entrada.dataCompra,
    numeroParcelas: entrada.numeroParcelas,
    escopo: entrada.escopo,
    contaId: entrada.contaId,
    categoriaId: entrada.categoriaId,
    membroId: entrada.escopo === 'PESSOAL' ? (entrada.membroId ?? null) : null,
    ...camposDeReembolso(entrada),
  };
}

function paraParcelamento(entrada: EntradaLancamento, competenciaBase: string) {
  return {
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  };
}

/**
 * A primeira parcela, entre as informadas, que cai numa fatura TRAVADA desta
 * conta — com o nome da conta, para a recusa dizer onde esta o problema.
 *
 * **Recebe so as parcelas que a operacao apaga ou grava.** A trava congela
 * parcela, nao lancamento: quando esta barreira olhava o lancamento inteiro,
 * travar novembro impedia editar dezembro de todo parcelado que passasse por
 * novembro, e a recusa dizia "esse mes" sem dizer qual.
 *
 * Fica dentro da transacao da gravacao, como antes: conferir fora deixava uma
 * janela em que a outra pessoa travava a fatura entre a verificacao e a escrita.
 */
async function travaEntre(
  db: ClienteBanco,
  contaId: string,
  numeroParcelas: number,
  parcelas: readonly ParcelaAlvo[],
): Promise<Trava | null> {
  if (parcelas.length === 0) return null;

  const travadas = await db.fatura.findMany({
    where: {
      status: 'TRAVADA',
      contaId,
      competencia: { in: [...new Set(parcelas.map((p) => p.competencia))] },
    },
    select: { competencia: true, conta: { select: { nome: true } } },
  });
  const achada = acharTrava(parcelas, new Set(travadas.map((f) => f.competencia)));
  if (!achada) return null;

  // So os quatro campos: `achada` pode ser uma linha inteira do Prisma, e o
  // resultado viaja ate a tela.
  return {
    numero: achada.numero,
    competencia: achada.competencia,
    numeroParcelas,
    contaNome: travadas.find((f) => f.competencia === achada.competencia)?.conta.nome ?? contaId,
  };
}

function recusa(travada: Trava): RecusaTravada {
  return { ok: false, motivo: 'FATURA_TRAVADA', travada };
}

/** A recusa por versao: devolve o registro como esta agora, para a tela mostrar. */
async function conflito(db: ClienteBanco, id: string): Promise<ResultadoGravacao> {
  const atual = await db.lancamento.findUnique({ where: { id } });
  return { ok: false, motivo: 'CONFLITO', atual };
}

/** O lancamento com as linhas e o rateio: tudo o que editar, excluir e restaurar leem dele. */
function lerOriginal(db: ClienteBanco, id: string) {
  return db.lancamento.findUnique({
    where: { id },
    include: { parcelas: { orderBy: { numero: 'asc' } }, rateios: true },
  });
}

/**
 * As marcas que uma parcela carrega e que nao podem se perder quando ela e
 * regerada: cancelada (quitacao antecipada) nao pode "ressuscitar", e parcela
 * de reembolso ja devolvida nao pode voltar a ser devida. A chave estavel
 * entre a linha velha e a nova e o numero.
 */
type Marcas = { cancelados: ReadonlySet<number>; recebidos: ReadonlySet<number> };

const SEM_MARCAS: Marcas = { cancelados: new Set(), recebidos: new Set() };

function marcasDe(
  linhas: readonly { numero: number; cancelada: boolean; reembolsoRecebido: boolean }[],
): Marcas {
  return {
    cancelados: new Set(linhas.filter((l) => l.cancelada).map((l) => l.numero)),
    recebidos: new Set(linhas.filter((l) => l.reembolsoRecebido).map((l) => l.numero)),
  };
}

/**
 * Grava parcelas ja geradas. Criar passa `SEM_MARCAS` e nao le nem apaga
 * nada: um lancamento que acabou de nascer nao tem filho nenhum (cada ida ao
 * Neon custa ~45 ms, e foi isso que cortou a criacao de 10 consultas para 6).
 */
async function gravarParcelas(
  db: ClienteBanco,
  lancamentoId: string,
  parcelas: readonly ParcelaGerada[],
  ehReembolso: boolean,
  marcas: Marcas,
): Promise<void> {
  await db.parcela.createMany({
    data: parcelas.map((p) => ({
      ...p,
      lancamentoId,
      cancelada: marcas.cancelados.has(p.numero),
      // Desligar a marca de reembolso apaga o recebido, como apaga o devedor:
      // religa-la depois nao pode trazer de volta o estado de outra epoca.
      reembolsoRecebido: ehReembolso && marcas.recebidos.has(p.numero),
    })),
  });
}

/**
 * Grava so os percentuais. O valor de cada cota e calculado por `ratear()` na
 * leitura, sobre o valor DA PARCELA — ver Tarefa 10 da Fase 1.
 */
async function gravarRateio(
  db: ClienteBanco,
  lancamentoId: string,
  escopo: 'PESSOAL' | 'CONJUNTO',
): Promise<void> {
  if (escopo !== 'CONJUNTO') return;
  const membros = await db.membro.findMany({
    where: { ativo: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true },
  });
  const pesos = pesosMeioAMeio(membros.map((m) => m.id));
  await db.rateio.createMany({
    data: pesos.map((p) => ({ lancamentoId, membroId: p.membroId, percentual: p.percentual })),
  });
}

type Original = NonNullable<Awaited<ReturnType<typeof lerOriginal>>>;

function dentro(faixa: Faixa, numero: number): boolean {
  return numero >= faixa.inicial && numero <= faixa.final;
}

/**
 * Tira do original as linhas de `faixa` e as poe num lancamento novo com os
 * MESMOS campos — mesmo valor, conta, pessoa, categoria e rateio. As linhas so
 * trocam de `lancamentoId`: id, numero, valor e competencia ficam, e por isso
 * nao passam pela barreira — nada do que a fatura mostra muda.
 *
 * `deletadoEm` preenchido e a exclusao de um pedaco: ele nasce na lixeira, e
 * a lixeira o restaura como qualquer outro lancamento.
 *
 * A marca de recorrente fica com o original: o par (recorrenteId,
 * competenciaRecorrente) e unico no banco, e copia-la derrubaria a transacao.
 */
async function separar(
  db: ClienteBanco,
  original: Original,
  faixa: Faixa,
  deletadoEm: Date | null,
): Promise<string> {
  const pedaco = await db.lancamento.create({
    data: {
      descricao: original.descricao,
      valorCentavos: original.valorCentavos,
      origemValor: original.origemValor,
      dataCompra: original.dataCompra,
      numeroParcelas: original.numeroParcelas,
      escopo: original.escopo,
      meioPagamento: original.meioPagamento,
      devedorNome: original.devedorNome,
      statusReembolso: original.statusReembolso,
      contaId: original.contaId,
      categoriaId: original.categoriaId,
      membroId: original.membroId,
      deletadoEm,
      ...colunasDaFaixa(faixa, original.numeroParcelas),
    },
  });
  await db.parcela.updateMany({
    where: { lancamentoId: original.id, numero: { gte: faixa.inicial, lte: faixa.final } },
    data: { lancamentoId: pedaco.id },
  });
  if (original.rateios.length > 0) {
    await db.rateio.createMany({
      data: original.rateios.map((r) => ({
        lancamentoId: pedaco.id,
        membroId: r.membroId,
        percentual: r.percentual,
      })),
    });
  }
  return pedaco.id;
}

/**
 * "So esta": a tela so pode mudar o valor. Todo o resto vem do original — a
 * Fatura tambem, recalculada da propria linha —, entao a tela nao consegue
 * forjar outra mudanca mandando campos a mais.
 */
function soOValor(original: Original, numero: number, valorCentavos: number): EntradaLancamento {
  const linha = original.parcelas.find((p) => p.numero === numero);
  if (!linha) throw new Error(`Lancamento ${original.id} nao tem parcela ${numero}`);
  return {
    descricao: original.descricao,
    valorCentavos,
    origemValor: original.origemValor,
    dataCompra: original.dataCompra,
    numeroParcelas: original.numeroParcelas,
    escopo: original.escopo,
    contaId: original.contaId,
    categoriaId: original.categoriaId,
    membroId: original.membroId ?? undefined,
    ehReembolso: original.statusReembolso !== null,
    devedorNome: original.devedorNome ?? undefined,
    competenciaManual: avancarCompetencia(linha.competencia, -(numero - 1)),
  };
}

export async function criarLancamento(entrada: EntradaLancamento): Promise<ResultadoCriacao> {
  return prisma.$transaction(async (tx) => {
    const competenciaBase = await competenciaBaseDe(tx, entrada);
    // A faixa que este lancamento grava: da parcela inicial ate o fim. As de
    // antes nao existem, e por isso nao passam pela barreira.
    const faixa: Faixa = { inicial: entrada.parcelaInicial ?? 1, final: entrada.numeroParcelas };
    const parcelas = gerarParcelas(paraParcelamento(entrada, competenciaBase), faixa);

    const travada = await travaEntre(tx, entrada.contaId, entrada.numeroParcelas, parcelas);
    if (travada) return recusa(travada);

    const lancamento = await tx.lancamento.create({
      data: {
        ...camposGravaveis(entrada),
        ...colunasDaFaixa(faixa, entrada.numeroParcelas),
        // So entram juntos: marca pela metade nao identifica nada, e o indice
        // unico e sobre o par.
        ...(entrada.recorrenteId && entrada.competenciaRecorrente
          ? {
              recorrenteId: entrada.recorrenteId,
              competenciaRecorrente: entrada.competenciaRecorrente,
            }
          : {}),
      },
    });

    await gravarParcelas(tx, lancamento.id, parcelas, entrada.ehReembolso === true, SEM_MARCAS);
    await gravarRateio(tx, lancamento.id, entrada.escopo);
    return { ok: true, id: lancamento.id };
  });
}

/**
 * Edita um lancamento — inteiro, ou so parte de um parcelado.
 *
 * `alcance` e `numero` dizem o que a pessoa escolheu a partir da parcela que
 * clicou (ver `planejarDivisao`). Editar so parte DIVIDE o lancamento: o
 * original fica com as parcelas de antes, sem que nenhuma linha dele seja
 * lida pela barreira ou reescrita, e o alcance vira um lancamento novo. E
 * isso que deixa editar dezembro com novembro travado.
 *
 * A barreira olha as linhas que saem (as do alcance, onde estao hoje) e as que
 * entram (para onde a edicao as leva). Linha movida para o pedaco de depois
 * nao muda nada que a fatura mostre, e nao passa por ela.
 */
export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
  alcance: Alcance = 'TODAS',
  numero?: number,
): Promise<ResultadoEdicao> {
  return prisma.$transaction(async (tx): Promise<ResultadoEdicao> => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const faixa = faixaDoLancamento(original);
    const k = numero ?? faixa.inicial;
    const plano = planejarDivisao(faixa, k, alcance);
    // Com valor TOTAL, o campo da tela mostra o total da compra: "o valor desta
    // parcela" nao tem leitura honesta. A tela nao oferece; aqui e a defesa.
    if (plano.tipo === 'DIVIDIR' && original.origemValor === 'TOTAL') {
      throw new Error('Lancamento com valor total so se edita inteiro');
    }

    const efetiva = alcance === 'SO_ESTA' ? soOValor(original, k, entrada.valorCentavos) : entrada;
    // Recusa tratavel, e nao throw: um total fora dos limites pode chegar de
    // uma tela velha, e o throw virava um 500 sem dizer o que estava errado.
    // Antes de qualquer escrita, entao nao ha o que desfazer.
    const faixaNova = faixaEscrita(plano.alcance, original.numeroParcelas, efetiva.numeroParcelas);
    if (!faixaNova) {
      return {
        ok: false,
        motivo: 'TOTAL_INVALIDO',
        ...limitesDeParcelas(plano.alcance, original.numeroParcelas),
      };
    }
    const competenciaBase = await competenciaBaseDe(tx, efetiva);
    const saem = original.parcelas.filter((p) => dentro(plano.alcance, p.numero));
    const entram = gerarParcelas(paraParcelamento(efetiva, competenciaBase), faixaNova);

    const travada =
      (await travaEntre(tx, original.contaId, original.numeroParcelas, saem)) ??
      (await travaEntre(tx, efetiva.contaId, efetiva.numeroParcelas, entram));
    if (travada) return recusa(travada);

    // O lock otimista de verdade, nos dois caminhos: a leitura de cima pode
    // ter envelhecido. Dividindo, o original so perde a ponta da faixa.
    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data:
        plano.tipo === 'NO_LUGAR'
          ? {
              ...camposGravaveis(efetiva),
              ...colunasDaFaixa(faixaNova, efetiva.numeroParcelas),
              versao: { increment: 1 },
            }
          : {
              ...colunasDaFaixa(plano.original, original.numeroParcelas),
              versao: { increment: 1 },
            },
    });
    if (alteradas.count === 0) return conflito(tx, id);

    const marcas = marcasDe(saem);
    await tx.parcela.deleteMany({
      where: { lancamentoId: id, numero: { gte: plano.alcance.inicial, lte: plano.alcance.final } },
    });

    if (plano.tipo === 'NO_LUGAR') {
      await gravarParcelas(tx, id, entram, efetiva.ehReembolso === true, marcas);
      await tx.rateio.deleteMany({ where: { lancamentoId: id } });
      await gravarRateio(tx, id, efetiva.escopo);
      return { ok: true };
    }

    if (plano.depois) await separar(tx, original, plano.depois, null);

    const novo = await tx.lancamento.create({
      data: { ...camposGravaveis(efetiva), ...colunasDaFaixa(faixaNova, efetiva.numeroParcelas) },
    });
    await gravarParcelas(tx, novo.id, entram, efetiva.ehReembolso === true, marcas);
    await gravarRateio(tx, novo.id, efetiva.escopo);
    return { ok: true };
  });
}

/**
 * Manda para a lixeira um lancamento inteiro, ou so parte de um parcelado.
 *
 * Excluir parte e dividir: o pedaco do alcance vira um lancamento proprio,
 * com as linhas que ja tinha, e nasce excluido — a lixeira o restaura como
 * qualquer outro. A barreira olha so as linhas que saem dos meses.
 */
export async function excluirLancamento(
  id: string,
  versao: number,
  alcance: Alcance = 'TODAS',
  numero?: number,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (!original || original.deletadoEm !== null || original.versao !== versao) {
      return conflito(tx, id);
    }

    const faixa = faixaDoLancamento(original);
    const plano = planejarDivisao(faixa, numero ?? faixa.inicial, alcance);
    const saem = original.parcelas.filter((p) => dentro(plano.alcance, p.numero));

    const travada = await travaEntre(tx, original.contaId, original.numeroParcelas, saem);
    if (travada) return recusa(travada);

    const agora = new Date();
    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data:
        plano.tipo === 'NO_LUGAR'
          ? { deletadoEm: agora, versao: { increment: 1 } }
          : { ...colunasDaFaixa(plano.original, original.numeroParcelas), versao: { increment: 1 } },
    });
    if (alteradas.count === 0) return conflito(tx, id);

    if (plano.tipo === 'DIVIDIR') {
      if (plano.depois) await separar(tx, original, plano.depois, null);
      await separar(tx, original, plano.alcance, agora);
    }
    return { ok: true };
  });
}

/**
 * Liga ou desliga a marca de "ja devolveram" numa parcela de reembolso.
 *
 * **Por parcela, nao por lancamento.** Um parcelado se devolve mes a mes:
 * quando a marca era do lancamento, receber outubro marcava novembro junto.
 * `numero` e a chave estavel da parcela — o id muda a cada edicao, porque
 * `gravarParcelas` recria as parcelas ao reescreve-las.
 *
 * **Nao altera valor nenhum.** O lancamento ja esta fora do gasto do casal e
 * dentro do Somado nos dois estados: ou alguem ainda vai devolver, ou ja
 * devolveu. A marca responde de quem ainda cobrar, e nada mais.
 *
 * O lock otimista continua sendo o do LANCAMENTO, como em toda gravacao dele:
 * sao duas pessoas no mesmo mes, e duas marcando ao mesmo tempo nao podem se
 * sobrescrever em silencio. Lock e marca vao na mesma transacao — separados,
 * uma parcela inexistente gastaria a versao sem marcar nada.
 *
 * `NAO_E_REEMBOLSO` recusa lancamento comum em vez de inventar um status nele.
 * Marcar como recebido o que ninguem deve seria criar reembolso pela porta dos
 * fundos, sem devedor e sem a pessoa ter pedido.
 */
export async function marcarReembolso(
  id: string,
  versao: number,
  numero: number,
  recebido: boolean,
): Promise<ResultadoGravacao | { ok: false; motivo: 'NAO_E_REEMBOLSO' }> {
  return prisma.$transaction(async (tx) => {
    const atual = await tx.lancamento.findUnique({
      where: { id },
      select: { statusReembolso: true },
    });
    if (atual && atual.statusReembolso === null) {
      return { ok: false, motivo: 'NAO_E_REEMBOLSO' } as const;
    }

    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null, statusReembolso: { not: null } },
      data: { versao: { increment: 1 } },
    });
    if (alteradas.count === 0) {
      const encontrado = await tx.lancamento.findUnique({ where: { id } });
      return { ok: false, motivo: 'CONFLITO', atual: encontrado } as const;
    }

    const marcadas = await tx.parcela.updateMany({
      where: { lancamentoId: id, numero },
      data: { reembolsoRecebido: recebido },
    });
    // A tela so oferece parcela que existe; chegar aqui e defeito, nao
    // conflito. O throw desfaz o incremento da versao junto.
    if (marcadas.count === 0) {
      throw new Error(`Lancamento ${id} nao tem parcela ${numero}`);
    }
    return { ok: true } as const;
  });
}

/**
 * Tira um lancamento da lixeira, com as parcelas que ele ja tinha.
 *
 * Par de `excluirLancamento`: aquela grava `deletadoEm`, esta limpa. As
 * parcelas nunca sairam do banco, entao nao ha o que regerar — restaurar nao
 * recalcula valor nem competencia, e um parcelado volta exatamente onde estava.
 *
 * **A barreira de fatura travada e verificada DE NOVO aqui, e esse e o ponto
 * nao obvio.** Excluir ja recusa quando ha parcela em mes fechado, entao nada
 * na lixeira foi excluido de um mes travado — mas a fatura pode ter sido
 * travada DEPOIS. Restaurar ali dentro devolveria uma parcela para um mes que
 * alguem ja conferiu e fechou, mudando um total dado por bom.
 *
 * Na transacao pelo mesmo motivo das outras gravacoes: conferir fora deixa uma
 * janela entre a conferencia e a escrita.
 */
export async function restaurarLancamento(
  id: string,
  versao: number,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    const original = await lerOriginal(tx, id);
    if (original) {
      const travada = await travaEntre(tx, original.contaId, original.numeroParcelas, original.parcelas);
      if (travada) return recusa(travada);
    }

    const alteradas = await tx.lancamento.updateMany({
      // `deletadoEm: { not: null }` em vez do `deletadoEm: null` das outras
      // gravacoes: aqui o alvo e justamente o que esta na lixeira.
      where: { id, versao, deletadoEm: { not: null } },
      data: { deletadoEm: null, versao: { increment: 1 } },
    });

    if (alteradas.count === 0) return conflito(tx, id);
    return { ok: true };
  });
}
