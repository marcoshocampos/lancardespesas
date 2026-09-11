import { ListaCategorias } from '@/components/configuracoes/lista-categorias';
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
  // Sem `where`: esta e a unica tela que mostra categoria arquivada, e a unica
  // de onde se desarquiva. `/despesas` continua filtrando `arquivada: false`.
  const categorias = await prisma.categoria.findMany({ orderBy: { nome: 'asc' } });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Configurações</h1>
      <p className="mt-1 text-sm text-tinta-fraca">
        O cadastro que as telas de lançamento e de resumo usam.
      </p>

      <div className="mt-6 space-y-4">
        <ListaCategorias categorias={categorias} />

        {/* Contas (`lista-contas.tsx`) e membros (`lista-membros.tsx`) entram
            aqui, nesta ordem, na Tarefa 4b — com as leituras de `prisma.conta`
            (`orderBy: { ordem: 'asc' }`) e `prisma.membro`
            (`orderBy: { criadoEm: 'asc' }`) juntando-se a de cima num
            `Promise.all`, como em `/despesas`. As duas listas tambem carregam
            registro inativo: e desta tela que se reativa. A barra lateral so
            ganha o destino "Configuracoes" depois delas. */}
      </div>
    </div>
  );
}
