import Form from 'next/form';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  /** O mes aberto: vai junto na busca, para o clique e o "Limpar" voltarem a ele. */
  competencia: string;
  /** O filtro de conta ligado, se houver. Nao restringe a busca — so volta no "Limpar". */
  conta: string | undefined;
  /** O termo buscado, ja sem espacos nas pontas. Vazio fora de uma busca. */
  termo: string;
};

/**
 * A barra de busca do Despesas. Buscar e navegar: um formulario GET para a
 * propria pagina, com `q`, e a pagina decide o resto. Sem estado aqui.
 *
 * O campo NAO recebe foco ao abrir: o Despesas e aberto o tempo todo, e roubar
 * o foco a cada visita atrapalharia quem so quer lancar.
 */
export function BarraBusca({ competencia, conta, termo }: Props) {
  const limpar = conta
    ? `/despesas?competencia=${competencia}&conta=${conta}`
    : `/despesas?competencia=${competencia}`;

  return (
    <Form action="/despesas" role="search" className="mt-4 flex items-center gap-2">
      <input type="hidden" name="competencia" value={competencia} />
      {conta && <input type="hidden" name="conta" value={conta} />}

      <label htmlFor="busca-termo" className="sr-only">
        Buscar lançamentos em todos os meses
      </label>
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-tinta-fraca"
        />
        {/* `key={termo}`: numa navegacao sem recarga o React reaproveita este
            input, e campo nao controlado ignora `defaultValue` novo. Sem a key,
            clicar num resultado deixaria o termo antigo escrito na barra. */}
        <Input
          key={termo}
          id="busca-termo"
          name="q"
          type="search"
          defaultValue={termo}
          autoComplete="off"
          placeholder="Buscar em todos os meses: descrição, terceiro ou valor (89,90)"
          className="pl-8"
        />
      </div>
      <Button type="submit" variant="outline">
        Buscar
      </Button>
      {termo && (
        <Link
          href={limpar}
          className="text-sm whitespace-nowrap text-acento underline-offset-4 hover:underline"
        >
          Limpar busca
        </Link>
      )}
    </Form>
  );
}
