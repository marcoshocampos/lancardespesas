import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dataDaRecorrente } from '@/domain/recorrencia';
import { prisma } from '../db';
import { editarLancamento, excluirLancamento } from './lancamento';
import {
  carregarRecorrentesPendentes,
  criarRecorrente,
  lancarRecorrentes,
  type DadosDaRecorrente,
} from './recorrente';

// Grava e apaga no banco apontado por DATABASE_URL, como lancamento.test.ts.
// Mesmo opt-in e mesma guarda: so roda via `npm run test:banco`, contra a
// branch de teste, e recusa banco que ja tenha lancamento.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('recorrentes', () => {
  // 2099: competencias onde nunca havera dado real.
  const MES = '2099-03';
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
    await prisma.recorrente.deleteMany();
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

  const dados = (extras: Partial<DadosDaRecorrente> = {}): DadosDaRecorrente => ({
    descricao: 'nuvem',
    valorCentavos: 4990,
    escopo: 'PESSOAL',
    membroId,
    contaId: 'conta-c6', // fecha dia 4, pelo seed
    categoriaId,
    diaDoMes: 15,
    competenciaInicio: '2099-01',
    ...extras,
  });

  it('lanca a pendente com a data que reproduz a competencia', async () => {
    const { id } = await criarRecorrente(dados());

    const resultado = await lancarRecorrentes(MES);
    expect(resultado).toEqual({ lancadas: 1, puladas: 0 });

    const gerado = await prisma.lancamento.findFirstOrThrow({
      where: { recorrenteId: id },
      include: { parcelas: true },
    });
    // Dia 15 num cartao que fecha dia 4: a cobranca de 15/02 esta na fatura de marco.
    expect(gerado.dataCompra).toBe('2099-02-15');
    expect(gerado.dataCompra).toBe(
      dataDaRecorrente(MES, 15, { tipo: 'CARTAO', diaFechamento: 4 }),
    );
    expect(gerado.competenciaRecorrente).toBe(MES);
    expect(gerado.numeroParcelas).toBe(1);
    expect(gerado.parcelas.map((p) => p.competencia)).toEqual([MES]);
  });

  it('nao oferece nem lanca de novo no mesmo mes', async () => {
    await criarRecorrente(dados());
    await lancarRecorrentes(MES);

    expect(await carregarRecorrentesPendentes(MES)).toEqual([]);
    expect(await lancarRecorrentes(MES)).toEqual({ lancadas: 0, puladas: 0 });
    expect(await prisma.lancamento.count()).toBe(1);
  });

  it('segura dois cliques simultaneos pelo indice unico', async () => {
    // As duas triagens veem a recorrente como pendente; quem impede a
    // duplicata e o indice em (recorrenteId, competenciaRecorrente).
    await criarRecorrente(dados());

    const [a, b] = await Promise.all([lancarRecorrentes(MES), lancarRecorrentes(MES)]);

    expect(a.lancadas + b.lancadas).toBe(1);
    expect(await prisma.lancamento.count()).toBe(1);
  });

  it('excluir o lancamento gerado pula o mes, sem reoferecer', async () => {
    const { id } = await criarRecorrente(dados());
    await lancarRecorrentes(MES);
    const gerado = await prisma.lancamento.findFirstOrThrow({ where: { recorrenteId: id } });

    expect((await excluirLancamento(gerado.id, gerado.versao)).ok).toBe(true);

    expect(await carregarRecorrentesPendentes(MES)).toEqual([]);
    expect(await lancarRecorrentes(MES)).toEqual({ lancadas: 0, puladas: 0 });
    // O mes seguinte continua oferecendo normalmente.
    expect(await carregarRecorrentesPendentes('2099-04')).toHaveLength(1);
  });

  it('editar o lancamento gerado nao o muda de mes', async () => {
    // A armadilha que a data conferida existe para fechar: editar recalcula a
    // competencia a partir da data, sem competencia manual.
    const { id } = await criarRecorrente(dados());
    await lancarRecorrentes(MES);
    const gerado = await prisma.lancamento.findFirstOrThrow({ where: { recorrenteId: id } });

    const resultado = await editarLancamento(gerado.id, gerado.versao, {
      descricao: 'nuvem (valor novo)',
      valorCentavos: 5990,
      origemValor: 'POR_PARCELA',
      dataCompra: gerado.dataCompra,
      numeroParcelas: 1,
      escopo: 'PESSOAL',
      membroId,
      contaId: 'conta-c6',
      categoriaId,
    });
    expect(resultado.ok).toBe(true);

    const parcelas = await prisma.parcela.findMany({ where: { lancamentoId: gerado.id } });
    expect(parcelas.map((p) => p.competencia)).toEqual([MES]);
  });

  it('nao oferece recorrente de conta com fatura travada no mes', async () => {
    await criarRecorrente(dados());
    await prisma.fatura.create({
      data: {
        contaId: 'conta-c6',
        competencia: MES,
        dataFechamento: `${MES}-04`,
        dataVencimento: `${MES}-10`,
        status: 'TRAVADA',
        travadaEm: new Date(),
      },
    });

    expect(await carregarRecorrentesPendentes(MES)).toEqual([]);
    expect(await lancarRecorrentes(MES)).toEqual({ lancadas: 0, puladas: 0 });
  });

  it('respeita desativada e competencia de inicio', async () => {
    await criarRecorrente(dados({ descricao: 'futura', competenciaInicio: '2099-06' }));
    const { id } = await criarRecorrente(dados({ descricao: 'encerrada' }));
    await prisma.recorrente.update({ where: { id }, data: { ativa: false } });

    expect(await carregarRecorrentesPendentes(MES)).toEqual([]);
    expect((await carregarRecorrentesPendentes('2099-06')).map((r) => r.descricao)).toEqual(['futura']);
  });
});
