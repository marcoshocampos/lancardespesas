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

describe('interpretarPlanilha — bloco Outros', () => {
  it('interpreta uma linha do bloco Outros como lancamento normal, na conta externa', () => {
    // O bloco Outros hoje e despesa fora do cartao (spec, revisao 2026-08-09,
    // secao 12), nao mais divida entre o casal. A linha nao pode ser
    // descartada: precisa virar um item de conta EXTERNA, com o dono
    // resolvido pelo cabecalho do sub-bloco.
    const csv = [
      'Nardy',
      'compra normal,"R$50,00",,Presente',
      'Outros',
      'sub bloco ficticio,,,',
      'manutencao da moto,"R$80,00",,Veiculo',
      'FATURA:,"R$50,00",,',
    ].join('\n');

    const mapa: Record<string, 'Nardy' | 'Nick'> = { 'sub bloco ficticio': 'Nick' };
    const resultado = interpretarPlanilha(csv, mapa);

    expect(resultado.faturaEsperada).toBe(5000);
    expect(resultado.itens).toEqual([
      {
        descricao: 'compra normal',
        valorCentavos: 5000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Presente',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
      {
        descricao: 'manutencao da moto',
        valorCentavos: 8000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Veiculo',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
    ]);
  });

  it('aborta e cita o cabecalho, a quantidade e a soma quando o sub-bloco nao esta no mapa', () => {
    // "voce nao pode adivinhar" a quem o gasto pertence: um cabecalho de
    // sub-bloco desconhecido tem que abortar em vez de pular a linha, e a
    // mensagem precisa dizer o que esta em risco (nao so "desconhecido").
    const csv = [
      'Outros',
      'sub bloco desconhecido,,,',
      'gasto 1,"R$50,00",,Presente',
      'gasto 2,"R$25,00",,Jogo',
    ].join('\n');

    expect(() => interpretarPlanilha(csv, {})).toThrow(
      'Cabecalho de sub-bloco desconhecido no bloco Outros: "sub bloco desconhecido". ' +
        '2 linha(s), soma R$ 75,00, estao em risco de nao ser importadas. Complete o mapa ' +
        'DONO_DO_SUBBLOCO_OUTROS antes de importar.',
    );
  });

  it('recusa linha de Outros sem cabecalho de sub-bloco antes dela', () => {
    const csv = ['Outros', 'gasto sem sub-bloco,"R$10,00",,Jogo'].join('\n');

    expect(() => interpretarPlanilha(csv, {})).toThrow('sem sub-bloco definido');
  });

  it('sub-bloco "Nick > Nardy" produz lancamento externo com dono Nick', () => {
    // O PRIMEIRO nome e o dono do gasto, nao o segundo — resquicio de quando
    // Outros era direcao de divida entre o casal.
    const csv = [
      'Outros',
      'Nick > Nardy,,,',
      'manutencao da moto,"R$80,00",,Veiculo',
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'manutencao da moto',
        valorCentavos: 8000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Veiculo',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
    ]);
  });

  it('sub-bloco "Nardy > Nick" produz lancamento externo com dono Nardy', () => {
    const csv = [
      'Outros',
      'Nardy > Nick,,,',
      'presente sogra,"R$45,00",,Presente',
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'presente sogra',
        valorCentavos: 4500,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Presente',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
    ]);
  });
});

describe('interpretarPlanilha — Outros sem colidir com bloco principal', () => {
  // Os cabecalhos de sub-bloco reais ("Nardy > Nick", "Nick > Nardy") nao tem
  // o mesmo texto de nenhum bloco principal, entao nao ha mais ambiguidade a
  // resolver dentro de Outros: nenhuma guarda de ordem e necessaria.

  it('mes sem bloco Conjunto no cartao, com sub-bloco Nick > Nardy em Outros, importa normalmente', () => {
    // Este e o cenario que a guarda de ordem especulativa recusava por
    // engano: sem despesa conjunta no cartao naquele mes, o bloco Conjunto
    // nunca aparece no arquivo, e isso nao pode impedir Outros de ser
    // importado.
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Nick',
      'compra nick,"R$30,00",,Jogo',
      'Outros',
      'Nick > Nardy,,,',
      'manutencao da moto,"R$80,00",,Veiculo',
      'FATURA:,"R$80,00",,',
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.faturaEsperada).toBe(8000);
    expect(resultado.itens).toEqual([
      {
        descricao: 'compra nardy',
        valorCentavos: 5000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Presente',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
      {
        descricao: 'compra nick',
        valorCentavos: 3000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Jogo',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
      {
        descricao: 'manutencao da moto',
        valorCentavos: 8000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Veiculo',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
    ]);
  });

  it('cabecalho Conjunto depois de Outros reabre o bloco principal, linhas seguintes vao para o cartao', () => {
    // "Conjunto" nao esta mais no mapa de sub-blocos, entao esse cabecalho e
    // sempre bloco principal, mesmo aparecendo depois de Outros.
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Outros',
      'Nick > Nardy,,,',
      'manutencao da moto,"R$80,00",,Veiculo',
      'Conjunto',
      'compra conjunta,"R$20,00",,Assinatura',
      'FATURA:,"R$70,00",,',
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'compra nardy',
        valorCentavos: 5000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Presente',
        contaTipo: 'CARTAO',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
      {
        descricao: 'manutencao da moto',
        valorCentavos: 8000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Veiculo',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nick',
      },
      {
        descricao: 'compra conjunta',
        valorCentavos: 2000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Assinatura',
        contaTipo: 'CARTAO',
        escopo: 'CONJUNTO',
        dono: null,
      },
    ]);
  });
});
