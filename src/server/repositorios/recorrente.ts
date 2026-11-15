import { Prisma } from '@prisma/client';
import { dataDaRecorrente, recorrentesPendentes } from '@/domain/recorrencia';
import { prisma } from '../db';
import { criarLancamento } from './lancamento';

export type DadosDaRecorrente = {
  descricao: string;
  valorCentavos: number;
  escopo: 'PESSOAL' | 'CONJUNTO';
  membroId?: string | undefined;
  contaId: string;
  categoriaId: string;
  diaDoMes: number;
  competenciaInicio: string;
};

const COM_NOMES = {
  conta: { select: { nome: true, tipo: true, diaFechamento: true, ativa: true } },
  categoria: { select: { nome: true } },
  membro: { select: { nome: true } },
} as const;

export type RecorrenteComNomes = Prisma.RecorrenteGetPayload<{ include: typeof COM_NOMES }>;

/** Todas, ativas e desativadas: Configuracoes e a unica tela de onde se reativa. */
export async function carregarRecorrentes(): Promise<RecorrenteComNomes[]> {
  return prisma.recorrente.findMany({
    include: COM_NOMES,
    orderBy: [{ ativa: 'desc' }, { descricao: 'asc' }],
  });
}

function camposGravaveis(dados: DadosDaRecorrente) {
  return {
    descricao: dados.descricao,
    valorCentavos: dados.valorCentavos,
    escopo: dados.escopo,
    // Mesma regra do lancamento: conjunto nao tem dono.
    membroId: dados.escopo === 'PESSOAL' ? (dados.membroId ?? null) : null,
    contaId: dados.contaId,
    categoriaId: dados.categoriaId,
    diaDoMes: dados.diaDoMes,
    competenciaInicio: dados.competenciaInicio,
  };
}

export async function criarRecorrente(dados: DadosDaRecorrente): Promise<{ id: string }> {
  const criada = await prisma.recorrente.create({ data: camposGravaveis(dados), select: { id: true } });
  return criada;
}

/**
 * Editar vale **dali pra frente**. Os lancamentos que a recorrente ja gerou sao
 * copias independentes — mudar o valor aqui nao reescreve mes nenhum, que e o
 * que a regra de negocio pede ("nao retroage") e sai de graca do desenho.
 *
 * `ativa` entra aqui e nao em funcao propria: encerrar uma recorrente e
 * desativar, e desativar e so mais um campo do mesmo formulario.
 */
export async function editarRecorrente(
  id: string,
  dados: DadosDaRecorrente & { ativa: boolean },
): Promise<{ ok: true } | { ok: false; motivo: 'NAO_ENCONTRADA' }> {
  const alteradas = await prisma.recorrente.updateMany({
    where: { id },
    data: { ...camposGravaveis(dados), ativa: dados.ativa },
  });
  return alteradas.count === 0 ? { ok: false, motivo: 'NAO_ENCONTRADA' } : { ok: true };
}

export type RecorrentePendente = {
  id: string;
  descricao: string;
  valorCentavos: number;
};

/** As pendentes com tudo que gerar o lancamento precisa. Uso interno e da faixa. */
async function pendentesCompletas(competencia: string): Promise<RecorrenteComNomes[]> {
  const [recorrentes, geradas, travadas] = await Promise.all([
    prisma.recorrente.findMany({
      // Conta desativada nao recebe lancamento novo — mesma leitura do painel,
      // que nao a oferece. A recorrente fica quieta ate a conta voltar.
      where: { ativa: true, competenciaInicio: { lte: competencia }, conta: { ativa: true } },
      include: COM_NOMES,
      orderBy: { descricao: 'asc' },
    }),
    // SEM filtro de `deletadoEm`, de proposito: lancamento gerado e depois
    // excluido continua contando como "este mes ja foi tratado". E assim que
    // excluir vira pular o mes, e restaurar pela lixeira traz de volta.
    prisma.lancamento.findMany({
      where: { competenciaRecorrente: competencia, recorrenteId: { not: null } },
      select: { recorrenteId: true },
    }),
    prisma.fatura.findMany({
      where: { competencia, status: 'TRAVADA' },
      select: { contaId: true },
    }),
  ]);

  return recorrentesPendentes(
    recorrentes,
    competencia,
    new Set(geradas.flatMap((g) => (g.recorrenteId ? [g.recorrenteId] : []))),
    new Set(travadas.map((t) => t.contaId)),
  );
}

/** O que a faixa do Despesas mostra: o que falta lancar neste mes. */
export async function carregarRecorrentesPendentes(
  competencia: string,
): Promise<RecorrentePendente[]> {
  const pendentes = await pendentesCompletas(competencia);
  return pendentes.map((r) => ({ id: r.id, descricao: r.descricao, valorCentavos: r.valorCentavos }));
}

export type ResultadoDoLancamentoEmLote = {
  lancadas: number;
  /** Ficaram de fora porque a fatura travou ou outra pessoa lancou no mesmo instante. */
  puladas: number;
};

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/**
 * Gera os lancamentos das recorrentes pendentes de uma competencia.
 *
 * Cada recorrente vira um `criarLancamento` proprio, com a transacao dele —
 * **nao ha uma transacao em volta de todas, e isso e deliberado**. Se a quinta
 * falhar, as quatro primeiras ficam gravadas e as demais continuam pendentes:
 * a faixa reaparece com o que sobrou, e clicar de novo termina o servico.
 * Tudo-ou-nada aqui so serviria para desfazer trabalho bom por causa de um
 * problema alheio a ele.
 *
 * Quem garante que nada duplica e o indice unico em
 * `(recorrenteId, competenciaRecorrente)`, nao a triagem. A triagem evita
 * oferecer o que ja foi feito; o indice segura dois cliques no mesmo
 * instante, quando as duas triagens ainda viam a recorrente como pendente. A
 * segunda gravacao bate no indice (P2002), e isso conta como "ja lancada", nao
 * como erro.
 *
 * Fatura travada entre a triagem e a gravacao: `criarLancamento` recusa com
 * FATURA_TRAVADA, e a recorrente fica como pulada.
 */
export async function lancarRecorrentes(competencia: string): Promise<ResultadoDoLancamentoEmLote> {
  const pendentes = await pendentesCompletas(competencia);

  let lancadas = 0;
  let puladas = 0;

  for (const r of pendentes) {
    try {
      const resultado = await criarLancamento({
        descricao: r.descricao,
        valorCentavos: r.valorCentavos,
        origemValor: 'POR_PARCELA',
        // A data sai conferida contra a regra de competencia — ver o
        // comentario de `dataDaRecorrente`. Sem `competenciaManual`: a data
        // precisa reproduzir a competencia sozinha, ou a primeira edicao
        // mudaria o lancamento de mes.
        dataCompra: dataDaRecorrente(competencia, r.diaDoMes, r.conta),
        numeroParcelas: 1,
        escopo: r.escopo,
        contaId: r.contaId,
        categoriaId: r.categoriaId,
        ...(r.membroId ? { membroId: r.membroId } : {}),
        recorrenteId: r.id,
        competenciaRecorrente: competencia,
      });
      if (resultado.ok) lancadas += 1;
      else puladas += 1;
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;
      puladas += 1;
    }
  }

  return { lancadas, puladas };
}
