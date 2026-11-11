import type { ParcelaDeGrafico } from '@/domain/graficos';
import { prisma } from '../db';

/**
 * Todas as parcelas visíveis, de todas as competências, para os gráficos.
 *
 * É a única leitura do sistema **sem filtro de competência** — e precisa ser:
 * a evolução mensal e a projeção existem justamente para olhar através dos
 * meses, que é o que a planilha com uma aba por mês nunca soube fazer.
 *
 * **Sem paginação, de propósito.** Duas pessoas num cartão produzem algo como
 * uma centena de parcelas por ano; carregar tudo custa uma consulta e alguns
 * kilobytes. Paginar aqui exigiria paginar a agregação também, que é onde a
 * complexidade de verdade mora. Se um dia incomodar, o caminho é agregar no
 * banco com `groupBy`, não fatiar a leitura.
 *
 * **Reembolso fica de fora.** Despesa que alguém de fora vai devolver não é
 * gasto do casal — mesma regra do Resumo. Um ranking com *Terceiros* no topo
 * mentiria sobre onde o dinheiro deles foi. Por isso os três gráficos falam de
 * "gasto do casal", e não de "o que passou no cartão".
 */
export async function carregarParcelasParaGraficos(): Promise<ParcelaDeGrafico[]> {
  const parcelas = await prisma.parcela.findMany({
    where: {
      cancelada: false,
      lancamento: { deletadoEm: null, statusReembolso: null },
    },
    select: {
      competencia: true,
      numero: true,
      valorCentavos: true,
      lancamento: { select: { categoria: { select: { nome: true, cor: true } } } },
    },
  });

  return parcelas.map((p) => ({
    competencia: p.competencia,
    numero: p.numero,
    valorCentavos: p.valorCentavos,
    categoriaNome: p.lancamento.categoria.nome,
    categoriaCor: p.lancamento.categoria.cor,
  }));
}
