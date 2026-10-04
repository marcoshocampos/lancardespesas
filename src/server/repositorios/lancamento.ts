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
};

export type ResultadoGravacao =
  | { ok: true }
  | { ok: false; motivo: 'CONFLITO' | 'FATURA_TRAVADA'; atual?: unknown };

export type ResultadoCriacao = { ok: true; id: string } | { ok: false; motivo: 'FATURA_TRAVADA' };

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

/** As competencias que as parcelas DESTA entrada vao ocupar, se gravada. */
async function competenciasDe(db: ClienteBanco, entrada: EntradaLancamento): Promise<string[]> {
  const competenciaBase = await competenciaBaseDe(db, entrada);
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

async function gravarFilhos(
  db: ClienteBanco,
  lancamentoId: string,
  entrada: EntradaLancamento,
): Promise<void> {
  const competenciaBase = await competenciaBaseDe(db, entrada);

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
  const canceladas = await db.parcela.findMany({
    where: { lancamentoId, cancelada: true },
    select: { numero: true },
  });
  const numerosCancelados = new Set(canceladas.map((p) => p.numero));

  await db.parcela.deleteMany({ where: { lancamentoId } });
  await db.parcela.createMany({
    data: parcelas.map((p) => ({
      ...p,
      lancamentoId,
      cancelada: numerosCancelados.has(p.numero),
    })),
  });

  await db.rateio.deleteMany({ where: { lancamentoId } });
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
    if (await temFaturaTravada(tx, entrada.contaId, await competenciasDe(tx, entrada))) {
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
      },
    });

    await gravarFilhos(tx, lancamento.id, entrada);
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
    if (await temFaturaTravada(tx, entrada.contaId, await competenciasDe(tx, entrada))) {
      return { ok: false, motivo: 'FATURA_TRAVADA' };
    }

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
    await gravarFilhos(tx, id, entrada);
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
