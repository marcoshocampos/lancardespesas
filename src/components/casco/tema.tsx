'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { COOKIE_TEMA, ehTemaForcado, type TemaForcado } from './tema-compartilhado';

/** A escolha de quem olha. `sistema` devolve a decisão ao aparelho. */
type Tema = 'sistema' | TemaForcado;

const CICLO: Tema[] = ['sistema', 'claro', 'escuro'];

const ROTULO: Record<Tema, string> = {
  sistema: 'Tema: seguindo o sistema',
  claro: 'Tema: claro',
  escuro: 'Tema: escuro',
};

const ICONE: Record<Tema, typeof Sun> = {
  sistema: Monitor,
  claro: Sun,
  escuro: Moon,
};

/**
 * O cookie como fonte externa, no formato do `useSyncExternalStore`.
 *
 * Esta é a forma certa de ler estado que não é do React — e não um `useState`
 * preenchido num efeito, que renderiza duas vezes e dispara o
 * `react-hooks/set-state-in-effect`.
 *
 * Não há divergência de hidratação a temer: o servidor lê o mesmo cookie em
 * `layout.tsx` e já renderiza o atributo, então as duas pontas concordam desde
 * o primeiro byte.
 */
const assinantes = new Set<() => void>();

function assinar(aoMudar: () => void): () => void {
  assinantes.add(aoMudar);
  return () => {
    assinantes.delete(aoMudar);
  };
}

function lerCookie(): Tema {
  const achado = document.cookie
    .split('; ')
    .find((parte) => parte.startsWith(`${COOKIE_TEMA}=`))
    ?.slice(COOKIE_TEMA.length + 1);
  return ehTemaForcado(achado) ? achado : 'sistema';
}

/** No servidor o `document` não existe; o layout já tratou o cookie por lá. */
function snapshotDoServidor(): Tema {
  return 'sistema';
}

/**
 * Grava o cookie, aplica no `<html>` e avisa quem estiver ouvindo.
 *
 * Aplicar no DOM na hora, sem esperar o servidor, é o que faz a troca ser
 * instantânea: o cookie serve ao PRÓXIMO carregamento, não a este.
 *
 * `sistema` apaga o cookie e **remove** o atributo — é a ausência dele que
 * devolve a decisão à media query do CSS.
 *
 * `SameSite=Lax` e um ano de validade. Sem `Secure` de propósito: em
 * `localhost` o navegador descartaria o cookie, e tema não é segredo.
 */
function escolher(tema: Tema): void {
  const raiz = document.documentElement;

  if (tema === 'sistema') {
    document.cookie = `${COOKIE_TEMA}=; path=/; max-age=0; SameSite=Lax`;
    raiz.removeAttribute('data-tema');
  } else {
    document.cookie = `${COOKIE_TEMA}=${tema}; path=/; max-age=31536000; SameSite=Lax`;
    raiz.setAttribute('data-tema', tema);
  }

  for (const aoMudar of assinantes) aoMudar();
}

/**
 * O botão de tema, no rodapé da barra lateral.
 *
 * **Três estados, não dois.** Com dois, "voltar a seguir o sistema" sumiria no
 * primeiro clique e não haveria como recuperar — e seguir o sistema é o padrão
 * que funciona em qualquer aparelho, sem depender de nada guardado.
 *
 * A escolha mora num cookie, logo **por aparelho e por navegador**: o celular e
 * o notebook guardam escolhas separadas. Limitação conhecida e aceita — guardar
 * por pessoa exige a tabela `Preferencia`, que é de Fase 2. Ver `decisoes.md`.
 */
export function BotaoTema() {
  const tema = useSyncExternalStore(assinar, lerCookie, snapshotDoServidor);
  const Icone = ICONE[tema];

  return (
    <button
      type="button"
      onClick={() => escolher(CICLO[(CICLO.indexOf(tema) + 1) % CICLO.length] ?? 'sistema')}
      title={ROTULO[tema]}
      className="flex size-8 shrink-0 items-center justify-center rounded-campo text-tinta-fraca hover:bg-superficie-alta hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
    >
      <Icone aria-hidden="true" className="size-4" />
      <span className="sr-only">{ROTULO[tema]}. Trocar.</span>
    </button>
  );
}
