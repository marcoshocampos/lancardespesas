import {
  avancarCompetencia,
  competenciaBaseDaFatura,
  competenciaDeCartao,
  competenciaDeContaExterna,
  formatarCompetencia,
  type Competencia,
} from './competencia';

/** Quantos meses o seletor de Fatura mostra para cada lado do mes da tela. */
export const RAIO_DA_FATURA = 12;

export type FaturaTravada = { contaId: string; competencia: Competencia };

/** Uma parcela, pelo que a barreira de trava precisa saber dela. */
export type ParcelaAlvo = { numero: number; competencia: Competencia };

/** O que a recusa de trava diz: qual parcela, em que mes, de que conta. */
export type Trava = {
  numero: number;
  numeroParcelas: number;
  competencia: Competencia;
  contaNome: string;
};

export function competenciasTravadasDaConta(
  travadas: readonly FaturaTravada[],
  contaId: string,
): Set<Competencia> {
  return new Set(travadas.filter((f) => f.contaId === contaId).map((f) => f.competencia));
}

/**
 * A primeira parcela, pelo numero, que cai num mes travado. `null` quando
 * nenhuma cai.
 *
 * A trava congela PARCELA, nao lancamento: quem chama passa so as parcelas que
 * a operacao apaga ou grava. Parcela que a operacao nao alcanca nao pode barrar
 * nada — barrar por ela era o defeito que impedia editar dezembro de um
 * parcelado que passava por novembro travado.
 */
export function acharTrava(
  parcelas: readonly ParcelaAlvo[],
  travadas: ReadonlySet<Competencia>,
): ParcelaAlvo | null {
  let achada: ParcelaAlvo | null = null;
  for (const parcela of parcelas) {
    if (!travadas.has(parcela.competencia)) continue;
    if (achada === null || parcela.numero < achada.numero) achada = parcela;
  }
  return achada;
}

/**
 * A frase da recusa. Nomeia a parcela, o mes e a conta porque a mensagem
 * antiga — "Esse mes ja esta fechado" — fazia pensar no mes aberto na tela, e
 * quem a obedecia ia procurar o Destravar na fatura errada.
 */
export function descreverTrava(trava: Trava): string {
  const mes = formatarCompetencia(trava.competencia);
  const soOMes = mes.slice(0, mes.indexOf(' de '));
  const parcelado = trava.numeroParcelas > 1;
  const quem = parcelado ? `A parcela ${trava.numero}` : 'Esse lançamento';
  const objeto = parcelado ? 'mudá-la' : 'mudá-lo';
  return (
    `${quem} cai em ${mes}, e a fatura do ${trava.contaNome} desse mês está travada. ` +
    `Destrave-a no Resumo de ${soOMes} para ${objeto}.`
  );
}

type ContaDaData = { tipo: 'CARTAO' | 'EXTERNA'; diaFechamento: number | null };

const DATA_COMPLETA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Em que Fatura a parcela `numero` cairia pela data, quando isso difere da
 * Fatura escolhida. `null` quando concordam, e quando a data ainda nao e uma
 * data — o aviso nao e lugar para lancar.
 *
 * Compara as competencias BASE, e nao as Faturas: a parcela 9 de uma compra de
 * abril, aberta em dezembro, concorda com a data, ainda que dezembro nao seja
 * abril.
 */
export function divergenciaDaData(
  dataCompra: string,
  conta: ContaDaData,
  fatura: Competencia,
  numero: number,
): Competencia | null {
  if (!DATA_COMPLETA.test(dataCompra)) return null;

  let basePelaData: Competencia;
  try {
    basePelaData =
      conta.tipo === 'CARTAO' && conta.diaFechamento !== null
        ? competenciaDeCartao(dataCompra, conta.diaFechamento)
        : competenciaDeContaExterna(dataCompra);
  } catch {
    // Data fora do calendario (31 de fevereiro): as funcoes de competencia
    // lancam, e aqui isso so quer dizer "nao ha o que comparar ainda".
    return null;
  }

  if (basePelaData === competenciaBaseDaFatura(fatura, numero)) return null;
  return avancarCompetencia(basePelaData, numero - 1);
}
