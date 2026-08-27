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

  it('sub-bloco "Nick > Nardy" (forma antiga) produz lancamento com dono Nick', () => {
    // Forma antiga, de quando Outros era direcao de divida: o PRIMEIRO nome
    // e o dono do gasto, nao o segundo.
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

  it('sub-bloco "Nardy" (forma nova) produz lancamento com dono Nardy', () => {
    // Forma nova: o cabecalho diz o dono direto, igual aos blocos do cartao.
    // O bloco principal Nardy precisa aparecer antes (mesmo vazio) para a
    // guarda de ordem dentro de Outros nao confundir este cabecalho com uma
    // reabertura do bloco principal — ver describe de ordem mais abaixo.
    const csv = ['Nardy', 'Outros', 'Nardy,,,', 'gasto da nardy,"R$20,00",,Presente'].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'gasto da nardy',
        valorCentavos: 2000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Presente',
        contaTipo: 'EXTERNA',
        escopo: 'PESSOAL',
        dono: 'Nardy',
      },
    ]);
  });

  it('sub-bloco "Conjunto" dentro de Outros produz lancamento de escopo CONJUNTO', () => {
    // Boleto do casal pago fora do cartao (ex.: condominio) precisa de
    // escopo CONJUNTO com rateio, nao PESSOAL — e o tipo antigo do mapa
    // (so Nardy | Nick) nao tinha onde colocar esse caso. O bloco principal
    // Conjunto precisa aparecer antes (mesmo vazio), pelo mesmo motivo do
    // teste acima.
    const csv = ['Conjunto', 'Outros', 'Conjunto,,,', 'boleto condominio,"R$400,00",,Moradia'].join(
      '\n',
    );

    const resultado = interpretarPlanilha(csv);

    expect(resultado.itens).toEqual([
      {
        descricao: 'boleto condominio',
        valorCentavos: 40000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Moradia',
        contaTipo: 'EXTERNA',
        escopo: 'CONJUNTO',
        dono: null,
      },
    ]);
  });

  it('cabecalho desconhecido continua abortando mesmo com o mapa padrao preenchido', () => {
    const csv = [
      'Outros',
      'sub bloco realmente desconhecido,,,',
      'gasto 1,"R$50,00",,Presente',
    ].join('\n');

    expect(() => interpretarPlanilha(csv)).toThrow(
      'Cabecalho de sub-bloco desconhecido no bloco Outros: "sub bloco realmente desconhecido".',
    );
  });
});

describe('interpretarPlanilha — ordem dos blocos dentro de Outros', () => {
  // A forma nova de sub-bloco usa texto identico ao dos blocos principais
  // ("Nardy", "Nick", "Conjunto"). Isso so e seguro se Outros vem depois dos
  // blocos do cartao no arquivo, porque e assim que o cabecalho consegue
  // distinguir "sub-bloco novo" de "reabertura do bloco principal". Estes
  // testes provam que a guarda de ordem torna essa premissa uma verificacao,
  // nao um comentario que confia sem checar.

  it('Outros depois dos tres blocos do cartao, com sub-bloco Conjunto: funciona como hoje', () => {
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Nick',
      'compra nick,"R$30,00",,Jogo',
      'Conjunto',
      'compra conjunta,"R$20,00",,Assinatura',
      'Outros',
      'Conjunto,,,',
      'boleto conjunto,"R$40,00",,Terceiros',
      'FATURA:,"R$100,00",,',
    ].join('\n');

    const resultado = interpretarPlanilha(csv);

    expect(resultado.faturaEsperada).toBe(10000);
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
        descricao: 'compra conjunta',
        valorCentavos: 2000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Assinatura',
        contaTipo: 'CARTAO',
        escopo: 'CONJUNTO',
        dono: null,
      },
      {
        descricao: 'boleto conjunto',
        valorCentavos: 4000,
        parcelaAtual: 1,
        totalParcelas: 1,
        categoria: 'Terceiros',
        contaTipo: 'EXTERNA',
        escopo: 'CONJUNTO',
        dono: null,
      },
    ]);
  });

  it('Outros antes de um bloco principal Conjunto legitimo: aborta citando a ordem', () => {
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Outros',
      'Conjunto,,,',
      'boleto conjunto,"R$30,00",,Terceiros',
      'Conjunto',
      'compra conjunta,"R$20,00",,Assinatura',
      'FATURA:,"R$70,00",,',
    ].join('\n');

    expect(() => interpretarPlanilha(csv)).toThrow(
      'Cabecalho "Conjunto" apareceu dentro do bloco Outros antes de existir como bloco ' +
        'principal. A ordem dos blocos provavelmente mudou',
    );
  });

  it('Outros antes de um bloco cujo total e zero: aborta mesmo sem a fatura divergir', () => {
    // O caso que passava despercebido: se o bloco reordenado nao somar nada
    // (aqui, Conjunto sem nenhum lancamento), a conferencia final de
    // FATURA: nao teria como perceber a diferenca — so a guarda de ordem
    // pega, e pega antes de qualquer lancamento ser classificado errado.
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Outros',
      'Conjunto,,,',
      'boleto perdido,"R$0,00",,Terceiros',
      'Conjunto',
      'FATURA:,"R$50,00",,',
    ].join('\n');

    expect(() => interpretarPlanilha(csv)).toThrow(
      'Cabecalho "Conjunto" apareceu dentro do bloco Outros antes de existir como bloco ' +
        'principal. A ordem dos blocos provavelmente mudou',
    );
  });

  it('sub-bloco no formato antigo funciona independente da ordem dos blocos', () => {
    // "Nick > Nardy" nao tem o mesmo texto de nenhum bloco principal, entao a
    // guarda de ordem nunca se aplica a ele — funciona mesmo quando o nome
    // referenciado (Nick) nunca chega a aparecer como bloco principal neste
    // arquivo. Nardy aparece antes so para o CSV ter mais de um bloco; o
    // ponto do teste e o sub-bloco Outros, nao o bloco Nardy.
    const csv = [
      'Nardy',
      'compra nardy,"R$50,00",,Presente',
      'Outros',
      'Nick > Nardy,,,',
      'manutencao da moto,"R$80,00",,Veiculo',
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
    ]);
  });
});
