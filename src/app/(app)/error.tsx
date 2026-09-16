'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Props que o Next entrega a um `error.tsx`. A assinatura real esta em
 * `next/dist/client/components/error-boundary.d.ts` (`ErrorInfo`): sao tres
 * props, `error`, `reset` e `retry`. `reset` fica declarada aqui para o tipo
 * nao mentir sobre o contrato, mas quem o botao chama e `retry` — o porque
 * esta no comentario do componente.
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
};

/**
 * Fronteira de erro das telas autenticadas. Um `error.tsx` em `(app)/` cobre
 * `/despesas` e `/resumo` de uma vez: grupo de rota e segmento comum para as
 * convencoes de arquivo, so nao entra na URL. Renderiza dentro do casco, com a
 * barra lateral ainda na tela — por isso nao ha caminho de volta construido
 * aqui, ele ja esta ao lado. Erro lancado pelo proprio `(app)/layout.tsx` nao
 * cai aqui; para isso a fronteira teria que estar no segmento acima.
 *
 * **Ela nao engole excecao nenhuma.** Nao ha `try/catch` em lugar nenhum:
 * quando este componente renderiza, o erro ja foi lancado e ja chegou ao log
 * do servidor. O que esta fronteira troca e a tela branca por uma mensagem.
 *
 * Sobre o texto: `calcularResumo` lanca de proposito para entrada incoerente
 * (conta desconhecida, parcela pessoal sem membro, conjunto sem rateio, cotas
 * que nao fecham), mas esta fronteira pega QUALQUER erro do segmento — um
 * tropeco de rede no Neon cai aqui tambem. Num sistema de dinheiro, afirmar
 * "seus dados estao incoerentes" quando o banco so piscou e pior que nao dizer
 * nada. Entao a mensagem diz so o que se sabe: a tela nao subiu, o erro ficou
 * registrado, e insistir resolve se — e somente se — foi coisa passageira.
 *
 * `retry` e nao `reset`: `reset` apenas limpa o estado da fronteira e
 * remonta os mesmos filhos, sem nova busca no servidor, o que nunca recupera
 * erro vindo de Server Component — e todo erro daqui vem de um (as duas
 * paginas sao `async` e consultam o banco). `retry` faz `router.refresh()` e
 * so entao limpa o estado, ou seja, chama o servidor de novo. Um botao
 * "Tentar de novo" que nao tenta de novo seria a mesma desonestidade que o
 * texto acima evita.
 */
export default function ErroDoApp({ error, retry }: Props) {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-caixa border border-negativo/20 bg-negativo-fundo p-6"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-negativo" />

        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-negativo">
            Não foi possível montar esta tela
          </h1>

          <p className="mt-2 text-sm text-tinta">
            O erro ficou registrado no servidor. Se foi coisa passageira — uma conexão que caiu no
            meio, por exemplo —, tentar de novo resolve.
          </p>

          <p className="mt-2 text-sm text-tinta">
            Se repetir, não adianta insistir: aí é dado que precisa ser olhado.
          </p>

          {error.digest && (
            <p className="mt-3 text-xs text-tinta-fraca">
              Ocorrência no log: <span className="font-mono">{error.digest}</span>
            </p>
          )}

          <Button type="button" className="mt-4" onClick={retry}>
            Tentar de novo
          </Button>
        </div>
      </div>
    </div>
  );
}
