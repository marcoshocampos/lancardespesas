import { competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import { gerarParcelas } from '@/domain/parcelamento';
import { pesosMeioAMeio } from '@/domain/rateio';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Cliente de banco que serve tanto o `prisma` solto quanto o `tx` de dentro de
 * uma transacao. Todo helper daqui recebe um, em vez de fechar sobre o
 * `prisma` global: e o que permite as gravacoes rodarem como uma coisa so.
 *
 * Sem isto, uma falha no meio de `gravarFilhos` deixava lancamento sem parcela
 * nenhuma — ele desaparecia da grade e continuava existindo no banco.
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
  /** Alguem de fora vai devolver: fica na fatura, sai do gasto do casal. */
  ehReembolso?: boolean | undefined;
  /** Quem vai devolver. So faz sentido com `ehReembolso`. */
  devedorNome?: string | undefined;
};

export type ResultadoGravacao =
  | { ok: true }
  | { ok: false; motivo: 'CONFLITO' | 'FATURA_TRAVADA'; atual?: unknown };

export type ResultadoCriacao = { ok: true; id: string } | { ok: false; motivo: 'FATURA_TRAVADA' };

/**
 * Os campos de reembolso, prontos para o Prisma.
 *
 * `statusReembolso` nulo e o que significa "nao e reembolso" — e o que
 * `carregarParcelasDaCompetencia` testa. O nome do devedor so sobrevive junto
 * com o status: desligar a marca e deixar o nome gravado produziria um
 * lancamento comum carregando o nome de quem devia, que reapareceria do nada
 * se alguem religasse a marca.
 *
 * `statusAtual` existe para a EDICAO nao rebaixar um reembolso ja recebido de
 * volta para pendente. Quem ja devolveu continua tendo devolvido depois de
 * alguem corrigir a descricao do lancamento.
 */
