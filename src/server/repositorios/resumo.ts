import { ratear } from '@/domain/rateio';
import type { ParcelaResumo } from '@/domain/totais';
import { prisma } from '../db';

export type LinhaGrade = {
  parcelaId: string;
  lancamentoId: string;
  versao: number;
  dataCompra: string;
  descricao: string;
  // O valor DIGITADO na criacao do lancamento — nao o da parcela (`valorCentavos`
  // abaixo). Com origemValor TOTAL os dois divergem: a parcela e uma fracao. E o
  // que o formulario de edicao precisa reenviar para nao encolher o total ao salvar
  // sem mudar nada. Ver nota na Tarefa 15 sobre por que o brief nao pedia isto.
  lancamentoValorCentavos: number;
  origemValor: 'POR_PARCELA' | 'TOTAL';
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroId: string | null;
  membroNome: string | null;
  categoriaId: string;
  categoriaNome: string;
  numero: number;
  numeroParcelas: number;
  valorCentavos: number;
  contaId: string;
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
          // ratear() joga o resto de centavos no primeiro peso da lista — quem
          // absorve a sobra e escolha explicita em Membro.absorveSobra, nao mais
          // um efeito da ordem de cadastro (ver docs/decisoes.md). O desempate
          // por criadoEm so entra se, por engano, mais de um membro tiver
          // absorveSobra=true; sem ele a ordem volta a depender do Postgres.
          rateios: {
            select: { membroId: true, percentual: true },
            orderBy: [{ membro: { absorveSobra: 'desc' } }, { membro: { criadoEm: 'asc' } }],
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
    lancamentoValorCentavos: p.lancamento.valorCentavos,
    origemValor: p.lancamento.origemValor,
    escopo: p.lancamento.escopo,
    // Os ids sao colunas escalares do proprio lancamento (contaId, categoriaId,
    // membroId) — ja vem no `include` sem precisar pedir `id` de cada relacao.
    membroId: p.lancamento.membroId,
    membroNome: p.lancamento.membro?.nome ?? null,
    categoriaId: p.lancamento.categoriaId,
    categoriaNome: p.lancamento.categoria.nome,
    numero: p.numero,
    numeroParcelas: p.lancamento.numeroParcelas,
    valorCentavos: p.valorCentavos,
    contaId: p.lancamento.contaId,
    contaNome: p.lancamento.conta.nome,
    ehReembolso: p.lancamento.statusReembolso !== null,
  }));
}
