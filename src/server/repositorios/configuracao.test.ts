import type { Categoria } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import {
  arquivarCategoria,
  criarCategoria,
  criarConta,
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

  // Conferir e limpar sao duas coisas, e mante-las na mesma funcao era o
  // defeito. "Este banco tem dado que nao e meu?" so faz sentido UMA vez,
  // antes de a suite gravar qualquer coisa: dali em diante todo lancamento no
  // banco foi ela que criou, e reavaliar a guarda a cada caso derruba a suite
  // no primeiro beforeEach depois de um caso que cria lancamento. Limpar, ao
  // contrario, tem que acontecer SEMPRE — antes de cada caso e no fim. Por
  // isso a conferencia fica no beforeAll e a limpeza no beforeEach; juntar as
  // duas de novo, em nome de simplificar, e reintroduzir o bug.
  let bancoLiberado = false;

  /** Recusa banco com dado real. Roda uma vez, antes da primeira gravacao. */
  async function exigirBancoLivre(): Promise<void> {
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
    bancoLiberado = true;
  }

  /** Apaga o que a suite escreveu; so roda depois da conferencia ter passado. */
  async function limpar(): Promise<void> {
    // Sem esta exigencia, um refactor que mova a ordem das hooks — ou que
    // perca o beforeAll — volta a apagar banco nao conferido, em silencio.
    if (!bancoLiberado) {
      throw new Error('limpar() chamada sem exigirBancoLivre() ter passado — nao apago nada.');
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
    // A conferencia vem antes de tudo, e no mesmo hook das leituras de
    // fixture: assim a ordem nao depende de como o vitest sequencia hooks
    // irmaos. O que vem depois dela e so leitura.
    await exigirBancoLivre();

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
    await limpar();
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
    await limpar();
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

describe.skipIf(!podeDestruir)('criarConta', () => {
  // Conta nao entra no limpar() da suite: ela e fixture do seed, como categoria
  // e membro. Cada caso apaga o que criou, pelo id.
  const criadas: string[] = [];

  afterEach(async () => {
    if (criadas.length === 0) return;
    await prisma.conta.deleteMany({ where: { id: { in: criadas } } });
    criadas.length = 0;
  });

  async function criarOk(dados: Parameters<typeof criarConta>[0]): Promise<string> {
    const r = await criarConta(dados);
    if (!r.ok) throw new Error(`criarConta deveria ter sucedido, foi recusado: ${r.motivo}`);
    criadas.push(r.registro.id);
    return r.registro.id;
  }

  it('cria cartao com os dois dias e no fim da ordem', async () => {
    const maiorAntes = (await prisma.conta.aggregate({ _max: { ordem: true } }))._max.ordem ?? 0;

    const id = await criarOk({
      nome: 'Cartao de teste',
      tipo: 'CARTAO',
      cor: '#123456',
      diaFechamento: 4,
      diaVencimento: 10,
    });

    const salva = await prisma.conta.findUniqueOrThrow({ where: { id } });
    expect(salva.tipo).toBe('CARTAO');
    expect(salva.diaFechamento).toBe(4);
    expect(salva.diaVencimento).toBe(10);
    expect(salva.ativa).toBe(true);
    // No fim: conta nova entrando no meio empurraria as colunas do Resumo.
    expect(salva.ordem).toBe(maiorAntes + 1);
  });

  it('descarta os dias quando a conta e externa', async () => {
    // Mesmo recebendo dia, uma conta sem fatura nao pode guarda-lo: viraria
    // lixo que alguem leria como regra depois.
    const id = await criarOk({
      nome: 'Externa de teste',
      tipo: 'EXTERNA',
      cor: '#654321',
      diaFechamento: 4,
      diaVencimento: 10,
    });

    const salva = await prisma.conta.findUniqueOrThrow({ where: { id } });
    expect(salva.tipo).toBe('EXTERNA');
    expect(salva.diaFechamento).toBeNull();
    expect(salva.diaVencimento).toBeNull();
  });

  it('aceita duas contas com o mesmo nome', async () => {
    // Conta.nome nao e @unique de proposito: duas contas homonimas, uma de cada
    // pessoa, sao dado legitimo. Ver o comentario de editarConta.
    await criarOk({ nome: 'Mesmo nome', tipo: 'EXTERNA', cor: '#111111', diaFechamento: null, diaVencimento: null });
    const segunda = await criarConta({ nome: 'Mesmo nome', tipo: 'EXTERNA', cor: '#222222', diaFechamento: null, diaVencimento: null });

    expect(segunda.ok).toBe(true);
    if (segunda.ok) criadas.push(segunda.registro.id);
  });
});
