import { ChipsConta } from '@/components/chips-conta';
import { GradeLancamentos } from '@/components/grade-lancamentos';
import { LinhaNova } from '@/components/linha-nova';
import { prisma } from '@/server/db';
import { carregarLinhasDaGrade } from '@/server/repositorios/resumo';
import { competenciaAtual } from '@/app/competencia-atual';

type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;

  const [contas, categorias, membros, linhas] = await Promise.all([
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    prisma.categoria.findMany({ where: { arquivada: false }, orderBy: { nome: 'asc' } }),
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    carregarLinhasDaGrade(competencia, conta),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-xl font-semibold">Despesas · {competencia}</h1>

      <ChipsConta competencia={competencia} contas={contas} contaSelecionada={conta} />

      <div className="mt-4 rounded-md border">
        <GradeLancamentos
          linhas={linhas}
          competencia={competencia}
          contas={contas}
          categorias={categorias}
          membros={membros}
        />
        <LinhaNova contas={contas} categorias={categorias} membros={membros} />
      </div>
    </main>
  );
}
