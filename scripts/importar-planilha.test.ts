import { describe, expect, it } from 'vitest';
import { interpretarLinha, interpretarPlanilha } from './importar-planilha';

describe('interpretarLinha', () => {
  it('interpreta uma linha parcelada', () => {
    expect(interpretarLinha(['aparelho', 'R$100,00', '6/12', 'Terceiros'])).toEqual({
      descricao: 'aparelho',
      valorCentavos: 10000,
      parcelaAtual: 6,
      totalParcelas: 12,
      categoria: 'Terceiros',
    });
  });

  it('interpreta uma linha a vista, sem parcela', () => {
    expect(interpretarLinha(['google', 'R$88,00', '', 'Assinatura'])).toEqual({
      descricao: 'google',
      valorCentavos: 8800,
      parcelaAtual: 1,
      totalParcelas: 1,
      categoria: 'Assinatura',
    });
  });

  it('interpreta valor com separador de milhar', () => {
    const linha = interpretarLinha(['moto', 'R$432,10', '2/12', 'Veículo']);
    expect(linha?.valorCentavos).toBe(43210);
    expect(linha?.totalParcelas).toBe(12);
  });

  it('ignora linha vazia da planilha', () => {
    expect(interpretarLinha(['', '', '', ''])).toBeNull();
    expect(interpretarLinha([])).toBeNull();
  });

  it('ignora as linhas de total', () => {
    expect(interpretarLinha(['TOTAL:', 'R$423,75', '', ''])).toBeNull();
    expect(interpretarLinha(['TOTAL GERAL:', 'R$474,25', '', ''])).toBeNull();
    expect(interpretarLinha(['FATURA:', 'R$1.025,51', '', ''])).toBeNull();
  });

  it('recusa parcela mal formada em vez de adivinhar', () => {
    expect(() => interpretarLinha(['x', 'R$10,00', '6-12', 'Jogo'])).toThrow('Parcela invalida');
  });
});

// A planilha real e COLUNAR: a linha de grupos ("C6"/"OUTROS") e a primeira
// linha nao-em-branco do arquivo; a linha de blocos ("Nardy", "Conjunto",
// "Nardy > Nick"...) fica logo acima da linha de colunas ("Descricao",
// "Valor", "Parcela", "Categoria"), cada nome de bloco na coluna onde ele
// comeca. `linha(...)` monta uma linha de CSV a partir das celulas (uma por
// coluna absoluta), e `q(...)` cerca um valor em aspas — necessario porque
// "R$10,00" tem virgula, e sem aspas o divisor de CSV cortaria a celula ao
// meio.
function linha(...celulas: string[]): string {
  return celulas.join(',');
}

function q(valor: string): string {
  return `"${valor}"`;
}

