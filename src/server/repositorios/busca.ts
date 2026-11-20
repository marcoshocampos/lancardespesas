import { competenciaDeDestino, correspondeABusca, interpretarBusca } from '@/domain/busca';
import { faixaDoLancamento } from '@/domain/divisao';
import type { Faixa } from '@/domain/parcelamento';
import { prisma } from '../db';

/** Quantos resultados a tela mostra. Acima disso, ela pede um termo mais especifico. */
export const LIMITE_DA_BUSCA = 50;

export type ItemDaBusca = {
  lancamentoId: string;
  descricao: string;
  dataCompra: string;
  /** O valor do LANCAMENTO: a soma das parcelas dele, canceladas inclusive. De um pedaco, o do pedaco. */
  totalCentavos: number;
  numeroParcelas: number;
  /** As parcelas que este lancamento tem: um pedaco de parcelado nao tem a compra inteira. */
  faixa: Faixa;
  contaNome: string;
  categoriaNome: string;
  /** Quem gastou. `null` em lancamento de conjunto. */
  membroNome: string | null;
  escopo: 'PESSOAL' | 'CONJUNTO';
  ehReembolso: boolean;
  devedorNome: string | null;
  /** A faixa de meses em que o lancamento APARECE — so parcelas nao canceladas. */
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
  /** Para onde o clique leva. `null` quando toda parcela foi cancelada. */
  competenciaDestino: string | null;
};

export type ResultadoDaBusca = {
  /** Ate `limite` itens, do mais recente para o mais antigo. */
  itens: ItemDaBusca[];
  /** Quantos corresponderam ao todo — maior que `itens.length` quando houve corte. */
  total: number;
};

/**
 * Busca em todos os meses, por texto ou por valor (regra em `@/domain/busca`).
 *
 * Carrega TODO lancamento nao excluido e filtra em memoria, de proposito: o
 * Postgres nao ignora acento sem a extensao `unaccent`, e o volume do casal —
 * da ordem de 600 lancamentos por ano — cabe numa leitura so das colunas que a
 * lista mostra. Quando pesar, o remedio e pre-filtrar aqui antes de normalizar,
 * nao trocar a regra. Ver docs/decisoes.md.
 *
 * `competenciaDeOrigem` e o mes que o Despesas estava mostrando: decide para
 * qual parcela de um parcelado o clique leva.
 */
export async function buscarLancamentos(
  termo: string,
  competenciaDeOrigem: string,
  limite: number = LIMITE_DA_BUSCA,
): Promise<ResultadoDaBusca> {
  const busca = interpretarBusca(termo);
  if (!busca) return { itens: [], total: 0 };

  const lancamentos = await prisma.lancamento.findMany({
    where: { deletadoEm: null },
    select: {
      id: true,
      descricao: true,
      dataCompra: true,
      numeroParcelas: true,
      parcelaInicial: true,
      parcelaFinal: true,
      escopo: true,
      devedorNome: true,
      statusReembolso: true,
      conta: { select: { nome: true } },
      categoria: { select: { nome: true } },
      membro: { select: { nome: true } },
      // Por numero, que e a ordem dos meses: a parcela n+1 cai no mes seguinte.
      parcelas: {
        select: { competencia: true, valorCentavos: true, cancelada: true },
        orderBy: { numero: 'asc' },
      },
    },
    orderBy: [{ dataCompra: 'desc' }, { criadoEm: 'desc' }],
  });

  const encontrados = lancamentos.filter((l) => correspondeABusca(busca, l));

  return {
    total: encontrados.length,
    itens: encontrados.slice(0, limite).map((l) => {
      const ativas = l.parcelas.filter((p) => !p.cancelada).map((p) => p.competencia);
      return {
        lancamentoId: l.id,
        descricao: l.descricao,
        dataCompra: l.dataCompra,
        totalCentavos: l.parcelas.reduce((soma, p) => soma + p.valorCentavos, 0),
        numeroParcelas: l.numeroParcelas,
        faixa: faixaDoLancamento(l),
        contaNome: l.conta.nome,
        categoriaNome: l.categoria.nome,
        membroNome: l.membro?.nome ?? null,
        escopo: l.escopo,
        ehReembolso: l.statusReembolso !== null,
        devedorNome: l.devedorNome,
        primeiraCompetencia: ativas[0] ?? null,
        ultimaCompetencia: ativas[ativas.length - 1] ?? null,
        competenciaDestino: competenciaDeDestino(ativas, competenciaDeOrigem),
      };
    }),
  };
}
