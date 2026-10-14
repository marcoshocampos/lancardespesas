import { ListaLixeira } from '@/components/lixeira/lista-lixeira';
import { carregarLixeira } from '@/server/repositorios/lixeira';

/**
 * A lixeira. **A única tela do sistema que não é de um mês** — o que se procura
 * aqui é "o que eu acabei de excluir", não "o que foi excluído em setembro".
 *
 * Por isso não há `FaixaCompetencia`. A barra lateral ainda manda
 * `?competencia=` no link, e a página ignora, como Configurações já fazia: é
 * esse parâmetro ignorado que preserva o mês ao voltar para Despesas.
 */
export default async function LixeiraPage() {
  const itens = await carregarLixeira();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-xl font-semibold">Lixeira</h1>
      <p className="mb-4 text-sm text-tinta-fraca">
        O que foi excluído, mais recente primeiro. Restaurar devolve o lançamento com as parcelas
        que ele tinha, nos mesmos meses.
      </p>

      <ListaLixeira itens={itens} />
    </div>
  );
}
