import { competenciaDeCartao, competenciaDeContaExterna } from '@/domain/competencia';
import { gerarParcelas } from '@/domain/parcelamento';
import { pesosMeioAMeio } from '@/domain/rateio';
import { prisma } from '../db';

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

async function competenciaBaseDe(entrada: EntradaLancamento): Promise<string> {
  if (entrada.competenciaManual) return entrada.competenciaManual;

  const conta = await prisma.conta.findUniqueOrThrow({ where: { id: entrada.contaId } });
  if (conta.tipo === 'CARTAO') {
    if (conta.diaFechamento === null) {
      throw new Error(`Conta de cartao sem dia de fechamento: ${conta.nome}`);
    }
    return competenciaDeCartao(entrada.dataCompra, conta.diaFechamento);
  }
  return competenciaDeContaExterna(entrada.dataCompra);
}

/** As competencias que as parcelas DESTA entrada vao ocupar, se gravada. */
async function competenciasDe(entrada: EntradaLancamento): Promise<string[]> {
  const competenciaBase = await competenciaBaseDe(entrada);
  return gerarParcelas({
    valorCentavos: entrada.valorCentavos,
    origem: entrada.origemValor,
    numeroParcelas: entrada.numeroParcelas,
    competenciaBase,
  }).map((p) => p.competencia);
}

/** Ha fatura TRAVADA entre as competencias informadas, nesta conta? */
async function temFaturaTravada(contaId: string, competencias: string[]): Promise<boolean> {
  if (competencias.length === 0) return false;
  const travada = await prisma.fatura.findFirst({
    where: { status: 'TRAVADA', contaId, competencia: { in: competencias } },
  });
  return travada !== null;
}

/** Ha fatura TRAVADA nas competencias ONDE AS PARCELAS JA ESTAO GRAVADAS. */
async function competenciasTravadas(lancamentoId: string): Promise<boolean> {
  const parcelas = await prisma.parcela.findMany({
    where: { lancamentoId },
    select: { competencia: true, lancamento: { select: { contaId: true } } },
  });
  if (parcelas.length === 0) return false;

  const travada = await prisma.fatura.findFirst({
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

async function gravarFilhos(lancamentoId: string, entrada: EntradaLancamento): Promise<void> {
  const competenciaBase = await competenciaBaseDe(entrada);

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
  const canceladas = await prisma.parcela.findMany({
    where: { lancamentoId, cancelada: true },
    select: { numero: true },
  });
  const numerosCancelados = new Set(canceladas.map((p) => p.numero));

  await prisma.parcela.deleteMany({ where: { lancamentoId } });
  await prisma.parcela.createMany({
    data: parcelas.map((p) => ({
      ...p,
      lancamentoId,
      cancelada: numerosCancelados.has(p.numero),
    })),
  });

  await prisma.rateio.deleteMany({ where: { lancamentoId } });
  if (entrada.escopo === 'CONJUNTO') {
    const membros = await prisma.membro.findMany({
      where: { ativo: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    // Gravamos apenas os percentuais. O valor de cada cota e calculado por
    // ratear() na leitura, sobre o valor DA PARCELA — ver Tarefa 10.
    const pesos = pesosMeioAMeio(membros.map((m) => m.id));
    await prisma.rateio.createMany({
      data: pesos.map((p) => ({ lancamentoId, membroId: p.membroId, percentual: p.percentual })),
    });
  }
}

export async function criarLancamento(entrada: EntradaLancamento): Promise<ResultadoCriacao> {
  if (await temFaturaTravada(entrada.contaId, await competenciasDe(entrada))) {
    return { ok: false, motivo: 'FATURA_TRAVADA' };
  }

  const lancamento = await prisma.lancamento.create({
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

  await gravarFilhos(lancamento.id, entrada);
  return { ok: true, id: lancamento.id };
}

export async function editarLancamento(
  id: string,
  versao: number,
  entrada: EntradaLancamento,
): Promise<ResultadoGravacao> {
  // Origem: onde as parcelas ja gravadas estao hoje.
  if (await competenciasTravadas(id)) return { ok: false, motivo: 'FATURA_TRAVADA' };
  // Destino: para onde a edicao levaria as parcelas (contaId, dataCompra ou
  // competenciaManual podem mudar a competencia).
  if (await temFaturaTravada(entrada.contaId, await competenciasDe(entrada))) {
    return { ok: false, motivo: 'FATURA_TRAVADA' };
  }

  const alteradas = await prisma.lancamento.updateMany({
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
    const atual = await prisma.lancamento.findUnique({ where: { id } });
    return { ok: false, motivo: 'CONFLITO', atual };
  }

  await gravarFilhos(id, entrada);
  return { ok: true };
}

export async function excluirLancamento(id: string, versao: number): Promise<ResultadoGravacao> {
  if (await competenciasTravadas(id)) return { ok: false, motivo: 'FATURA_TRAVADA' };

  const alteradas = await prisma.lancamento.updateMany({
    where: { id, versao, deletadoEm: null },
    data: { deletadoEm: new Date(), versao: { increment: 1 } },
  });

  if (alteradas.count === 0) {
    const atual = await prisma.lancamento.findUnique({ where: { id } });
    return { ok: false, motivo: 'CONFLITO', atual };
  }
  return { ok: true };
}
