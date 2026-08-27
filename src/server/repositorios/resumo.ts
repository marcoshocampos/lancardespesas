import { ratear } from '@/domain/rateio';
import type { ParcelaResumo } from '@/domain/totais';
import { prisma } from '../db';

export type LinhaGrade = {
  parcelaId: string;
  lancamentoId: string;
  versao: number;
  dataCompra: string;
  descricao: string;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroNome: string | null;
  categoriaNome: string;
  numero: number;
  numeroParcelas: number;
  valorCentavos: number;
  contaNome: string;
  ehReembolso: boolean;
};

const PARCELA_VISIVEL = { cancelada: false, lancamento: { deletadoEm: null } };

export async function carregarParcelasDaCompetencia(
  competencia: string,
): Promise<ParcelaResumo[]> {
  const parcelas = await prisma.parcela.findMany({
    where: { competencia, ...PARCELA_VISIVEL },
    include: {
      lancamento: {
        select: {
          contaId: true,
          escopo: true,
          membroId: true,
          // Mesma ordem da gravacao (lancamento.ts, gravarFilhos): ratear() joga o resto
          // de centavos no primeiro peso da lista, e isso so fica estavel entre leituras
          // se a ordem for sempre a mesma — o membro mais antigo por cadastro.
          rateios: {
            select: { membroId: true, percentual: true },
            orderBy: { membro: { criadoEm: 'asc' } },
          },
        },
      },
    },
  });

  return parcelas.map((p) => {
    const { lancamento } = p;
    if (lancamento.escopo === 'PESSOAL') {
      return {
        contaId: lancamento.contaId,
        escopo: 'PESSOAL' as const,
        // exactOptionalPropertyTypes proibe `membroId: undefined` explicito
        // (o brief tinha `?? undefined`); a chave so pode existir se houver valor.
        ...(lancamento.membroId ? { membroId: lancamento.membroId } : {}),
        valorCentavos: p.valorCentavos,
      };
    }
    // O rateio e calculado sobre o valor DA PARCELA, nao do lancamento: um
    // parcelado de conjunto rateia 101,01 por mes, nao o total da compra.
    return {
      contaId: lancamento.contaId,
      escopo: 'CONJUNTO' as const,
      valorCentavos: p.valorCentavos,
      cotas: ratear(p.valorCentavos, lancamento.rateios),
    };
  });
}

export async function carregarLinhasDaGrade(
  competencia: string,
  contaId?: string,
): Promise<LinhaGrade[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      competencia,
      ...PARCELA_VISIVEL,
      ...(contaId ? { lancamento: { contaId, deletadoEm: null } } : {}),
    },
    include: {
      lancamento: {
        include: {
          membro: { select: { nome: true } },
          categoria: { select: { nome: true } },
          conta: { select: { nome: true } },
        },
      },
    },
    orderBy: [{ lancamento: { dataCompra: 'asc' } }, { numero: 'asc' }],
  });

  return parcelas.map((p) => ({
    parcelaId: p.id,
    lancamentoId: p.lancamentoId,
    versao: p.lancamento.versao,
    dataCompra: p.lancamento.dataCompra,
    descricao: p.lancamento.descricao,
    escopo: p.lancamento.escopo,
    membroNome: p.lancamento.membro?.nome ?? null,
    categoriaNome: p.lancamento.categoria.nome,
    numero: p.numero,
    numeroParcelas: p.lancamento.numeroParcelas,
    valorCentavos: p.valorCentavos,
    contaNome: p.lancamento.conta.nome,
    ehReembolso: p.lancamento.statusReembolso !== null,
  }));
}
