import type { ParcelaResumo } from '../totais';

/**
 * Mes de referencia INVENTADO, para os testes de total.
 *
 * Nao sao numeros reais do casal, de proposito: o repositorio nao recebe dado
 * financeiro (`CLAUDE.md`, secao Convencoes). A conferencia contra a planilha
 * de verdade e feita na tela, pelo roteiro em `docs/verificacao-visual.md`.
 *
 * Os valores foram escolhidos redondos para poderem ser somados na mao, e o
 * conjunto e IMPAR de proposito — e o unico jeito de a sobra de centavos
 * aparecer no teste.
 */

export const NARDY = 'membro-nardy';
export const NICK = 'membro-nick';
export const C6 = 'conta-c6';
export const EXTERNA = 'conta-externa';

function pessoal(contaId: string, membroId: string, valorCentavos: number): ParcelaResumo {
  return { contaId, escopo: 'PESSOAL', membroId, valorCentavos };
}

/**
 * Divide ao meio em inteiros, com a sobra indo para Nick — o mesmo destino que
 * `Membro.absorveSobra` define no banco. `trunc` em vez de `floor` para que a
 * sobra continue no Nick tambem quando o valor e negativo.
 */
function conjunto(contaId: string, valorCentavos: number): ParcelaResumo {
  const cotaNardy = Math.trunc(valorCentavos / 2);
  const cotaNick = valorCentavos - cotaNardy;
  return {
    contaId,
    escopo: 'CONJUNTO',
    valorCentavos,
    cotas: [
      { membroId: NARDY, valorCentavos: cotaNardy },
      { membroId: NICK, valorCentavos: cotaNick },
    ],
  };
}

export const PARCELAS_DO_MES: ParcelaResumo[] = [
  // Nardy, no cartao — soma 423,75
  pessoal(C6, NARDY, 10000),
  pessoal(C6, NARDY, 25050),
  pessoal(C6, NARDY, 7325),

  // Nick, no cartao — soma 500,75
  pessoal(C6, NICK, 30000),
  pessoal(C6, NICK, 15075),
  pessoal(C6, NICK, 5000),

  // Conjunto, no cartao — 101,01, impar: Nardy 50,50 e Nick 50,51
  conjunto(C6, 10101),

  // Nick, fora do cartao — 80,00
  pessoal(EXTERNA, NICK, 8000),
];
