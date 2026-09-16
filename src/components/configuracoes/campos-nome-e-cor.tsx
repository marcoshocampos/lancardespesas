import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

/**
 * As travas dos dois campos que as tres listas de configuracao tem em comum —
 * categorias, contas e pessoas.
 *
 * Elas nao sao estilo. O `nome` das actions e `z.string().trim().min(1).max(40)`
 * e a `cor` e `/^#[0-9a-fA-F]{6}$/` (`actions/configuracao.ts`): um nome de so
 * espacos passa pelo `required`, vira string vazia no `trim` do servidor e faz
 * o `parse` LANCAR — e o Next entrega ao cliente so um digest em producao. A
 * tela mostraria "erro" sem dizer o que houve. `pattern` e quem fecha essa
 * janela no navegador, `maxLength` cobre o `.max(40)`, e `type="color"`
 * estruturalmente nao produz valor fora de #rrggbb.
 *
 * Ate a Etapa 06 as tres listas repetiam tudo isto, identico byte a byte — o
 * comentario de `lista-contas.tsx` ja apostava que um dia viraria este arquivo.
 *
 * Por que COMPONENTE e nao constante exportada: constante se usa pela metade.
 * Da para importar `MAXIMO_DO_NOME`, esquecer o `pattern`, e a janela reabre
 * calada na quarta lista que alguem escrever. Aqui as travas vem juntas ou nao
 * vem — e o `Omit` tira do chamador ate a chance de afrouxa-las, porque as
 * props fixadas nao existem no tipo e o spread do chamador vem ANTES delas.
 */

/** O mesmo teto do `nome` em `actions/configuracao.ts` (`.max(40)`). */
const MAXIMO_DO_NOME = 40;

/** Pelo menos um caractere que nao seja espaco, em qualquer posicao. */
const PADRAO_ALEM_DE_ESPACO = '.*\\S.*';

/**
 * O que o navegador mostra quando o `pattern` barra o envio. Sem `title`, a
 * mensagem nativa e so "corresponda ao formato solicitado", que nao diz qual.
 */
const AVISO_DO_PADRAO = 'Use ao menos um caractere que não seja espaço.';

/**
 * Tudo o que o `Input` aceita, menos o que este campo fixa. `type` entra na
 * lista junto com as travas: `pattern` e ignorado em `type="number"`, entao
 * deixar o tipo aberto seria deixar a trava desligavel por fora.
 */
type PropsDoNome = Omit<
  ComponentProps<typeof Input>,
  'name' | 'type' | 'required' | 'maxLength' | 'pattern' | 'title'
>;

/** O campo de nome das tres listas. Id, `defaultValue`, foco e `aria-*` sao de quem chama. */
export function CampoNome(props: PropsDoNome) {
  return (
    <Input
      {...props}
      name="nome"
      required
      maxLength={MAXIMO_DO_NOME}
      pattern={PADRAO_ALEM_DE_ESPACO}
      title={AVISO_DO_PADRAO}
    />
  );
}

/** A `className` tambem e fixa: as tres listas usavam a mesma, letra por letra. */
type PropsDaCor = Omit<ComponentProps<typeof Input>, 'name' | 'type' | 'className'>;

/** O seletor de cor das tres listas. So `id` e `defaultValue` variam. */
export function CampoCor(props: PropsDaCor) {
  return <Input {...props} name="cor" type="color" className="size-8 shrink-0 cursor-pointer p-1" />;
}
