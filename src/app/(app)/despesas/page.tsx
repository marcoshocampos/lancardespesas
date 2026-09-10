import { FaixaCompetencia } from '@/components/casco/faixa-competencia';
import { GradeLancamentos } from '@/components/despesas/grade-lancamentos';
import { COLUNA_TOTAL, calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarLinhasDaGrade, carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';
import { competenciaAtual } from '@/app/competencia-atual';

type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;

  const [contas, categorias, membros, linhas, parcelas] = await Promise.all([
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    prisma.categoria.findMany({ where: { arquivada: false }, orderBy: { nome: 'asc' } }),
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    carregarLinhasDaGrade(competencia, conta),
    carregarParcelasDaCompetencia(competencia),
  ]);

  const membroIds = membros.map((m) => m.id);
  const resumo = calcularResumo(
    parcelas,
    membroIds,
    contas.map((c) => c.id),
  );

  const totais = {
    membros: membros.map((m) => ({
      membroId: m.id,
      nome: m.nome,
      cor: m.cor,
      centavos: resumo.totalGeral[m.id]?.[COLUNA_TOTAL] ?? 0,
    })),
    faturas: contas
      .filter((c) => c.tipo === 'CARTAO')
      .map((c) => ({ contaId: c.id, nome: c.nome, centavos: resumo.somado[c.id] ?? 0 })),
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <FaixaCompetencia
        competencia={competencia}
        rota="/despesas"
        conta={conta}
        totais={totais}
        filtroAtivo={Boolean(conta)}
      />

      <h1 className="mt-4 text-xl font-semibold">Despesas</h1>

      {/* Chips e cartao levam sua propria margem (mt-4) dentro de
          GradeLancamentos — o cartao (borda arredondada) nao pode mais
          envolver os chips tambem, ver achado 3 da revisao de bc54df3. */}
      <GradeLancamentos
        linhas={linhas}
        competencia={competencia}
        contas={contas}
        categorias={categorias}
        membros={membros}
        contaSelecionada={conta}
      />
    </div>
  );
}