function camposDeReembolso(
  entrada: EntradaLancamento,
  statusAtual?: 'PENDENTE' | 'RECEBIDO' | null,
): { statusReembolso: 'PENDENTE' | 'RECEBIDO' | null; devedorNome: string | null } {
  if (!entrada.ehReembolso) return { statusReembolso: null, devedorNome: null };

  const nome = entrada.devedorNome?.trim();
  return {
    statusReembolso: statusAtual === 'RECEBIDO' ? 'RECEBIDO' : 'PENDENTE',
    devedorNome: nome ? nome : null,
  };
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

/**
 * As competencias que as parcelas DESTA entrada vao ocupar, se gravada.
 *
 * Recebe a `competenciaBase` em vez de busca-la: `competenciaBaseDe` le a conta
 * no banco, e esta funcao era chamada no mesmo fluxo que `gravarFilhos`, que
 * lia a conta DE NOVO. Duas idas ao Neon para a mesma pergunta, dentro da mesma
 * transacao. Com o parametro, a funcao virou pura de quebra.
 */
function competenciasDe(entrada: EntradaLancamento, competenciaBase: string): string[] {
  return gerarParcelas({
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  }).map((p) => p.competencia);
}

/** Ha fatura TRAVADA entre as competencias informadas, nesta conta? */
async function temFaturaTravada(
  db: ClienteBanco,
  contaId: string,
  competencias: string[],
): Promise<boolean> {
  if (competencias.length === 0) return false;
  const travada = await db.fatura.findFirst({
    where: { status: 'TRAVADA', contaId, competencia: { in: competencias } },
  });
  return travada !== null;
}

/** Ha fatura TRAVADA nas competencias ONDE AS PARCELAS JA ESTAO GRAVADAS. */
async function competenciasTravadas(db: ClienteBanco, lancamentoId: string): Promise<boolean> {
  const parcelas = await db.parcela.findMany({
    where: { lancamentoId },
    select: { competencia: true, lancamento: { select: { contaId: true } } },
  });
  if (parcelas.length === 0) return false;

  const travada = await db.fatura.findFirst({
    where: {
      status: 'TRAVADA',
      OR: parcelas.map((p) => ({
        contaId: p.lancamento.contaId,
        competencia: p.competencia,
      })),
    },
  });
  return travada !== null;
}

/**
 * Regrava parcelas e rateios de um lancamento.
 *
 * `recemCriado` existe por custo medido, nao por elegancia. Cada ida ao Neon
 * custa ~45 ms, e um lancamento que acabou de nascer na linha de cima **nao tem
 * filho nenhum**: procurar parcela cancelada para preservar, apagar parcela e
 * apagar rateio sao tres consultas que nao encontram nada. Com a conta lida uma
 * vez so (`competenciaBase` vem pronta), a criacao caiu de 10 consultas para 6,
 * de ~420 ms para ~250 ms.
 *
 * Na EDICAO as tres continuam indispensaveis: ha parcelas velhas para apagar, e
 * o cancelamento precisa sobreviver a regeracao.
 *
 * **Passar `recemCriado: true` para um lancamento que ja existe duplica parcela**
 * — o `createMany` roda sem o `deleteMany` antes. So `criarLancamento` pode
 * passar true, e so porque criou o registro na transacao corrente.
 */
async function gravarFilhos(
  db: ClienteBanco,
  lancamentoId: string,
  entrada: EntradaLancamento,
  competenciaBase: string,
  recemCriado: boolean,
): Promise<void> {
  const parcelas = gerarParcelas({
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  });

  // Parcela cancelada (quitacao antecipada) nao pode "ressuscitar" so porque
  // o lancamento foi editado e as parcelas foram recriadas do zero.
  // Preservamos o cancelamento pelo numero, a chave estavel entre a versao
  // antiga e a nova (unique com o lancamentoId).
  const numerosCancelados = new Set<number>();
  if (!recemCriado) {
    const canceladas = await db.parcela.findMany({
      where: { lancamentoId, cancelada: true },
      select: { numero: true },
    });
    for (const p of canceladas) numerosCancelados.add(p.numero);

    await db.parcela.deleteMany({ where: { lancamentoId } });
  }

  await db.parcela.createMany({
    data: parcelas.map((p) => ({
      ...p,
      lancamentoId,
      cancelada: numerosCancelados.has(p.numero),
    })),
  });

  if (!recemCriado) await db.rateio.deleteMany({ where: { lancamentoId } });
  if (entrada.escopo === 'CONJUNTO') {
    const membros = await db.membro.findMany({
      where: { ativo: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    // Gravamos apenas os percentuais. O valor de cada cota e calculado por
    // ratear() na leitura, sobre o valor DA PARCELA — ver Tarefa 10.
    const pesos = pesosMeioAMeio(membros.map((m) => m.id));
    await db.rateio.createMany({
      data: pesos.map((p) => ({ lancamentoId, membroId: p.membroId, percentual: p.percentual })),
    });
  }
}

export async function criarLancamento(entrada: EntradaLancamento): Promise<ResultadoCriacao> {
  // A trava fica DENTRO da transacao junto com a gravacao: conferir fora
  // deixava uma janela em que a outra pessoa travava a fatura entre a
  // verificacao e a escrita, e a parcela entrava num mes fechado.
  return prisma.$transaction(async (tx) => {
    // Lida UMA vez e levada ate `gravarFilhos`: antes, a conta era consultada
    // aqui e de novo la dentro, duas idas ao Neon pela mesma resposta.
    const competenciaBase = await competenciaBaseDe(tx, entrada);

    if (await temFaturaTravada(tx, entrada.contaId, competenciasDe(entrada, competenciaBase))) {
      return { ok: false, motivo: 'FATURA_TRAVADA' };
    }

    const lancamento = await tx.lancamento.create({
      data: {
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
      },
    });

    await gravarFilhos(tx, lancamento.id, entrada, competenciaBase, true);
    return { ok: true, id: lancamento.id };
  });
}

export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    // Origem: onde as parcelas ja gravadas estao hoje.
    if (await competenciasTravadas(tx, id)) return { ok: false, motivo: 'FATURA_TRAVADA' };
    // Destino: para onde a edicao levaria as parcelas (contaId, dataCompra ou
    // competenciaManual podem mudar a competencia).
    const competenciaBase = await competenciaBaseDe(tx, entrada);
    if (await temFaturaTravada(tx, entrada.contaId, competenciasDe(entrada, competenciaBase))) {
      return { ok: false, motivo: 'FATURA_TRAVADA' };
    }

    // Lido antes da gravacao, dentro da mesma transacao: e o que impede a
    // edicao de rebaixar um reembolso ja RECEBIDO de volta para PENDENTE.
    const anterior = await tx.lancamento.findUnique({
      where: { id },
      select: { statusReembolso: true },
    });

    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data: {
        descricao: entrada.descricao,
        valorCentavos: entrada.valorCentavos,
        origemValor: entrada.origemValor,
        dataCompra: entrada.dataCompra,
        numeroParcelas: entrada.numeroParcelas,
        escopo: entrada.escopo,
        contaId: entrada.contaId,
        categoriaId: entrada.categoriaId,
        membroId: entrada.escopo === 'PESSOAL' ? (entrada.membroId ?? null) : null,
        ...camposDeReembolso(entrada, anterior?.statusReembolso ?? null),
        versao: { increment: 1 },
      },
    });

    if (alteradas.count === 0) {
      const atual = await tx.lancamento.findUnique({ where: { id } });
      return { ok: false, motivo: 'CONFLITO', atual };
    }

    // Versao incrementada e filhos regravados na mesma transacao. Separados,
    // uma falha aqui deixava o lancamento com os valores novos, as parcelas
    // velhas, e a versao ja gasta — a retentativa caia em CONFLITO.
    await gravarFilhos(tx, id, entrada, competenciaBase, false);
    return { ok: true };
  });
}

