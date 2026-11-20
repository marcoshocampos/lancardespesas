'use client';

import type { Alcance } from '@/domain/divisao';

export type OpcaoDeAlcance = {
  valor: Alcance;
  /** Por que esta opcao esta desabilitada, ou `null` se pode ser escolhida. */
  bloqueio: string | null;
};

const ROTULOS: Record<Alcance, string> = {
  SO_ESTA: 'Só esta parcela',
  ESTA_E_SEGUINTES: 'Esta e as seguintes',
  TODAS: 'Todas',
};

type Props = {
  /** `name` dos radios: unico na pagina, para dois controles nao se misturarem. */
  nome: string;
  valor: Alcance;
  opcoes: readonly OpcaoDeAlcance[];
  onMudar: (alcance: Alcance) => void;
  desabilitado?: boolean | undefined;
};

/**
 * O alcance de uma edicao ou exclusao de parcelado: so a parcela clicada, ela
 * e as seguintes, ou todas.
 *
 * Radios nativos com cara de controle segmentado: setas do teclado, foco e
 * leitor de tela vem do navegador, sem dependencia nova. Opcao barrada pela
 * trava fica desabilitada com o motivo escrito embaixo — esconde-la deixaria a
 * pessoa sem saber por que ela sumiu.
 */
export function ControleAlcance({ nome, valor, opcoes, onMudar, desabilitado }: Props) {
  const bloqueadas = opcoes.filter((o) => o.bloqueio !== null);

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">Alcance</legend>
      <div className="grid grid-cols-3 overflow-hidden rounded-caixa border border-borda">
        {opcoes.map((opcao) => (
          <label
            key={opcao.valor}
            className="flex cursor-pointer items-center justify-center border-l border-borda px-2 py-1.5 text-center text-xs text-tinta-fraca first:border-l-0 has-[:checked]:bg-superficie-alta has-[:checked]:font-medium has-[:checked]:text-tinta has-[:disabled]:cursor-not-allowed has-[:disabled]:text-tinta-apagada has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento has-[:focus-visible]:ring-inset"
          >
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              disabled={desabilitado === true || opcao.bloqueio !== null}
              onChange={() => onMudar(opcao.valor)}
              className="sr-only"
            />
            {ROTULOS[opcao.valor]}
          </label>
        ))}
      </div>
      {bloqueadas.map((opcao) => (
        <p key={opcao.valor} className="text-xs text-tinta-fraca">
          <span className="font-medium">{ROTULOS[opcao.valor]}:</span> {opcao.bloqueio}
        </p>
      ))}
    </fieldset>
  );
}
