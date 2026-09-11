import type { Categoria } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import {
  arquivarCategoria,
  criarCategoria,
  definirQuemAbsorveSobra,
  editarCategoria,
} from './configuracao';
import { criarLancamento } from './lancamento';

// Este teste GRAVA e APAGA no banco apontado por DATABASE_URL. Fica atras de um
// opt-in explicito para que um `npm test` distraido nunca destrua dado real
// depois da importacao da planilha.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

// Toda categoria criada aqui nasce com este prefixo no nome, e a limpeza apaga
// por ele. `Categoria.nome` e @unique e as categorias do seed sao dado que este
// arquivo nao criou: um `deleteMany()` sem filtro levaria as oito do seed junto.
const PREFIXO = 'zz-teste-configuracao';

describe.skipIf(!podeDestruir)('repositorio de configuracao', () => {
  let membroA: string;
  let membroB: string;
  let absorvedorOriginal: string | undefined;

  async function limparBanco(): Promise<void> {
    // A trava TESTE_DESTRUTIVO foi pensada para banco vazio. Depois da
    // importacao da planilha, o mesmo comando apagaria os 35 lancamentos
    // reais do casal sem aviso. A guarda reage ao que existe no banco, nao a
    // uma convencao de nome — convencao de nome tambem se esquece de
    // configurar. Se ha lancamento, recusa antes de qualquer deleteMany.
    const existentes = await prisma.lancamento.count();
    if (existentes > 0) {
      throw new Error(
        `Banco tem ${existentes} lancamento(s) — recuso rodar TESTE_DESTRUTIVO aqui. ` +
          'Aponte DATABASE_URL para um banco vazio.',
      );
    }

    await prisma.parcela.deleteMany();
    await prisma.rateio.deleteMany();
    await prisma.lancamento.deleteMany();
    // Sem isto, a segunda rodada colide no @unique de Categoria.nome e o caso
    // do nome duplicado passaria pelo motivo errado: o fixture, e nao a regra.
    await prisma.categoria.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    // Fatura fica de fora de proposito: este arquivo nao cria nenhuma, e o
    // valor real conferido contra o extrato nao e dado que a guarda protege.
  }

  beforeAll(async () => {
    // So leitura, e por isso pode rodar antes da guarda de limparBanco.
    const [primeiro, segundo] = await prisma.membro.findMany({ orderBy: { criadoEm: 'asc' } });
    if (!primeiro || !segundo) {
      throw new Error(
        'Os casos de absorveSobra precisam de dois membros no banco. Rode `npm run db:seed`.',
      );
    }
    membroA = primeiro.id;
    membroB = segundo.id;
    absorvedorOriginal = (await prisma.membro.findFirst({ where: { absorveSobra: true } }))?.id;
  });

  // O beforeEach so limpa ANTES de cada caso: sem isto, o ultimo caso da suite
  // fica no banco depois do `vitest run` terminar.
  afterAll(async () => {
    await limparBanco();
    // Os casos trocam quem absorve a sobra. Devolver a escolha para quem a
    // tinha evita que rodar o teste mude, em silencio, de quem e o centavo de
    // sobra — ver docs/decisoes.md. Nao ha o que restaurar se ninguem absorvia.
    if (absorvedorOriginal !== undefined) {
      await prisma.membro.updateMany({
        where: { NOT: { id: absorvedorOriginal } },
        data: { absorveSobra: false },
      });
      await prisma.membro.update({
        where: { id: absorvedorOriginal },
        data: { absorveSobra: true },
      });
    }
  });

  beforeEach(async () => {
    await limparBanco();
  });

  /** Cria uma categoria e falha o teste alto (com o motivo) se for recusada. */
  async function criarCategoriaOk(sufixo: string): Promise<Categoria> {
    const resultado = await criarCategoria({ nome: `${PREFIXO} ${sufixo}`, cor: '#1B7C90' });
    if (!resultado.ok) {
      throw new Error(`criarCategoria deveria ter sucedido, foi recusada: ${resultado.motivo}`);
    }
    return resultado.registro;
  }

  /** Cria um lancamento a vista na categoria informada; devolve o id. */
  async function criarLancamentoOk(categoriaId: string): Promise<string> {
    const resultado = await criarLancamento({
      descricao: 'oleo do carro',
      valorCentavos: 12990,
      origemValor: 'POR_PARCELA',
      dataCompra: '2026-08-01',
      numeroParcelas: 1,
      escopo: 'PESSOAL',
      contaId: 'conta-c6',
      categoriaId,
      membroId: membroA,
    });
    if (!resultado.ok) {
      throw new Error(`criarLancamento deveria ter sucedido, foi recusado: ${resultado.motivo}`);
    }
    return resultado.id;
  }

  /** Quem esta com `absorveSobra: true` agora, na ordem de criacao. */
  async function absorvedores(): Promise<string[]> {
    const membros = await prisma.membro.findMany({
      where: { absorveSobra: true },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    return membros.map((m) => m.id);
  }

  it('recusa categoria com nome ja usado em vez de lancar', async () => {
    const criada = await criarCategoriaOk('veiculo');

    const repetida = await criarCategoria({ nome: criada.nome, cor: '#B33A2B' });

    expect(repetida.ok).toBe(false);
    if (!repetida.ok) expect(repetida.motivo).toBe('NOME_DUPLICADO');
    // A recusa vem da constraint do banco, capturada: nao pode ter deixado
    // uma segunda linha para tras.
    expect(await prisma.categoria.count({ where: { nome: criada.nome } })).toBe(1);
  });

  it('deixa exatamente um membro absorvendo a sobra depois de cada troca', async () => {
    const paraA = await definirQuemAbsorveSobra(membroA);
    expect(paraA.ok).toBe(true);
    expect(await absorvedores()).toEqual([membroA]);

    const paraB = await definirQuemAbsorveSobra(membroB);
    expect(paraB.ok).toBe(true);
    // Um, e o novo: marcar o B tem que desmarcar o A. Dois absorvedores
    // devolvem o rateio ao desempate por criadoEm de repositorios/resumo.ts.
    expect(await absorvedores()).toEqual([membroB]);
  });

  it('arquiva a categoria sem sumir com os lancamentos que a usam', async () => {
    const categoria = await criarCategoriaOk('em uso');
    const lancamentoId = await criarLancamentoOk(categoria.id);

    const resultado = await arquivarCategoria(categoria.id, true);

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.registro.arquivada).toBe(true);

    const lancamento = await prisma.lancamento.findUnique({ where: { id: lancamentoId } });
    expect(lancamento?.categoriaId).toBe(categoria.id);
    expect(lancamento?.deletadoEm).toBeNull();
    // A parcela e o que aparece na grade do mes. Arquivar nao reescreve
    // historico; para isso existe a exclusao.
    expect(await prisma.parcela.count({ where: { lancamentoId } })).toBe(1);
  });

  it('devolve NAO_ENCONTRADO ao editar categoria que nao existe', async () => {
    // O `await` que nao explode e metade do caso: o P2025 do Prisma tem que
    // virar recusa tratavel, nunca excecao vazando para a tela.
    const resultado = await editarCategoria('categoria-que-nao-existe', {
      nome: `${PREFIXO} fantasma`,
      cor: '#7A7A7A',
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('NAO_ENCONTRADO');
    // `update` nao e `upsert`: a recusa nao pode ter criado a categoria.
    expect(await prisma.categoria.count({ where: { nome: `${PREFIXO} fantasma` } })).toBe(0);
  });

  it('mantem quem absorve a sobra quando o membro alvo nao existe', async () => {
    // Estado montado direto no banco, e nao por definirQuemAbsorveSobra: o
    // caso precisa valer mesmo que a funcao sob teste esteja quebrada.
    await prisma.membro.updateMany({ data: { absorveSobra: false } });
    await prisma.membro.update({ where: { id: membroA }, data: { absorveSobra: true } });

    const resultado = await definirQuemAbsorveSobra('membro-que-nao-existe');

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('NAO_ENCONTRADO');
    // Sem o $transaction, o updateMany ja teria desmarcado todo mundo antes de
    // o update falhar: esta lista viria VAZIA, zero membros absorvendo a sobra
    // — exatamente o estado que a funcao existe para impedir.
    expect(await absorvedores()).toEqual([membroA]);
  });
});
