import { FaixaCompetencia } from '@/components/casco/faixa-competencia';
import { CartoesResumo } from '@/components/resumo/cartoes-resumo';
import { ConferenciaFatura } from '@/components/resumo/conferencia-fatura';
import { MatrizResumo } from '@/components/resumo/matriz-resumo';
import { calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarFatura } from '@/server/repositorios/fatura';
import { carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';
import { competenciaAtual } from '@/app/competencia-atual';

type Props = { searchParams: Promise<{ competencia?: string }> };

export default async function Resumo({ searchParams }: Props) {
  const { competencia = competenciaAtual() } = await searchParams;

  const [membros, contas, parcelas] = await Promise.all([
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    carregarParcelasDaCompetencia(competencia),
  ]);

  const membroIds = membros.map((m) => m.id);
  const resumo = calcularResumo(parcelas, membroIds, contas.map((c) => c.id));

  const contasCartao = contas.filter((c) => c.tipo === 'CARTAO');
  const faturasPorConta = Object.fromEntries(
    await Promise.all(
      contasCartao.map(async (c) => [c.id, await carregarFatura(c.id, competencia)] as const),
    ),
  );

  // Os cartoes so precisam do numero do extrato; a faixa de conferencia
  // tambem precisa do status. Uma consulta so, lida de dois jeitos.
  const valoresReaisPorConta = Object.fromEntries(
    contasCartao.map((c) => [c.id, faturasPorConta[c.id]?.valorRealCentavos ?? null] as const),
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <FaixaCompetencia competencia={competencia} rota="/resumo" />

      <h1 className="mt-4 mb-4 text-xl font-semibold">Resumo</h1>
      <CartoesResumo
        resumo={resumo}
        membros={membros}
        contasCartao={contasCartao}
        valoresReaisPorConta={valoresReaisPorConta}
      />
      <MatrizResumo
        resumo={resumo}
        competencia={competencia}
        membros={membros}
        nomesDeConta={Object.fromEntries(contas.map((c) => [c.id, c.nome]))}
      />
      <div className="mt-4 space-y-3">
        {contasCartao.map((c) => (
          <ConferenciaFatura
            key={c.id}
            contaId={c.id}
            competencia={competencia}
            nome={c.nome}
            somado={resumo.somado[c.id] ?? 0}
            valorReal={faturasPorConta[c.id]?.valorRealCentavos ?? null}
            // Fatura sem linha na tabela ainda esta ABERTA: nao ha registro
            // porque ninguem conferiu, nao porque o mes fechou.
            status={faturasPorConta[c.id]?.status ?? 'ABERTA'}
          />
        ))}
      </div>
    </div>
  );
}
