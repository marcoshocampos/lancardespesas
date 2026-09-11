import { ListaCategorias } from '@/components/configuracoes/lista-categorias';
import { ListaContas } from '@/components/configuracoes/lista-contas';
import { ListaMembros } from '@/components/configuracoes/lista-membros';
import { prisma } from '@/server/db';

/**
 * Sem `searchParams`: configuracao nao pertence a um mes. A barra lateral
 * carrega `?competencia=` ao trocar de tela, e esta pagina simplesmente ignora
 * o parametro.
 *
 * Por isso mesmo nada aqui e API dinamica, e sem esta linha o Next
 * prerenderizaria a rota no `next build` — o que significaria ler o banco de
 * PRODUCAO na hora de compilar e servir a lista congelada naquele instante.
 * `/despesas` e `/resumo` ja sao dinamicas porque dependem de `searchParams`;
 * esta precisa dizer.
 */
export const dynamic = 'force-dynamic';

export default async function Configuracoes() {
  // Nenhuma das tres leituras tem `where`: esta e a unica tela que mostra
  // categoria arquivada, conta inativa e pessoa inativa, e a unica de onde se
  // volta atras. `/despesas` e `/resumo` continuam filtrando `arquivada: false`,
  // `ativa: true` e `ativo: true`.
  //
  // A ordem de cada lista e a mesma das outras telas, para a pessoa reencontrar
  // aqui o que viu la: categoria por nome, conta pela `ordem` (que e a ordem das
  // colunas da matriz do Resumo, e nao se edita), pessoa por `criadoEm`.
  const [categorias, contas, membros] = await Promise.all([
    prisma.categoria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.conta.findMany({ orderBy: { ordem: 'asc' } }),
    prisma.membro.findMany({ orderBy: { criadoEm: 'asc' } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <p className="mt-1 text-sm text-tinta-fraca">
        O cadastro que as telas de lançamento e de resumo usam.
      </p>

      <div className="mt-6 space-y-4">
        <ListaCategorias categorias={categorias} />
        <ListaContas contas={contas} />
        <ListaMembros membros={membros} />
      </div>
    </div>
  );
}
