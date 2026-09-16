import { FaixaCompetencia } from '@/components/casco/faixa-competencia';
import { GradeLancamentos } from '@/components/despesas/grade-lancamentos';
import { COLUNA_TOTAL, calcularResumo } from '@/domain/totais';
import { prisma } from '@/server/db';
import { carregarLinhasDaGrade, carregarParcelasDaCompetencia } from '@/server/repositorios/resumo';
import { competenciaAtual } from '@/app/competencia-atual';

type Props = { searchParams: Promise<{ competencia?: string; conta?: string }> };

export default async function Despesas({ searchParams }: Props) {
  const { competencia = competenciaAtual(), conta } = await searchParams;

  const [todasAsContas, categorias, membros, linhas, parcelas] = await Promise.all([
    // Sem `where: { ativa: true }`, de proposito. Filtrar por `ativa` aqui era
    // o bug: uma conta desativada que ainda tem parcela nesta competencia
    // ficava de fora do conjunto que alimenta `calcularResumo`, e o mes inteiro
    // parava de abrir com "Conta desconhecida no resumo". As duas listas
    // montadas logo abaixo saem desta mesma consulta — a tabela de contas tem
    // um punhado de linhas, e uma consulta continua sendo uma consulta.
    prisma.conta.findMany({ orderBy: { ordem: 'asc' } }),
    // Sem `where: { arquivada: false }`, pelo mesmo motivo da consulta acima:
    // `arquivada` quer dizer "nao ofereca esta categoria para lancamento novo",
    // e nunca "esconda o historico". Esta lista tem dois consumidores que
    // precisam da categoria arquivada — a bolinha de cor de cada linha da grade
    // (`secao-pessoa.tsx`, que a procura por id e ficava sem cor) e o select do
    // painel no modo EDITAR (`categoriasOferecidas` em `painel-lancamento.tsx`,
    // que sem ela recategorizava o lancamento em silencio ao salvar). Quem
    // recusa a categoria arquivada para lancamento NOVO e o painel, no modo
    // criar. Continua uma consulta so: o `where` saiu, nenhuma irma entrou.
    prisma.categoria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
    carregarLinhasDaGrade(competencia, conta),
    carregarParcelasDaCompetencia(competencia),
  ]);

  // Duas listas, e nao uma. `ativa` quer dizer "nao ofereca esta conta para
  // lancamento novo"; nunca quis dizer "esconda o historico". Entao o MES e
  // descrito pelas contas ativas mais as que tem parcela nele (colunas, chips,
  // nomes, totais da faixa), e so as ATIVAS chegam ao painel de lancamento.
  // Com uma lista so, um dos dois lados quebra: ou o mes volta a nao abrir, ou
  // o painel passa a oferecer uma conta aposentada para lancamento novo.
  // Os ids saem das parcelas ja carregadas — nenhuma consulta a mais.
  const comParcelaNoMes = new Set(parcelas.map((p) => p.contaId));
  const contasDoMes = todasAsContas.filter((c) => c.ativa || comParcelaNoMes.has(c.id));
  const contasAtivas = todasAsContas.filter((c) => c.ativa);

  const membroIds = membros.map((m) => m.id);
  const resumo = calcularResumo(
    parcelas,
    membroIds,
    contasDoMes.map((c) => c.id),
  );

  const totais = {
    membros: membros.map((m) => ({
      membroId: m.id,
      nome: m.nome,
      cor: m.cor,
      centavos: resumo.totalGeral[m.id]?.[COLUNA_TOTAL] ?? 0,
    })),
    // Pelas contas DO MES, nao pelas ativas: a fatura de um cartao aposentado
    // que ainda recebe parcela e dinheiro de verdade deste mes, e o total da
    // faixa tem que bater com a coluna que o Resumo mostra para ele. Some
    // sozinho no mes em que esse cartao nao tiver movimento.
    faturas: contasDoMes
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
        contasDoMes={contasDoMes}
        contasAtivas={contasAtivas}
        categorias={categorias}
        membros={membros}
        contaSelecionada={conta}
      />
    </div>
  );
}
