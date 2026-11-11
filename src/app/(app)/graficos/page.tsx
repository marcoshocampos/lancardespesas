import { FaixaCompetencia } from '@/components/casco/faixa-competencia';
import { GraficoCategorias } from '@/components/graficos/grafico-categorias';
import { GraficoEvolucao } from '@/components/graficos/grafico-evolucao';
import { GraficoProjecao } from '@/components/graficos/grafico-projecao';
import { Moldura } from '@/components/graficos/pecas';
import { competenciaAtual } from '@/app/competencia-atual';
import { evolucaoMensal, projecao, rankingDeCategorias } from '@/domain/graficos';
import { carregarParcelasParaGraficos } from '@/server/repositorios/graficos';

/**
 * Os gráficos. **Uma consulta só** alimenta os três: as parcelas de todas as
 * competências chegam cruas e a agregação acontece em `domain/graficos.ts`,
 * que é função pura e tem teste.
 *
 * Os três falam de **gasto do casal**, e não do que passou no cartão —
 * reembolso de terceiro fica de fora, pela mesma regra do Resumo. Isso está
 * escrito na explicação de cada um, porque um total que não bate com a fatura
 * precisa dizer por quê.
 */
export default async function GraficosPage({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const { competencia = competenciaAtual() } = await searchParams;
  const parcelas = await carregarParcelasParaGraficos();

  const doMes = parcelas.filter((p) => p.competencia === competencia);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <FaixaCompetencia competencia={competencia} rota="/graficos" />

      <h1 className="mt-4 mb-4 text-xl font-semibold">Gráficos</h1>

      <div className="space-y-4">
        <Moldura
          titulo="Onde o dinheiro foi"
          explicacao="Gasto do casal neste mês, por categoria. Reembolso de terceiro não entra."
        >
          <GraficoCategorias fatias={rankingDeCategorias(doMes)} />
        </Moldura>

        <Moldura
          titulo="Mês a mês"
          explicacao="Compras novas, separadas das parcelas que vieram de compras anteriores — é o que distingue um mês de gasto de um mês que só recebeu parcela."
        >
          <GraficoEvolucao meses={evolucaoMensal(parcelas)} competenciaAtual={competencia} />
        </Moldura>

        <Moldura
          titulo="Já comprometido"
          explicacao="O que vai cair depois deste mês, em parcelas de compras já feitas. Não é estimativa."
        >
          <GraficoProjecao projecao={projecao(parcelas, competencia)} />
        </Moldura>
      </div>
    </div>
  );
}
