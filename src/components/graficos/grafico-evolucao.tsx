'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MesDaEvolucao } from '@/domain/graficos';
import { formatarBRL } from '@/domain/money';
import { CaixaDaDica, mesCurto, SemDado } from './pecas';

const COR_NOVAS = 'var(--color-grafico-novas)';
const COR_ANTERIORES = 'var(--color-grafico-anteriores)';

/**
 * O gasto mês a mês, empilhado em **compras novas** e **parcelas de compras
 * anteriores**.
 *
 * A separação é o que impede este gráfico de mentir, e é a razão de ele existir
 * assim em vez de como uma linha única.
 *
 * Um mês em que ninguém lançou nada ainda aparece com valor, porque parcelas de
 * compra antiga caem nele. Uma linha única desenharia isso como "gasto daquele
 * mês" — e nos dados deste sistema, de abril a agosto de 2026, seria falso: o
 * casal só começou a lançar em setembro, e o que existe antes é reconstrução
 * das parcelas pela importação. Empilhado, esses meses se mostram pelo que são:
 * a faixa de novas fica vazia.
 *
 * Vale igual à frente. A queda depois do mês corrente não é "gastando menos", é
 * parcelado terminando — e de novo a faixa de novas em zero diz isso sozinha,
 * sem precisar de texto.
 *
 * A linha vertical marca o mês que se está olhando: à direita dela não há
 * compra nova possível, só compromisso já assumido.
 */
export function GraficoEvolucao({
  meses,
  competenciaAtual,
}: {
  meses: MesDaEvolucao[];
  competenciaAtual: string;
}) {
  if (meses.length === 0) {
    return <SemDado>Ainda não há lançamento nenhum para desenhar.</SemDado>;
  }

  const dados = meses.map((m) => ({ ...m, rotulo: mesCurto(m.competencia) }));
  const rotuloAtual = dados.find((d) => d.competencia === competenciaAtual)?.rotulo;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--color-borda-suave)" />
          <XAxis
            dataKey="rotulo"
            tickLine={false}
            axisLine={{ stroke: 'var(--color-borda)' }}
            tick={{ fontSize: 11, fill: 'var(--color-tinta-fraca)' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'var(--color-tinta-fraca)' }}
            tickFormatter={(v: number) => formatarBRL(v).replace('R$ ', '')}
          />

          {rotuloAtual && (
            <ReferenceLine
              x={rotuloAtual}
              stroke="var(--color-tinta-apagada)"
              strokeDasharray="3 3"
              label={{
                value: 'mês visto',
                position: 'top',
                fontSize: 10,
                fill: 'var(--color-tinta-apagada)',
              }}
            />
          )}

          <Tooltip
            cursor={{ fill: 'var(--color-realce)' }}
            content={({ active, payload }) => {
              const mes = active ? (payload?.[0]?.payload as (MesDaEvolucao & { rotulo: string }) | undefined) : undefined;
              if (!mes) return null;
              return (
                <CaixaDaDica
                  titulo={mes.rotulo}
                  itens={[
                    { nome: 'Compras novas', valorCentavos: mes.novasCentavos, cor: COR_NOVAS },
                    { nome: 'Parcelas anteriores', valorCentavos: mes.anterioresCentavos, cor: COR_ANTERIORES },
                    { nome: 'Total', valorCentavos: mes.totalCentavos },
                  ]}
                />
              );
            }}
          />

          {/* Legenda embaixo: no topo ela disputa a faixa com o rotulo da linha
              de referencia, e os dois se sobrepoem. */}
          <Legend
            verticalAlign="bottom"
            align="left"
            height={28}
            iconType="square"
            iconSize={8}
            formatter={(valor) => <span className="text-xs text-tinta-fraca">{valor}</span>}
          />

          {/* Anteriores embaixo, novas em cima: o que varia de mês para mês é a
              compra nova, e série que varia lê melhor longe da base. */}
          <Bar
            dataKey="anterioresCentavos"
            name="Parcelas de compras anteriores"
            stackId="mes"
            fill={COR_ANTERIORES}
            isAnimationActive={false}
          />
          <Bar
            dataKey="novasCentavos"
            name="Compras novas"
            stackId="mes"
            fill={COR_NOVAS}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