describe('interpretarPlanilha (formato colunar)', () => {
  it('deriva a faixa de cada bloco do cabecalho: um bloco com Parcela (C6) e um sem Parcela (Outros)', () => {
    // O bloco Conjunto (C6) tem as quatro colunas; o sub-bloco Nardy > Nick
    // (Outros) so tem Descricao e Valor — a planilha real e assim (ver
    // brief da Tarefa 16). O leitor deriva os offsets de cada um a partir
    // do cabecalho, nao de uma posicao fixa; a linha TOTAL: aparece em
        // colunas diferentes (1 para o bloco C6, 5 para o de Outros), e ainda
    // assim e reconhecida e ignorada nos dois.
    const csv = [
      linha('', 'C6', '', '', '', 'OUTROS'),
      linha(''),
      linha('', 'Conjunto', '', '', '', 'Nardy > Nick'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Parcela', 'Categoria', 'Descricao', 'Valor'),
      linha('', 'item conjunto', q('R$10,00'), '2/3', 'Presente', 'item outros', q('R$5,00')),
      linha('', 'TOTAL:', q('R$10,00'), '', '', 'TOTAL:', q('R$5,00')),
      linha('', 'FATURA:', q('R$10,00')),
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.faturaEsperada).toBe(1000);
    expect(resultado.itens).toEqual([
      {
        descricao: 'item conjunto',
        valorCentavos: 1000,
        parcelaAtual: 2,
        totalParcelas: 3,
        categoria: 'Presente',
        contaTipo: 'CARTAO',
        escopo: 'CONJUNTO',
        dono: null,
      },
      {
        descricao: 'item outros',
        valorCentavos: 500,
        parcelaAtual: 1,
        totalParcelas: 1,
        // Nenhum sub-bloco de Outros tem coluna Categoria: cai em "Sem categoria".
        categoria: 'Sem categoria',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
    ]);
  });

  it('reconhece a linha de total pelo texto, nao pela posicao: rotulos em colunas bem diferentes sao ambos ignorados', () => {
    // Celulas mescladas fazem "TOTAL:" mudar de coluna conforme o bloco.
    // Aqui os dois blocos tem larguras diferentes (Nardy so Descricao+Valor,
    // Nick as quatro colunas), entao os rotulos TOTAL: caem em colunas
    // absolutas bem distantes (1 e 3) — um leitor com posicao fixa erraria
    // um dos dois.
    const csv = [
      linha('', 'C6'),
      linha(''),
      linha('', 'Nardy', '', 'Nick'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Descricao', 'Valor', 'Parcela', 'Categoria'),
      linha('', 'item nardy', q('R$20,00'), 'item nick', q('R$30,00'), '', 'Jogo'),
      linha('', 'TOTAL:', q('R$20,00'), 'TOTAL:', q('R$30,00'), '', ''),
      linha('', 'FATURA:', q('R$50,00')),
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.faturaEsperada).toBe(5000);
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens.map((item) => item.descricao)).toEqual(['item nardy', 'item nick']);
    expect(resultado.itens.map((item) => item.valorCentavos)).toEqual([2000, 3000]);
  });

  it('bloco vazio (cabecalho presente, nenhuma linha de lancamento) nao gera item nem erro', () => {
    const csv = [
      linha('', 'C6'),
      linha(''),
      linha('', 'Nardy', '', '', '', 'Conjunto'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Parcela', 'Categoria', 'Descricao', 'Valor', 'Parcela', 'Categoria'),
      linha('', 'item nardy', q('R$15,00'), '', 'Jogo', '', '', '', ''),
      linha('', 'TOTAL:', q('R$15,00'), '', '', '', '', '', ''),
      linha('', 'FATURA:', q('R$15,00')),
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'item nardy',
        valorCentavos: 1500,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Jogo',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
    ]);
  });

  it('linha de C6 sem Categoria preenchida cai em Sem categoria, sem adivinhar classificacao', () => {
    const csv = [
      linha('', 'C6'),
      linha(''),
      linha('', 'Nardy'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Parcela', 'Categoria'),
      linha('', 'item sem categoria', q('R$12,00'), '', ''),
      linha('', 'FATURA:', q('R$12,00')),
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'item sem categoria',
        valorCentavos: 1200,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Sem categoria',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
    ]);
  });

  it('aborta e cita o cabecalho, a quantidade e a soma quando o sub-bloco de Outros nao esta no mapa', () => {
    // "voce nao pode adivinhar" a quem o gasto pertence: um cabecalho de
    // sub-bloco desconhecido tem que abortar em vez de pular a linha, e a
    // mensagem precisa dizer o que esta em risco (nao so "desconhecido").
    const csv = [
      linha('', 'OUTROS'),
      linha(''),
      linha('', 'sub bloco desconhecido'),
      linha(''),
      linha('', 'Descricao', 'Valor'),
      linha('', 'gasto 1', q('R$50,00')),
      linha('', 'gasto 2', q('R$25,00')),
    ].join('\n');

    expect(() => interpretarPlanilha(csv, {})).toThrow(
      'Cabecalho de sub-bloco desconhecido no bloco Outros: "sub bloco desconhecido". ' +
        '2 linha(s), soma R$ 75,00, estao em risco de nao ser importadas. Complete o mapa ' +
        'DONO_DO_SUBBLOCO_OUTROS antes de importar.',
    );
  });

  it('aborta com o mapa de producao quando o cabecalho nao esta nele', () => {
    // Os testes acima passam um mapa fornecido pelo proprio teste ({} ou um
    // mapa ficticio) — provam a funcao, mas nao a configuracao real. Este
    // usa o DONO_DO_SUBBLOCO_OUTROS de producao (sem terceiro argumento),
    // porque o aborto e a unica defesa contra descartar lancamento em
    // silencio: se a normalizacao de cabecalho ficar permissiva demais, ou
    // uma entrada larga demais for acrescentada ao mapa, e aqui que a
    // suite percebe.
    const csv = [
      linha('', 'OUTROS'),
      linha(''),
      linha('', 'Nardy > Nick > Sogra'),
      linha(''),
      linha('', 'Descricao', 'Valor'),
      linha('', 'presente sogra', q('R$45,00')),
    ].join('\n');

    expect(() => interpretarPlanilha(csv)).toThrow(
      'Cabecalho de sub-bloco desconhecido no bloco Outros: "Nardy > Nick > Sogra".',
    );
  });

  it('cabecalho de bloco desconhecido no grupo C6 aborta citando o grupo', () => {
    const csv = [
      linha('', 'C6'),
      linha(''),
      linha('', 'Sogra'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Parcela', 'Categoria'),
      linha('', 'presente', q('R$45,00'), '', 'Presente'),
    ].join('\n');

    expect(() => interpretarPlanilha(csv)).toThrow(
      'Cabecalho de bloco desconhecido no grupo C6: "Sogra". 1 linha(s), soma R$ 45,00, ' +
        'estao em risco de nao ser importadas. Os nomes reconhecidos sao Nardy, Nick e Conjunto.',
    );
  });

  it('sub-bloco "Nick > Nardy" (com coluna Parcela) usa o mapa de producao e produz lancamento externo com dono Nick', () => {
    // O PRIMEIRO nome e o dono do gasto, nao o segundo — resquicio de quando
    // Outros era direcao de divida entre o casal. Este sub-bloco, ao
    // contrario de Nardy > Nick, tem coluna Parcela na planilha real.
    const csv = [
      linha('', 'OUTROS'),
      linha(''),
      linha('', 'Nick > Nardy'),
      linha(''),
      linha('', 'Descricao', 'Valor', 'Parcela'),
      linha('', 'item ficticio', q('R$80,00'), '3/6'),
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'item ficticio',
        valorCentavos: 8000,
        parcelaAtual: 3,
        totalParcelas: 6,
        categoria: 'Sem categoria',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
    ]);
  });
});