export async function excluirLancamento(id: string, versao: number): Promise<ResultadoGravacao> {
  return prisma.$transaction(async (tx) => {
    if (await competenciasTravadas(tx, id)) return { ok: false, motivo: 'FATURA_TRAVADA' };

    const alteradas = await tx.lancamento.updateMany({
      where: { id, versao, deletadoEm: null },
      data: { deletadoEm: new Date(), versao: { increment: 1 } },
    });

    if (alteradas.count === 0) {
      const atual = await tx.lancamento.findUnique({ where: { id } });
      return { ok: false, motivo: 'CONFLITO', atual };
    }
    return { ok: true };
  });
}

/**
 * Liga ou desliga a marca de "ja devolveram" num reembolso.
 *
 * **Nao altera valor nenhum.** O lancamento ja esta fora do gasto do casal e
 * dentro do Somado nos dois estados: ou alguem ainda vai devolver, ou ja
 * devolveu. A marca responde de quem ainda cobrar, e nada mais.
 *
 * Mesmo lock otimista das outras gravacoes — sao duas pessoas no mesmo mes, e
 * duas marcando ao mesmo tempo nao podem se sobrescrever em silencio. Uma
 * escrita so, entao sem transacao: nao ha o que ficar pela metade.
 *
 * `NAO_E_REEMBOLSO` recusa lancamento comum em vez de inventar um status nele.
 * Marcar como recebido o que ninguem deve seria criar reembolso pela porta dos
 * fundos, sem devedor e sem a pessoa ter pedido.
 */
export async function marcarReembolso(
  id: string,
  versao: number,
  recebido: boolean,
): Promise<ResultadoGravacao | { ok: false; motivo: 'NAO_E_REEMBOLSO' }> {
  const atual = await prisma.lancamento.findUnique({
    where: { id },
    select: { statusReembolso: true },
  });
  if (atual && atual.statusReembolso === null) {
    return { ok: false, motivo: 'NAO_E_REEMBOLSO' };
  }

  const alteradas = await prisma.lancamento.updateMany({
    where: { id, versao, deletadoEm: null, statusReembolso: { not: null } },
    data: { statusReembolso: recebido ? 'RECEBIDO' : 'PENDENTE', versao: { increment: 1 } },
  });

  if (alteradas.count === 0) {
    const encontrado = await prisma.lancamento.findUnique({ where: { id } });
    return { ok: false, motivo: 'CONFLITO', atual: encontrado };
  }
  return { ok: true };
}
