'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ID_BOTAO_NOVO_LANCAMENTO } from './painel-lancamento';

/** Id proprio, para o painel devolver o foco a ELE e nao ao botao do topo. */
export const ID_BOTAO_FLUTUANTE = 'botao-flutuante-novo-lancamento';

/**
 * O `+` que acompanha a rolagem, para lancar sem voltar ao topo da lista.
 *
 * So existe no DOM quando o botao do topo esta fora de vista. Nao e enfeite de
 * animacao: enquanto os dois aparecem juntos, quem navega por teclado ou leitor
 * de tela encontra DOIS controles com o mesmo rotulo e a mesma acao, e precisa
 * descobrir sozinho que sao o mesmo botao. Fora de vista, so ha um.
 *
 * Por isso `IntersectionObserver` sobre o botao do topo em vez de medir
 * `scrollY`: o que importa nao e o quanto se rolou, e se o outro botao ainda
 * esta alcancavel. Mes curto, janela alta ou zoom grande mudam o limiar, e a
 * pergunta continua a mesma.
 */
export function BotaoFlutuanteNovo({ onClick }: { onClick: () => void }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const alvo = document.getElementById(ID_BOTAO_NOVO_LANCAMENTO);
    if (!alvo) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setVisivel(entrada ? !entrada.isIntersecting : false),
      // O botao precisa sair INTEIRO de vista, e nao so encostar na borda.
      { threshold: 1 },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  if (!visivel) return null;

  return (
    <Button
      id={ID_BOTAO_FLUTUANTE}
      type="button"
      size="icon"
      onClick={onClick}
      aria-label="Novo lançamento"
      // `fixed` ancora na janela, nao na grade. O `z-30` fica abaixo do overlay
      // do painel (que e um dialogo modal) para o botao nao flutuar por cima do
      // proprio formulario que ele abriu.
      className="fixed right-6 bottom-6 z-30 size-12 rounded-full shadow-lg motion-safe:animate-in motion-safe:fade-in"
    >
      <Plus aria-hidden="true" className="size-5" />
    </Button>
  );
}
