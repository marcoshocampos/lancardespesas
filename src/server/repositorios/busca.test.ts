import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { buscarLancamentos } from './busca';
import { criarLancamento, excluirLancamento, type EntradaLancamento } from './lancamento';

// Grava e apaga no banco apontado por DATABASE_URL, como lancamento.test.ts.
// Mesmo opt-in e mesma guarda: so roda via `npm run test:banco`, contra a
// branch de teste, e recusa banco que ja tenha lancamento.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('busca', () => {
  let categoriaId: string;
  let membroId: string;
  let bancoLiberado = false;

  async function exigirBancoLivre(): Promise<void> {
    const existentes = await prisma.lancamento.count();
    if (existentes > 0) {
      throw new Error(
        `Banco tem ${existentes} lancamento(s) — recuso rodar TESTE_DESTRUTIVO aqui. ` +
          'Aponte DATABASE_URL para um banco vazio.',
      );
    }
    bancoLiberado = true;
  }

  async function limpar(): Promise<void> {
    if (!bancoLiberado) {
      throw new Error('limpar() chamada sem exigirBancoLivre() ter passado — nao apago nada.');
    }
    await prisma.parcela.deleteMany();
    await prisma.rateio.deleteMany();
    await prisma.lancamento.deleteMany();
    await prisma.fatura.deleteMany();
  }

  beforeAll(async () => {
    await exigirBancoLivre();
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    membroId = (await prisma.membro.findFirstOrThrow()).id;
  });

  beforeEach(async () => {
    await limpar();
  });

  afterAll(async () => {
    await limpar();
  });

  // 2099: competencias onde nunca havera dado real.
  async function criar(extras: Partial<EntradaLancamento> = {}): Promise<string> {
    const resultado = await criarLancamento({
      descricao: 'Farmácia',
      valorCentavos: 4590,
      origemValor: 'POR_PARCELA',
      dataCompra: '2099-01-10',
      numeroParcelas: 1,
      escopo: 'PESSOAL',
      membroId,
      contaId: 'conta-c6', // fecha dia 4, pelo seed
      categoriaId,
      ...extras,
    });
    if (!resultado.ok) throw new Error(`criacao recusada: ${resultado.motivo}`);
    return resultado.id;
  }

  it('acha sem acento, e deixa de fora o que esta na lixeira', async () => {
    const vivo = await criar({ descricao: 'Farmácia do centro' });
    const excluido = await criar({ descricao: 'Farmácia da esquina' });
    const { versao } = await prisma.lancamento.findUniqueOrThrow({ where: { id: excluido } });
    expect((await excluirLancamento(excluido, versao)).ok).toBe(true);

    const resultado = await buscarLancamentos('farmacia', '2099-01');

    expect(resultado.total).toBe(1);
    expect(resultado.itens.map((i) => i.lancamentoId)).toEqual([vivo]);
  });

  it('acha o parcelado pelo valor da parcela e pelo total', async () => {
    const id = await criar({ descricao: 'Geladeira', valorCentavos: 8990, numeroParcelas: 3 });
    const competencias = (
      await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } })
    ).map((p) => p.competencia);
    const [primeira, segunda, terceira] = competencias;
    if (!primeira || !segunda || !terceira) throw new Error('esperava tres parcelas');

    // Origem fora do lancamento: o destino e a primeira competencia.
    const pelaParcela = await buscarLancamentos('89,90', '2001-01');
    expect(pelaParcela.total).toBe(1);
    expect(pelaParcela.itens[0]).toMatchObject({
      lancamentoId: id,
      totalCentavos: 26970,
      numeroParcelas: 3,
      primeiraCompetencia: primeira,
      ultimaCompetencia: terceira,
      competenciaDestino: primeira,
    });

    expect((await buscarLancamentos('269,70', '2001-01')).total).toBe(1);

    // Origem dentro do lancamento: o destino e ela.
    const daSegunda = await buscarLancamentos('89,90', segunda);
    expect(daSegunda.itens[0]?.competenciaDestino).toBe(segunda);
  });

  it('corta no limite, do mais recente para o mais antigo, com o total certo', async () => {
    await criar({ descricao: 'Uber ida', dataCompra: '2099-01-05' });
    await criar({ descricao: 'Uber volta', dataCompra: '2099-01-20' });
    await criar({ descricao: 'Uber aeroporto', dataCompra: '2099-01-12' });

    const resultado = await buscarLancamentos('uber', '2099-01', 2);

    expect(resultado.total).toBe(3);
    expect(resultado.itens.map((i) => i.descricao)).toEqual(['Uber volta', 'Uber aeroporto']);
  });

  it('termo vazio nao consulta nada', async () => {
    await criar();
    expect(await buscarLancamentos('   ', '2099-01')).toEqual({ itens: [], total: 0 });
  });
});
