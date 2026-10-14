import { prisma } from '../db';

export type ItemDaLixeira = {
  lancamentoId: string;
  versao: number;
  descricao: string;
  /** O valor do LANCAMENTO, nao o da parcela: o que volta e o lancamento inteiro. */
  valorCentavos: number;
  origemValor: 'POR_PARCELA' | 'TOTAL';
  numeroParcelas: number;
  dataCompra: string;
  contaNome: string;
  categoriaNome: string;
  /** Quem gastou. `null` em lancamento de conjunto. */
  membroNome: string | null;
  escopo: 'PESSOAL' | 'CONJUNTO';
  excluidoEm: Date;
  /**
   * A faixa de competencias que as parcelas ocupam, `null` se o lancamento
   * nao tiver nenhuma. Responde "onde isto reaparece se eu restaurar" — numa
   * lista que atravessa meses, isso nao e obvio pelo resto da linha.
   */
  primeiraCompetencia: string | null;
  ultimaCompetencia: string | null;
};

/**
 * Os lancamentos na lixeira, mais recentes primeiro.
 *
 * Lista por LANCAMENTO, nunca por parcela — ao contrario de toda outra leitura
 * do sistema. Excluir apaga o lancamento inteiro, e mostrar doze linhas de um
 * parcelado mentiria sobre o que volta ao restaurar.
 *
 * E a unica leitura que **nao** recebe competencia: o que se procura aqui e "o
 * que eu acabei de excluir", nao "o que foi excluido em setembro". Quem exclui
 * por engano percebe em minutos, nao no fechamento do mes.
 *
 * Sem paginacao de proposito: o invariante 6 diz que nada e apagado de verdade,
 * entao a lista so cresce — mas cresce na velocidade em que duas pessoas
 * excluem lancamento, que e quase nenhuma. Quando incomodar, o remedio e um
 * limite aqui, e nao apagar o que elas pediram para guardar.
 */
export async function carregarLixeira(): Promise<ItemDaLixeira[]> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { deletadoEm: { not: null } },
    select: {
      id: true,
      versao: true,
      descricao: true,
      valorCentavos: true,
      origemValor: true,
      numeroParcelas: true,
      dataCompra: true,
      escopo: true,
      deletadoEm: true,
      conta: { select: { nome: true } },
      categoria: { select: { nome: true } },
      membro: { select: { nome: true } },
      // Cancelada inclusive: ela continua sendo uma competencia que o
      // lancamento ocupa, e some junto com ele.
      parcelas: { select: { competencia: true }, orderBy: { competencia: 'asc' } },
    },
    orderBy: { deletadoEm: 'desc' },
  });

  return lancamentos.map((l) => {
    const competencias = l.parcelas.map((p) => p.competencia);
    return {
      lancamentoId: l.id,
      versao: l.versao,
      descricao: l.descricao,
      valorCentavos: l.valorCentavos,
      origemValor: l.origemValor,
      numeroParcelas: l.numeroParcelas,
      dataCompra: l.dataCompra,
      contaNome: l.conta.nome,
      categoriaNome: l.categoria.nome,
      membroNome: l.membro?.nome ?? null,
      escopo: l.escopo,
      // O `where` garante que nao e null; o TypeScript nao sabe disso.
      excluidoEm: l.deletadoEm as Date,
      primeiraCompetencia: competencias[0] ?? null,
      ultimaCompetencia: competencias[competencias.length - 1] ?? null,
    };
  });
}
