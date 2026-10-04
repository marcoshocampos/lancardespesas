import type { Centavos } from './money';

export type PesoRateio = { membroId: string; percentual: number };
export type Cota = { membroId: string; valorCentavos: Centavos };

/**
 * Divisao igual entre os membros informados, na ordem em que vierem.
 *
 * Recusa lista vazia pelo mesmo motivo que `ratear`, e com a mesma mensagem.
 * Sem a recusa, `map` sobre lista vazia devolvia `[]` em silencio: um
 * lancamento de escopo CONJUNTO era gravado com ZERO rateios, e dali em diante
 * `calcularResumo` lancava "Parcela de conjunto sem rateio" e o mes inteiro
 * deixava de abrir. O erro aparecia na leitura, longe da gravacao que o
 * causou. E alcancavel no dia em que existir acao de desativar pessoa — ver a
 * armadilha 12 em docs/arquitetura.md.
 */
export function pesosMeioAMeio(membroIds: string[]): PesoRateio[] {
  if (membroIds.length === 0) throw new Error('Rateio exige ao menos um membro');
  const percentual = 100 / membroIds.length;
  return membroIds.map((membroId) => ({ membroId, percentual }));
}

/**
 * Divide um valor entre membros conforme os percentuais.
 *
 * O resto de centavos vai para o PRIMEIRO peso da lista, sempre — nunca alterna.
 * Esta funcao nao decide QUEM e o primeiro: so respeita a ordem que recebeu. Quem
 * monta a lista decide isso, na leitura (src/server/repositorios/resumo.ts), pelo
 * campo Membro.absorveSobra. O resultado assim nao depende do historico e pode
 * ser conferido na mao.
 */
export function ratear(valorCentavos: Centavos, pesos: PesoRateio[]): Cota[] {
  if (pesos.length === 0) throw new Error('Rateio exige ao menos um membro');

  const soma = pesos.reduce((acc, p) => acc + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-9) {
    throw new Error(`Percentuais devem somar 100, somaram ${soma}`);
  }

  const negativo = valorCentavos < 0;
  const absoluto = Math.abs(valorCentavos);

  const cotas = pesos.map((peso) => ({
    membroId: peso.membroId,
    valorCentavos: Math.trunc((absoluto * peso.percentual) / 100),
  }));

  const distribuido = cotas.reduce((acc, c) => acc + c.valorCentavos, 0);
  const primeira = cotas[0];
  if (primeira) primeira.valorCentavos += absoluto - distribuido;

  return negativo
    ? cotas.map((c) => ({ ...c, valorCentavos: -c.valorCentavos }))
    : cotas;
}
