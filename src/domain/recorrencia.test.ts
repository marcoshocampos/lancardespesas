import { describe, expect, it } from 'vitest';
import { avancarCompetencia, competenciaDeCartao, competenciaDeContaExterna } from './competencia';
import { dataDaRecorrente, recorrentesPendentes } from './recorrencia';

const cartao = (diaFechamento: number) => ({ tipo: 'CARTAO' as const, diaFechamento });
const externa = { tipo: 'EXTERNA' as const, diaFechamento: null };

describe('dataDaRecorrente', () => {
  it('data no proprio mes quando a cobranca vem ate o fechamento', () => {
    expect(dataDaRecorrente('2026-12', 3, cartao(4))).toBe('2026-12-03');
    expect(dataDaRecorrente('2026-12', 4, cartao(4))).toBe('2026-12-04');
  });

  it('data no mes ANTERIOR quando a cobranca vem depois do fechamento', () => {
    // Dia 15, cartao que fecha dia 4: a cobranca de 15/11 esta na fatura de dezembro.
    expect(dataDaRecorrente('2026-12', 15, cartao(4))).toBe('2026-11-15');
  });

  it('atravessa a virada do ano', () => {
    expect(dataDaRecorrente('2027-01', 20, cartao(4))).toBe('2026-12-20');
  });

  it('conta externa cai no mes do proprio pagamento', () => {
    expect(dataDaRecorrente('2026-12', 15, externa)).toBe('2026-12-15');
  });

  it('limita o dia ao que o mes tem', () => {
    expect(dataDaRecorrente('2027-02', 31, externa)).toBe('2027-02-28');
    expect(dataDaRecorrente('2028-02', 31, externa)).toBe('2028-02-29');
  });

  it('usa o dia 1 quando o calendario poria a cobranca na fatura errada', () => {
    // Dia 31, fechamento 30, competencia de marco: a cobranca cairia em
    // fevereiro, que vira dia 28 — e o fechamento de fevereiro tambem vira 28,
    // pondo a compra na fatura de FEVEREIRO. Sem a correcao, editar esse
    // lancamento o mudaria de mes.
    const data = dataDaRecorrente('2027-03', 31, cartao(30));
    expect(data).toBe('2027-03-01');
    expect(competenciaDeCartao(data, 30)).toBe('2027-03');
  });

  it('recusa cartao sem dia de fechamento e dia fora de 1 a 31', () => {
    expect(() => dataDaRecorrente('2026-12', 5, { tipo: 'CARTAO', diaFechamento: null })).toThrow(
      'Conta de cartao sem dia de fechamento',
    );
    expect(() => dataDaRecorrente('2026-12', 0, externa)).toThrow('Dia da recorrente invalido');
    expect(() => dataDaRecorrente('2026-12', 32, externa)).toThrow('Dia da recorrente invalido');
  });

  it('SEMPRE devolve data que a regra do cartao poe na competencia pedida', () => {
    // A propriedade que importa, varrida inteira: todo dia, todo fechamento,
    // tres anos de competencias — fevereiro comum e bissexto incluidos. E ela
    // que garante que editar um lancamento gerado nao o muda de mes.
    let competencia = '2026-01';
    for (let m = 0; m < 36; m += 1) {
      for (let fechamento = 1; fechamento <= 31; fechamento += 1) {
        for (let dia = 1; dia <= 31; dia += 1) {
          const data = dataDaRecorrente(competencia, dia, cartao(fechamento));
          if (competenciaDeCartao(data, fechamento) !== competencia) {
            throw new Error(`falhou: competencia ${competencia}, dia ${dia}, fechamento ${fechamento} -> ${data}`);
          }
        }
      }
      competencia = avancarCompetencia(competencia, 1);
    }
  });

  it('a mesma propriedade vale para conta externa', () => {
    let competencia = '2026-01';
    for (let m = 0; m < 36; m += 1) {
      for (let dia = 1; dia <= 31; dia += 1) {
        expect(competenciaDeContaExterna(dataDaRecorrente(competencia, dia, externa))).toBe(competencia);
      }
      competencia = avancarCompetencia(competencia, 1);
    }
  });
});

describe('recorrentesPendentes', () => {
  const r = (id: string, extras: Partial<{ ativa: boolean; competenciaInicio: string; contaId: string }> = {}) => ({
    id,
    ativa: true,
    competenciaInicio: '2026-10',
    contaId: 'conta-c6',
    ...extras,
  });
  const vazio = new Set<string>();

  it('oferece a recorrente ativa, ja iniciada e ainda nao lancada', () => {
    expect(recorrentesPendentes([r('a')], '2026-12', vazio, vazio).map((x) => x.id)).toEqual(['a']);
  });

  it('vale a partir do proprio mes de inicio, e nao antes', () => {
    expect(recorrentesPendentes([r('a')], '2026-10', vazio, vazio)).toHaveLength(1);
    expect(recorrentesPendentes([r('a')], '2026-09', vazio, vazio)).toHaveLength(0);
  });

  it('nao oferece a desativada', () => {
    expect(recorrentesPendentes([r('a', { ativa: false })], '2026-12', vazio, vazio)).toHaveLength(0);
  });

  it('nao oferece de novo a que ja gerou lancamento neste mes', () => {
    // Inclusive se o lancamento foi para a lixeira: excluir e o jeito de pular
    // um mes, e quem chama monta `jaGeradas` contando os excluidos.
    expect(recorrentesPendentes([r('a'), r('b')], '2026-12', new Set(['a']), vazio).map((x) => x.id)).toEqual(['b']);
  });

  it('nao oferece a de conta com fatura travada no mes', () => {
    const lista = [r('a'), r('b', { contaId: 'conta-externa' })];
    expect(recorrentesPendentes(lista, '2026-12', vazio, new Set(['conta-c6'])).map((x) => x.id)).toEqual(['b']);
  });
});
