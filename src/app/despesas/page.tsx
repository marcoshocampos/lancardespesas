import { ChipsConta } from '@/components/chips-conta';
import { GradeLancamentos } from '@/components/grade-lancamentos';
import { prisma } from '@/server/db';
import { carregarLinhasDaGrade } from '@/server/repositorios/resumo';

type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

function competenciaAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;

  const [contas, linhas] = await Promise.all([
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    carregarLinhasDaGrade(competencia, conta),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-semibold">Despesas · {competencia}</h1>

      <ChipsConta competencia={competencia} contas={contas} contaSelecionada={conta} />

      <div className="mt-4 rounded-md border">
        <GradeLancamentos linhas={linhas} />
      </div>
    </main>
  );
}
