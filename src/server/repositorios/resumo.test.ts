import { afterEach, describe, expect, it } from 'vitest';
import { criarLancamento, type EntradaLancamento } from './lancamento';
import { carregarParcelasDaCompetencia } from './resumo';
import { prisma } from '../db';

// Toca o banco apontado por DATABASE_URL, como lancamento.test.ts. Diferente
// daquele arquivo, este teste NAO apaga dados existentes: cria um unico
// lancamento numa competencia futura (2099-01, onde nunca havera dado real) e
// remove so o que criou no `afterEach`, via delete em cascata pelo id.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('carregarParcelasDaCompetencia — sobra de centavos', () => {
  const COMPETENCIA_DE_TESTE = '2099-01';
  let lancamentoId: string | undefined;

  afterEach(async () => {
    if (lancamentoId) {
      // Cascade: apaga tambem as Parcelas e os Rateios deste lancamento
      // (onDelete: Cascade em ambas as relacoes, ver prisma/schema.prisma).
      await prisma.lancamento.delete({ where: { id: lancamentoId } }).catch(() => {});
      lancamentoId = undefined;
    }
  });

  it('da a sobra ao membro com absorveSobra=true, nao ao mais antigo por cadastro', async () => {
    const membros = await prisma.membro.findMany({ where: { ativo: true } });
    const comAbsorve = membros.find((m) => m.absorveSobra);
    const semAbsorve = membros.find((m) => !m.absorveSobra);
    if (!comAbsorve || !semAbsorve) {
      throw new Error(
        'Preciso de exatamente um membro com absorveSobra=true e outro com false para este teste.',
      );
    }

    const categoriaId = (await prisma.categoria.findFirstOrThrow()).id;

    const entrada: EntradaLancamento = {
      descricao: 'teste sobra de centavos (apagado ao final)',
      valorCentavos: 101, // impar: 50 + 51, a sobra decide quem fica com o extra
      origemValor: 'POR_PARCELA',
      dataCompra: `${COMPETENCIA_DE_TESTE}-15`,
      numeroParcelas: 1,
      escopo: 'CONJUNTO',
      contaId: 'conta-externa',
      categoriaId,
    };

    const resultado = await criarLancamento(entrada);
    if (!resultado.ok) throw new Error('criarLancamento deveria ter sucedido');
    lancamentoId = resultado.id;

    const parcelas = await carregarParcelasDaCompetencia(COMPETENCIA_DE_TESTE);
    const parcela = parcelas.find((p) => p.escopo === 'CONJUNTO' && p.valorCentavos === 101);
    if (!parcela || parcela.escopo !== 'CONJUNTO' || !parcela.cotas) {
      throw new Error('Parcela de teste nao encontrada na competencia 2099-01');
    }
    const cotas = parcela.cotas;

    const cotaAbsorve = cotas.find((c) => c.membroId === comAbsorve.id);
    const cotaOutro = cotas.find((c) => c.membroId === semAbsorve.id);

    expect(cotaAbsorve?.valorCentavos).toBe(51);
    expect(cotaOutro?.valorCentavos).toBe(50);
  });
});
