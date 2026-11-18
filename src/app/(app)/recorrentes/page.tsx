import { ListaRecorrentes } from '@/components/recorrentes/lista-recorrentes';
import { competenciaAtual } from '@/app/competencia-atual';
import { prisma } from '@/server/db';
import { carregarRecorrentes } from '@/server/repositorios/recorrente';

/**
 * Sem `searchParams`, como Configuracoes: o cadastro de recorrentes nao
 * pertence a um mes. A barra lateral carrega `?competencia=` ao trocar de tela,
 * e esta pagina ignora o parametro.
 *
 * Por isso mesmo nada aqui e API dinamica, e sem esta linha o Next
 * prerenderizaria a rota no `next build` — lendo o banco de PRODUCAO na hora de
 * compilar e servindo a lista congelada naquele instante.
 */
export const dynamic = 'force-dynamic';

/**
 * Saiu de Configuracoes para ter destino proprio na barra, logo depois de
 * Despesas: e de la que a pessoa vem, pela faixa de pendentes do mes.
 */
export default async function Recorrentes() {
  // As opcoes do formulario sao as mesmas que o painel de lancamento oferece
  // para lancamento novo: conta ativa, categoria nao arquivada, pessoa ativa.
  // Em ordem, para a pessoa reencontrar aqui o que viu no painel: conta pela
  // `ordem`, categoria por nome, pessoa por `criadoEm`.
  const [recorrentes, contas, categorias, membros] = await Promise.all([
    carregarRecorrentes(),
    prisma.conta.findMany({ where: { ativa: true }, orderBy: { ordem: 'asc' } }),
    prisma.categoria.findMany({ where: { arquivada: false }, orderBy: { nome: 'asc' } }),
    prisma.membro.findMany({ where: { ativo: true }, orderBy: { criadoEm: 'asc' } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Recorrentes</h1>
      <p className="mt-1 text-sm text-tinta-fraca">
        O que se repete todo mês: assinatura, seguro, mensalidade. Cadastrar aqui não lança nada
        sozinho — a cada mês, o Despesas mostra o que falta e vocês lançam com um clique.
      </p>

      <div className="mt-6">
        <ListaRecorrentes
          recorrentes={recorrentes}
          contas={contas}
          categorias={categorias}
          membros={membros}
          competenciaPadrao={competenciaAtual()}
        />
      </div>
    </div>
  );
}
