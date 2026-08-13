import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarLancamento, editarLancamento } from './lancamento';

// Este teste APAGA lancamentos, parcelas e rateios do banco apontado por
// DATABASE_URL. Fica atras de um opt-in explicito para que um `npm test`
// distraido nunca destrua dado real depois da importacao da planilha.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('gravacao com lock otimista', () => {
  let categoriaId: string;
  let membroId: string;

  beforeEach(async () => {
    await prisma.parcela.deleteMany();
    await prisma.rateio.deleteMany();
    await prisma.lancamento.deleteMany();
    // O terceiro caso cria uma fatura TRAVADA; sem limpar aqui, rodar a
    // suite duas vezes seguidas colide no unique(contaId, competencia) e
    // deixa uma fatura travada residual que derruba o segundo caso.
    await prisma.fatura.deleteMany();
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    membroId = (await prisma.membro.findFirstOrThrow()).id;
  });

  const entrada = () => ({
    descricao: 'loja online',
    valorCentavos: 2500,
    origemValor: 'POR_PARCELA' as const,
    dataCompra: '2026-08-01',
    numeroParcelas: 1,
    escopo: 'PESSOAL' as const,
    contaId: 'conta-c6',
    categoriaId,
    membroId,
  });

  it('grava e gera as parcelas na competencia certa', async () => {
    const { id } = await criarLancamento(entrada());
    const parcelas = await prisma.parcela.findMany({ where: { lancamentoId: id } });

    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]?.competencia).toBe('2026-08');
  });

  it('recusa a segunda gravacao concorrente em vez de sobrescrever', async () => {
    const { id } = await criarLancamento(entrada());

    // Duas pessoas carregaram a versao 1 ao mesmo tempo.
    const primeira = await editarLancamento(id, 1, { ...entrada(), descricao: 'loja online (Nick)' });
    const segunda = await editarLancamento(id, 1, { ...entrada(), descricao: 'loja online (Nardy)' });

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.descricao).toBe('loja online (Nick)');
    expect(salvo.versao).toBe(2);
  });

  it('recusa editar lancamento com parcela em fatura travada', async () => {
    const { id } = await criarLancamento(entrada());
    await prisma.fatura.create({
      data: {
        contaId: 'conta-c6',
        competencia: '2026-08',
        dataFechamento: '2026-08-04',
        dataVencimento: '2026-08-10',
        status: 'TRAVADA',
        travadaEm: new Date(),
      },
    });

    const resultado = await editarLancamento(id, 1, { ...entrada(), descricao: 'outro' });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('FATURA_TRAVADA');
  });
});
