'use client';

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FatiaDeCategoria } from '@/domain/graficos';
import { formatarBRL } from '@/domain/money';
import { CaixaDaDica, SemDado } from './pecas';

/**
 * Onde o dinheiro foi no mês — barras horizontais, da maior para a menor.
 *
 * Horizontal e não vertical porque o rótulo é o nome da categoria: na vertical
 * ele vira texto girado ou cortado, e com treze categorias não cabe de jeito
 * nenhum.
 *
 * **A cor vem do banco**, a mesma da bolinha que a grade já mostra. Aqui ela é
 * reforço, não identidade: cada barra leva o nome ao lado e o valor na ponta.
 *
 * Isso não é detalhe. O validador do skill de dataviz **reprovou** a paleta das
 * categorias: `Casa Doce` e `Beleza` têm ΔE 8,6, pouco até para visão normal, e
 * `Jogo` e `Casa Doce` somem uma na outra para quem tem daltonismo protan. Numa
 * rosca isso seria grave, porque lá a cor é a única identidade — foi mais um
 * motivo para a rosca ter saído do escopo. Com rótulo direto em cada barra, a
 * leitura não depende de distinguir tom.
 */
export function GraficoCategorias({ fatias }: { fatias: FatiaDeCategoria[] }) {
  if (fatias.length === 0) {
    return <SemDado>Nenhum gasto do casal neste mês.</SemDado>;
  }

  // Altura por item, e não altura fixa: sem isto, doze categorias dividiriam o
  // mesmo espaço que três e as barras virariam fios.
  const altura = Math.max(150, fatias.length * 32 + 16);

  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={fatias} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="nome"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'var(--color-tinta-fraca)' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-realce)' }}
            content={({ active, payload }) => {
              const fatia = active ? (payload?.[0]?.payload as FatiaDeCategoria | undefined) : undefined;
              if (!fatia) return null;
              return (
                <CaixaDaDica
                  titulo={fatia.nome}
                  itens={[{ nome: 'Gasto no mês', valorCentavos: fatia.valorCentavos, cor: fatia.cor }]}
                />
              );
            }}
          />
          <Bar dataKey="valorCentavos" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
            {fatias.map((f) => (
              // Cor do banco é dado — a mesma exceção à proibição de cor
              // literal que a bolinha da grade já abre.
              <Cell key={f.nome} fill={f.cor} />
            ))}
            <LabelList
              dataKey="valorCentavos"
              position="right"
              formatter={(v: unknown) => (typeof v === 'number' ? formatarBRL(v) : '')}
              className="fill-tinta-fraca"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
