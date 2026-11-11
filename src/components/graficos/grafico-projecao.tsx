'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Projecao } from '@/domain/graficos';
import { formatarCompetencia } from '@/domain/competencia';
import { formatarBRL } from '@/domain/money';
import { CaixaDaDica, mesCurto, SemDado } from './pecas';

const COR = 'var(--color-grafico-anteriores)';

/**
 * O que já está comprometido daqui para a frente.
 *
 * É a pergunta que a planilha nunca soube responder: uma aba por mês não
 * enxerga a parcela que ainda vai cair. **Nada aqui é estimativa** — cada real
 * é uma parcela já gravada, de compra já feita.
 *
 * O número grande vem antes do gráfico de propósito. A resposta é "quanto" e
 * "até quando"; a distribuição mês a mês é o detalhe de quem quiser olhar. Pôr
 * o gráfico primeiro faria procurar no desenho uma informação que cabe numa
 * linha de texto.
 *
 * Série única, então sem legenda: o título já diz o que a barra é.
 */
export function GraficoProjecao({ projecao }: { projecao: Projecao }) {
  if (projecao.meses.length === 0) {
    return <SemDado>Nada parcelado para os próximos meses.</SemDado>;
  }

  const dados = projecao.meses.map((m) => ({ ...m, rotulo: mesCurto(m.competencia) }));

  return (
    <>
      <p className="mb-4">
        <span className="text-2xl font-semibold tabular-nums text-tinta">
          {formatarBRL(projecao.totalCentavos)}
        </span>
        {projecao.ultimaCompetencia && (
          <span className="ml-2 text-xs text-tinta-fraca">
            comprometidos até {formatarCompetencia(projecao.ultimaCompetencia)}
          </span>
        )}
      </p>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
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
            <Tooltip
              cursor={{ fill: 'var(--color-realce)' }}
              content={({ active, payload }) => {
                const mes = active
                  ? (payload?.[0]?.payload as { rotulo: string; valorCentavos: number } | undefined)
                  : undefined;
                if (!mes) return null;
                return (
                  <CaixaDaDica
                    titulo={mes.rotulo}
                    itens={[{ nome: 'Já comprometido', valorCentavos: mes.valorCentavos }]}
                  />
                );
              }}
            />
            <Bar
              dataKey="valorCentavos"
              fill={COR}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
