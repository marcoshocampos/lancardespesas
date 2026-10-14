import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import {
  criarLancamento,
  editarLancamento,
  marcarReembolso,
  type EntradaLancamento,
} from './lancamento';

// Este teste APAGA lancamentos, parcelas e rateios do banco apontado por
// DATABASE_URL. Fica atras de um opt-in explicito para que um `npm test`
// distraido nunca destrua dado real depois da importacao da planilha.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('gravacao com lock otimista', () => {
  let categoriaId: string;
  let membroId: string;

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
    // Varios casos criam fatura TRAVADA; sem limpar aqui, rodar a suite duas
    // vezes seguidas colide no unique(contaId, competencia) e deixa uma
    // fatura travada residual que derruba os outros casos.
    await prisma.fatura.deleteMany();
  }

  beforeAll(async () => {
    // A conferencia vem antes de tudo, e no mesmo hook das leituras de
    // fixture: assim a ordem nao depende de como o vitest sequencia hooks
    // irmaos. O que vem depois dela e so leitura.
    await exigirBancoLivre();

    // Categoria e membro sao do seed, e `limpar()` nao toca em nenhum dos
    // dois: reler a cada caso so gastava ida e volta ao Neon e sugeria uma
    // instabilidade que nao existe. Lidos uma vez, sao fixture — e o mesmo
    // registro vale para a suite inteira, sem depender do que o
    // findFirstOrThrow sem orderBy devolveria na proxima chamada.
    categoriaId = (await prisma.categoria.findFirstOrThrow()).id;
    membroId = (await prisma.membro.findFirstOrThrow()).id;
  });

  beforeEach(async () => {
    await limpar();
  });

  // O beforeEach so limpa ANTES de cada caso: sem isto, o ultimo caso da suite
  // fica no banco depois do `vitest run` terminar. O banco e o de producao do
  // casal — um lancamento fantasma aqui desloca o total que a importacao da
  // planilha confere contra o extrato.
  afterAll(async () => {
    await limpar();
  });

  const entrada = (): EntradaLancamento => ({
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

  async function travarFatura(competencia: string): Promise<void> {
    await prisma.fatura.create({
      data: {
        contaId: 'conta-c6',
        competencia,
        dataFechamento: `${competencia}-04`,
        dataVencimento: `${competencia}-10`,
        status: 'TRAVADA',
        travadaEm: new Date(),
      },
    });
  }

  /** Cria um lancamento e falha o teste alto (com o motivo) se a criacao for recusada. */
  async function criarOk(dados: EntradaLancamento = entrada()): Promise<string> {
    const resultado = await criarLancamento(dados);
    if (!resultado.ok) {
      throw new Error(`criarLancamento deveria ter sucedido, foi recusado: ${resultado.motivo}`);
    }
    return resultado.id;
  }

  it('grava e gera as parcelas na competencia certa', async () => {
    const id = await criarOk();
    const parcelas = await prisma.parcela.findMany({ where: { lancamentoId: id } });

    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]?.competencia).toBe('2026-08');
  });

  it('recusa a segunda gravacao concorrente em vez de sobrescrever', async () => {
    const id = await criarOk();

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
    const id = await criarOk();
    await travarFatura('2026-08');

    const resultado = await editarLancamento(id, 1, { ...entrada(), descricao: 'outro' });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('FATURA_TRAVADA');
  });

  it('recusa criar lancamento numa competencia com fatura travada, sem gravar nada', async () => {
    await travarFatura('2026-08');
    const antes = await prisma.lancamento.count();

    const resultado = await criarLancamento(entrada());

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('FATURA_TRAVADA');
    const depois = await prisma.lancamento.count();
    expect(depois).toBe(antes);
  });

  it('recusa mover uma parcela de uma competencia livre para uma travada', async () => {
    // Origem (2026-07) livre; destino (2026-08) travada.
    const id = await criarOk({ ...entrada(), dataCompra: '2026-07-01' });
    await travarFatura('2026-08');

    const antes = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    const resultado = await editarLancamento(id, 1, { ...entrada(), dataCompra: '2026-08-01' });
    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id } });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('FATURA_TRAVADA');
    expect(depois.dataCompra).toBe(antes.dataCompra);
    expect(depois.versao).toBe(antes.versao);

    const parcelas = await prisma.parcela.findMany({ where: { lancamentoId: id } });
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0]?.competencia).toBe('2026-07');
  });

  it('grava a marca de reembolso e o nome de quem vai devolver', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true, devedorNome: '  Tia Cida  ' });

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.statusReembolso).toBe('PENDENTE');
    // Trim no repositorio: espaco em volta do nome e digitacao, nao dado.
    expect(salvo.devedorNome).toBe('Tia Cida');
  });

  it('nao grava nome de devedor quando a marca esta desligada', async () => {
    const id = await criarOk({ ...entrada(), devedorNome: 'Tia Cida' });

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.statusReembolso).toBeNull();
    expect(salvo.devedorNome).toBeNull();
  });

  it('limpa o devedor ao desligar a marca numa edicao', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true, devedorNome: 'Tia Cida' });

    const resultado = await editarLancamento(id, 1, { ...entrada(), ehReembolso: false });
    expect(resultado.ok).toBe(true);

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.statusReembolso).toBeNull();
    // Sem isto, o nome de quem devia ficaria pendurado num lancamento comum e
    // reapareceria do nada se alguem religasse a marca.
    expect(salvo.devedorNome).toBeNull();
  });

  it('nao rebaixa um reembolso ja RECEBIDO ao editar o lancamento', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true, devedorNome: 'Tia Cida' });
    await prisma.lancamento.update({ where: { id }, data: { statusReembolso: 'RECEBIDO' } });

    const resultado = await editarLancamento(id, 1, {
      ...entrada(),
      descricao: 'loja online (descricao corrigida)',
      ehReembolso: true,
      devedorNome: 'Tia Cida',
    });
    expect(resultado.ok).toBe(true);

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    // Quem ja devolveu continua tendo devolvido depois de alguem corrigir a
    // descricao do lancamento.
    expect(salvo.statusReembolso).toBe('RECEBIDO');
  });

  it('marca um reembolso como recebido, e de volta para pendente', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true, devedorNome: 'Tia Cida' });

    const marcado = await marcarReembolso(id, 1, true);
    expect(marcado.ok).toBe(true);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).statusReembolso).toBe('RECEBIDO');

    // A versao subiu na marcacao, entao desmarcar usa a 2.
    const desmarcado = await marcarReembolso(id, 2, false);
    expect(desmarcado.ok).toBe(true);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).statusReembolso).toBe('PENDENTE');
  });

  it('marcar como recebido nao mexe no valor nem nas parcelas', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, ehReembolso: true });
    const antes = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    const parcelasAntes = await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } });

    await marcarReembolso(id, 1, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    const parcelasDepois = await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } });
    expect(depois.valorCentavos).toBe(antes.valorCentavos);
    expect(parcelasDepois.map((p) => p.valorCentavos)).toEqual(parcelasAntes.map((p) => p.valorCentavos));
    expect(parcelasDepois.map((p) => p.competencia)).toEqual(parcelasAntes.map((p) => p.competencia));
  });

  it('recusa a segunda marcacao concorrente em vez de sobrescrever', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true });

    const primeira = await marcarReembolso(id, 1, true);
    const segunda = await marcarReembolso(id, 1, false);

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).statusReembolso).toBe('RECEBIDO');
  });

  it('recusa marcar lancamento que nao e reembolso', async () => {
    const id = await criarOk();

    const resultado = await marcarReembolso(id, 1, true);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('NAO_E_REEMBOLSO');
    // Marcar o que ninguem deve criaria reembolso pela porta dos fundos.
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).statusReembolso).toBeNull();
  });

  it('mantem a parcela cancelada depois de editar o lancamento', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3 });
    const parcela3 = await prisma.parcela.findFirstOrThrow({
      where: { lancamentoId: id, numero: 3 },
    });
    await prisma.parcela.update({ where: { id: parcela3.id }, data: { cancelada: true } });

    const resultado = await editarLancamento(id, 1, {
      ...entrada(),
      numeroParcelas: 3,
      descricao: 'quitado antecipado',
    });
    expect(resultado.ok).toBe(true);

    const parcelas = await prisma.parcela.findMany({
      where: { lancamentoId: id },
      orderBy: { numero: 'asc' },
    });
    expect(parcelas).toHaveLength(3);
    expect(parcelas[0]?.cancelada).toBe(false);
    expect(parcelas[1]?.cancelada).toBe(false);
    expect(parcelas[2]?.cancelada).toBe(true);
  });
});
