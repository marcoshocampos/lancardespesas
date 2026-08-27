import { ConferenciaFatura } from '@/components/conferencia-fatura';
import { MatrizResumo } from '@/components/matriz-resumo';
import { calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarValorReal } from '@/server/repositorios/fatura';
import { carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';

type Props = { searchParams: Promise<{ competencia?: string }> };

function competenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

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
  const valoresReaisPorConta = Object.fromEntries(
    await Promise.all(
      contasCartao.map(async (c) => [c.id, await carregarValorReal(c.id, competencia)] as const),
    ),
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Resumo · {competencia}</h1>
      <MatrizResumo
        resumo={resumo}
        membroIds={membroIds}
        nomesDeConta={Object.fromEntries(contas.map((c) => [c.id, c.nome]))}
        nomesDeMembro={Object.fromEntries(membros.map((m) => [m.id, m.nome]))}
      />
      {contasCartao.map((c) => (
        <ConferenciaFatura
          key={c.id}
          contaId={c.id}
          competencia={competencia}
          nome={c.nome}
          somado={resumo.somado[c.id] ?? 0}
          valorReal={valoresReaisPorConta[c.id] ?? null}
        />
      ))}
    </main>
  );
}
