import { ALCANCES, alcanceDaFaixa, parcelasDaFaixa, type Alcance } from '@/domain/divisao';
import type { Faixa } from '@/domain/parcelamento';
import {
  acharTrava,
  competenciasTravadasDaConta,
  descreverTrava,
  type FaturaTravada,
  type Trava,
} from '@/domain/trava';
import type { LinhaGrade } from '@/server/repositorios/resumo';
import type { OpcaoDeAlcance } from './controle-alcance';

export function faixaDaLinha(linha: LinhaGrade): Faixa {
  return { inicial: linha.parcelaInicial, final: linha.parcelaFinal };
}

/** A linha tem mais de uma parcela para escolher; senao o controle nao aparece. */
export function temAlcance(linha: LinhaGrade): boolean {
  return linha.parcelaFinal > linha.parcelaInicial;
}

/**
 * A trava que o alcance encontraria, vista da tela. So enxerga as faturas da
 * janela carregada: quem decide de verdade e a barreira do servidor.
 */
export function travaDoAlcance(
  linha: LinhaGrade,
  competencia: string,
  travadas: readonly FaturaTravada[],
  alcance: Alcance,
): Trava | null {
  const alvo = alcanceDaFaixa(faixaDaLinha(linha), linha.numero, alcance);
  const parcelas = parcelasDaFaixa(alvo, { numero: linha.numero, competencia });
  const achada = acharTrava(parcelas, competenciasTravadasDaConta(travadas, linha.contaId));
  return achada
    ? { ...achada, numeroParcelas: linha.numeroParcelas, contaNome: linha.contaNome }
    : null;
}

export function opcoesDeAlcance(
  linha: LinhaGrade,
  competencia: string,
  travadas: readonly FaturaTravada[],
): OpcaoDeAlcance[] {
  return ALCANCES.map((valor) => {
    const trava = travaDoAlcance(linha, competencia, travadas, valor);
    return { valor, bloqueio: trava ? descreverTrava(trava) : null };
  });
}

/**
 * O primeiro alcance livre, do menos ao mais abrangente. `null` quando nem
 * "so esta" esta livre — o mes da propria linha esta travado.
 */
export function alcanceInicial(opcoes: readonly OpcaoDeAlcance[]): Alcance | null {
  return opcoes.find((o) => o.bloqueio === null)?.valor ?? null;
}
