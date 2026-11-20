import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import {
  criarLancamento,
  editarLancamento,
  marcarReembolso,
  restaurarLancamento,
  excluirLancamento,
  type EntradaLancamento,
} from './lancamento';
import { carregarReembolsosDaCompetencia } from './resumo';

// Este teste APAGA lancamentos, parcelas e rateios do banco apontado por
// DATABASE_URL. Fica atras de um opt-in explicito para que um `npm test`
// distraido nunca destrua dado real depois da importacao da planilha.
const podeDestruir = process.env.TESTE_DESTRUTIVO === '1';

describe.skipIf(!podeDestruir)('gravacao com lock otimista', () => {
  let categoriaId: string;
  let membroId: string;
  let nomeDoC6: string;

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
    // A recusa de trava traz o nome da conta; o seed chama a conta-c6 de algum
    // nome, e o teste nao deve adivinhar qual.
    nomeDoC6 = (await prisma.conta.findUniqueOrThrow({ where: { id: 'conta-c6' } })).nome;
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

  const linhasDe = (lancamentoId: string) =>
    prisma.parcela.findMany({ where: { lancamentoId }, orderBy: { numero: 'asc' } });

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

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 1, numeroParcelas: 1, competencia: '2026-08', contaNome: nomeDoC6 },
    });
  });

  it('recusa criar lancamento numa competencia com fatura travada, sem gravar nada', async () => {
    await travarFatura('2026-08');
    const antes = await prisma.lancamento.count();

    const resultado = await criarLancamento(entrada());

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 1, numeroParcelas: 1, competencia: '2026-08', contaNome: nomeDoC6 },
    });
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

  /** O recebido de cada parcela do lancamento, na ordem do numero. */
  async function recebidas(id: string): Promise<boolean[]> {
    const parcelas = await prisma.parcela.findMany({
      where: { lancamentoId: id },
      orderBy: { numero: 'asc' },
      select: { reembolsoRecebido: true },
    });
    return parcelas.map((p) => p.reembolsoRecebido);
  }

  it('marcar uma parcela como recebida nao marca as outras do mesmo lancamento', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, ehReembolso: true });

    expect((await marcarReembolso(id, 1, 2, true)).ok).toBe(true);

    // O defeito que levou o recebido para a parcela: receber outubro marcava
    // novembro junto, e desmarcar um desmarcava todos.
    expect(await recebidas(id)).toEqual([false, true, false]);

    // E o Resumo de cada mes le o estado da parcela DAQUELE mes.
    const competencias = (
      await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } })
    ).map((p) => p.competencia);
    const recebidoNoMes = async (competencia: string | undefined) =>
      (await carregarReembolsosDaCompetencia(competencia ?? '')).find((l) => l.lancamentoId === id)
        ?.recebido;
    expect(await recebidoNoMes(competencias[1])).toBe(true);
    expect(await recebidoNoMes(competencias[2])).toBe(false);
  });

  it('marca uma parcela como recebida, e de volta para pendente', async () => {
    const id = await criarOk({ ...entrada(), ehReembolso: true, devedorNome: 'Tia Cida' });

    expect((await marcarReembolso(id, 1, 1, true)).ok).toBe(true);
    expect(await recebidas(id)).toEqual([true]);

    // A versao do lancamento subiu na marcacao, entao desmarcar usa a 2.
    expect((await marcarReembolso(id, 2, 1, false)).ok).toBe(true);
    expect(await recebidas(id)).toEqual([false]);
  });

  it('preserva o recebido de cada parcela ao editar o lancamento', async () => {
    const reembolso = { ...entrada(), numeroParcelas: 3, ehReembolso: true, devedorNome: 'Tia Cida' };
    const id = await criarOk(reembolso);
    expect((await marcarReembolso(id, 1, 2, true)).ok).toBe(true);

    const resultado = await editarLancamento(id, 2, {
      ...reembolso,
      descricao: 'loja online (descricao corrigida)',
    });
    expect(resultado.ok).toBe(true);

    // A edicao recria as parcelas do zero. Sem preservar pelo numero, quem ja
    // devolveu a parcela 2 voltaria a dever porque alguem corrigiu a descricao.
    expect(await recebidas(id)).toEqual([false, true, false]);
  });

  it('limpa o recebido das parcelas ao desligar a marca numa edicao', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 2, ehReembolso: true });
    expect((await marcarReembolso(id, 1, 1, true)).ok).toBe(true);

    const resultado = await editarLancamento(id, 2, { ...entrada(), numeroParcelas: 2 });
    expect(resultado.ok).toBe(true);

    // Como o nome do devedor: religar a marca depois nao pode trazer de volta
    // um recebido de quando o lancamento era outra coisa.
    expect(await recebidas(id)).toEqual([false, false]);
  });

  it('marcar como recebido nao mexe no valor nem nas parcelas', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, ehReembolso: true });
    const antes = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    const parcelasAntes = await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } });

    await marcarReembolso(id, 1, 1, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    const parcelasDepois = await prisma.parcela.findMany({ where: { lancamentoId: id }, orderBy: { numero: 'asc' } });
    expect(depois.valorCentavos).toBe(antes.valorCentavos);
    expect(depois.statusReembolso).toBe('PENDENTE');
    expect(parcelasDepois.map((p) => p.valorCentavos)).toEqual(parcelasAntes.map((p) => p.valorCentavos));
    expect(parcelasDepois.map((p) => p.competencia)).toEqual(parcelasAntes.map((p) => p.competencia));
  });

  it('recusa a segunda marcacao concorrente em vez de sobrescrever', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 2, ehReembolso: true });

    const primeira = await marcarReembolso(id, 1, 1, true);
    // Outra parcela, mesmo lancamento: o lock e do lancamento, como em toda
    // gravacao dele. Quem marcou com a versao velha recarrega e marca de novo.
    const segunda = await marcarReembolso(id, 1, 2, true);

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');
    expect(await recebidas(id)).toEqual([true, false]);
  });

  it('recusa marcar lancamento que nao e reembolso', async () => {
    const id = await criarOk();

    const resultado = await marcarReembolso(id, 1, 1, true);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('NAO_E_REEMBOLSO');
    // Marcar o que ninguem deve criaria reembolso pela porta dos fundos.
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).statusReembolso).toBeNull();
    expect(await recebidas(id)).toEqual([false]);
  });

  it('marcar parcela que nao existe falha sem gastar a versao', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 2, ehReembolso: true });

    await expect(marcarReembolso(id, 1, 5, true)).rejects.toThrow();

    // Lock e marca na mesma transacao: separados, a versao subiria sem marca
    // nenhuma, e a proxima tentativa da tela cairia em CONFLITO.
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).versao).toBe(1);
  });

  it('restaura um lancamento da lixeira com as parcelas que ele tinha', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3 });
    const parcelasAntes = await prisma.parcela.findMany({
      where: { lancamentoId: id },
      orderBy: { numero: 'asc' },
    });
    expect((await excluirLancamento(id, 1)).ok).toBe(true);

    const restaurado = await restaurarLancamento(id, 2);
    expect(restaurado.ok).toBe(true);

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo.deletadoEm).toBeNull();
    // Nao regera: as parcelas nunca sairam do banco, entao voltam identicas.
    const parcelasDepois = await prisma.parcela.findMany({
      where: { lancamentoId: id },
      orderBy: { numero: 'asc' },
    });
    expect(parcelasDepois.map((p) => p.competencia)).toEqual(parcelasAntes.map((p) => p.competencia));
    expect(parcelasDepois.map((p) => p.valorCentavos)).toEqual(parcelasAntes.map((p) => p.valorCentavos));
  });

  it('recusa restaurar para dentro de fatura travada depois da exclusao', async () => {
    const id = await criarOk();
    expect((await excluirLancamento(id, 1)).ok).toBe(true);
    // A fatura trava DEPOIS: e o caso que a barreira da exclusao nao cobre.
    await travarFatura('2026-08');

    const resultado = await restaurarLancamento(id, 2);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 1, numeroParcelas: 1, competencia: '2026-08', contaNome: nomeDoC6 },
    });
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).deletadoEm).not.toBeNull();
  });

  it('recusa a segunda restauracao concorrente em vez de sobrescrever', async () => {
    const id = await criarOk();
    expect((await excluirLancamento(id, 1)).ok).toBe(true);

    const primeira = await restaurarLancamento(id, 2);
    const segunda = await restaurarLancamento(id, 2);

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');
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

  it('cria a partir da parcela 3, gravando so as parcelas 3 a 6', async () => {
    // A Fatura de dezembro para a parcela 3 pos a base, a parcela 1, em outubro.
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    const salvo = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(salvo).toMatchObject({ parcelaInicial: 3, parcelaFinal: null });
    expect((await linhasDe(id)).map((p) => [p.numero, p.competencia])).toEqual([
      [3, '2026-12'],
      [4, '2027-01'],
      [5, '2027-02'],
      [6, '2027-03'],
    ]);
  });

  it('cria a partir da parcela 3 mesmo com a base num mes travado', async () => {
    // A parcela 1 nao e gravada: o mes dela estar travado nao barra nada.
    await travarFatura('2026-10');

    const resultado = await criarLancamento({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    expect(resultado.ok).toBe(true);
  });

  it('recusa criar parcelado quando uma parcela do meio cai em mes travado, nomeando-a', async () => {
    await travarFatura('2026-11');

    const resultado = await criarLancamento({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
    });

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 2, numeroParcelas: 3, competencia: '2026-11', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(0);
  });

  it('edita no lugar um lancamento que comeca na parcela 3 sem recriar as de antes', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 6,
      parcelaInicial: 3,
      competenciaManual: '2026-10',
    });

    const resultado = await editarLancamento(id, 1, {
      ...entrada(),
      numeroParcelas: 6,
      descricao: 'corrigida',
      competenciaManual: '2026-10',
    });

    expect(resultado.ok).toBe(true);
    expect((await linhasDe(id)).map((p) => p.numero)).toEqual([3, 4, 5, 6]);
  });

  it('edita so a parcela de dezembro de um parcelado com novembro travado', async () => {
    // 3x a partir de outubro: 2026-10, 2026-11, 2026-12. Novembro fecha.
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);
    await travarFatura('2026-11');

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, valorCentavos: 2650 },
      'SO_ESTA',
      3,
    );

    expect(resultado).toEqual({ ok: true });
    // O original fica com 1 e 2 — as MESMAS linhas — e passa a parar na 2.
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ parcelaInicial: 1, parcelaFinal: 2, versao: 2, valorCentavos: 2500 });
    expect((await linhasDe(id)).map((p) => [p.id, p.valorCentavos, p.competencia])).toEqual(
      antes.slice(0, 2).map((p) => [p.id, p.valorCentavos, p.competencia]),
    );
    // A parcela 3 virou um lancamento so dela, com o valor novo, ainda "3/3".
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: true },
    });
    expect(novo).toMatchObject({ parcelaInicial: 3, parcelaFinal: null, numeroParcelas: 3, valorCentavos: 2650 });
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [3, 2650, '2026-12'],
    ]);
  });

  it('em so esta, ignora qualquer campo que nao seja o valor', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    await editarLancamento(
      id,
      1,
      {
        ...entrada(),
        numeroParcelas: 3,
        valorCentavos: 2650,
        descricao: 'forjada',
        competenciaManual: '2027-05',
      },
      'SO_ESTA',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { parcelaInicial: 2, parcelaFinal: 2 },
      include: { parcelas: true },
    });
    expect(novo.descricao).toBe('loja online');
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [2, 2650, '2026-11'],
    ]);
  });

  it('em so esta na ultima parcela, um total novo nao estende a compra', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 6, valorCentavos: 2650 },
      'SO_ESTA',
      3,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo).toMatchObject({ numeroParcelas: 3, parcelaInicial: 3, parcelaFinal: null });
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos])).toEqual([[3, 2650]]);
  });

  it('so esta no meio deixa tres pedacos, e as linhas de depois so mudam de dono', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 2650 },
      'SO_ESTA',
      2,
    );

    expect(resultado.ok).toBe(true);
    const pedacos = await prisma.lancamento.findMany({
      include: { parcelas: { orderBy: { numero: 'asc' } } },
      orderBy: { parcelaInicial: 'asc' },
    });
    expect(pedacos.map((l) => [l.parcelaInicial, l.parcelaFinal, l.valorCentavos])).toEqual([
      [1, 1, 2500],
      [2, 2, 2650],
      [3, null, 2500],
    ]);
    expect(pedacos[0]?.id).toBe(id);
    expect(pedacos[2]?.parcelas.map((p) => p.id)).toEqual(antes.slice(2).map((p) => p.id));
    const soma = pedacos.flatMap((l) => l.parcelas).reduce((s, p) => s + p.valorCentavos, 0);
    expect(soma).toBe(2500 * 3 + 2650);
  });

  it('esta e as seguintes muda campos dali em diante, e as anteriores ficam como estavam', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await travarFatura('2026-11');

    const resultado = await editarLancamento(
      id,
      1,
      {
        ...entrada(),
        numeroParcelas: 4,
        valorCentavos: 3000,
        descricao: 'loja online renegociada',
        competenciaManual: '2026-10',
      },
      'ESTA_E_SEGUINTES',
      3,
    );

    expect(resultado.ok).toBe(true);
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original.descricao).toBe('loja online');
    expect((await linhasDe(id)).map((p) => [p.numero, p.valorCentavos])).toEqual([
      [1, 2500],
      [2, 2500],
    ]);
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.descricao).toBe('loja online renegociada');
    expect(novo.parcelas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([
      [3, 3000, '2026-12'],
      [4, 3000, '2027-01'],
    ]);
  });

  it('recusa esta e as seguintes que atravessa um mes travado, nomeando parcela, mes e conta', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await travarFatura('2026-12');

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 3000, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      2,
    );

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 3, numeroParcelas: 4, competencia: '2026-12', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(1);
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id } })).versao).toBe(1);
  });

  it('a parcela cancelada continua cancelada no pedaco novo', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await prisma.parcela.updateMany({ where: { lancamentoId: id, numero: 4 }, data: { cancelada: true } });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 3000, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.parcelas.map((p) => [p.numero, p.cancelada])).toEqual([
      [2, false],
      [3, false],
      [4, true],
    ]);
  });

  it('o recebido de cada parcela de reembolso passa para o pedaco novo', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      ehReembolso: true,
    });
    expect((await marcarReembolso(id, 1, 3, true)).ok).toBe(true);

    await editarLancamento(
      id,
      2,
      {
        ...entrada(),
        numeroParcelas: 3,
        valorCentavos: 3000,
        competenciaManual: '2026-10',
        ehReembolso: true,
      },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo.parcelas.map((p) => [p.numero, p.reembolsoRecebido])).toEqual([
      [2, false],
      [3, true],
    ]);
  });

  it('o pedaco novo tem o rateio do escopo novo, e o original guarda o seu', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      escopo: 'CONJUNTO',
    });
    const rateiosAntes = await prisma.rateio.count({ where: { lancamentoId: id } });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10', escopo: 'PESSOAL' },
      'ESTA_E_SEGUINTES',
      2,
    );

    const novo = await prisma.lancamento.findFirstOrThrow({ where: { id: { not: id } } });
    expect(novo.escopo).toBe('PESSOAL');
    expect(await prisma.rateio.count({ where: { lancamentoId: novo.id } })).toBe(0);
    expect(await prisma.rateio.count({ where: { lancamentoId: id } })).toBe(rateiosAntes);
  });

  it('o pedaco de depois copia o rateio do original', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      competenciaManual: '2026-10',
      escopo: 'CONJUNTO',
    });
    const doOriginal = await prisma.rateio.findMany({ where: { lancamentoId: id }, orderBy: { membroId: 'asc' } });

    await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 }, 'SO_ESTA', 2);

    const depois = await prisma.lancamento.findFirstOrThrow({ where: { parcelaInicial: 3 } });
    const copiados = await prisma.rateio.findMany({ where: { lancamentoId: depois.id }, orderBy: { membroId: 'asc' } });
    expect(copiados.map((r) => [r.membroId, r.percentual])).toEqual(
      doOriginal.map((r) => [r.membroId, r.percentual]),
    );
  });

  it('recusa a segunda divisao concorrente em vez de dividir duas vezes', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    const primeira = await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 }, 'SO_ESTA', 3);
    const segunda = await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 3, valorCentavos: 2700 }, 'SO_ESTA', 3);

    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.motivo).toBe('CONFLITO');
    expect(await prisma.lancamento.count()).toBe(2);
  });

  it('o pedaco novo nao herda a marca de recorrente', async () => {
    const recorrente = await prisma.recorrente.create({
      data: {
        descricao: 'academia',
        valorCentavos: 2500,
        escopo: 'PESSOAL',
        diaDoMes: 10,
        competenciaInicio: '2026-10',
        contaId: 'conta-c6',
        categoriaId,
        membroId,
      },
    });
    try {
      const id = await criarOk({
        ...entrada(),
        numeroParcelas: 3,
        competenciaManual: '2026-10',
        recorrenteId: recorrente.id,
        competenciaRecorrente: '2026-10',
      });

      const resultado = await editarLancamento(
        id,
        1,
        { ...entrada(), numeroParcelas: 3, valorCentavos: 2600 },
        'SO_ESTA',
        2,
      );

      expect(resultado.ok).toBe(true);
      const marcados = await prisma.lancamento.findMany({ where: { recorrenteId: recorrente.id } });
      expect(marcados.map((l) => l.id)).toEqual([id]);
    } finally {
      // A recorrente nao e limpa por `limpar()`; os lancamentos que apontam
      // para ela tem que sair antes dela.
      await limpar();
      await prisma.recorrente.delete({ where: { id: recorrente.id } });
    }
  });

  it('esta e as seguintes pode mudar o total, e o pedaco de antes guarda o total antigo', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });

    await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 6, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      3,
    );

    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ numeroParcelas: 4, parcelaInicial: 1, parcelaFinal: 2 });
    const novo = await prisma.lancamento.findFirstOrThrow({
      where: { id: { not: id } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(novo).toMatchObject({ numeroParcelas: 6, parcelaInicial: 3, parcelaFinal: null });
    expect(novo.parcelas.map((p) => p.numero)).toEqual([3, 4, 5, 6]);
  });

  /** O numero de cada parcela de lancamento vivo, em ordem: repetido e parcela em dois pedacos. */
  const numerosVivos = async () =>
    (
      await prisma.parcela.findMany({
        where: { lancamento: { deletadoEm: null } },
        orderBy: { numero: 'asc' },
        select: { numero: true },
      })
    ).map((p) => p.numero);

  const versaoDe = async (id: string) =>
    (await prisma.lancamento.findUniqueOrThrow({ where: { id } })).versao;

  const doze = Array.from({ length: 12 }, (_, i) => i + 1);

  it('o pedaco de antes nao muda o total, e nenhuma parcela fica em dois lancamentos', async () => {
    const doze12 = { ...entrada(), numeroParcelas: 12, competenciaManual: '2026-10' };
    const id = await criarOk(doze12);

    // 1. Esta e as seguintes na 3: o original fica [1..2] de 12, e nasce [3..12].
    expect((await editarLancamento(id, 1, { ...doze12, valorCentavos: 3000 }, 'ESTA_E_SEGUINTES', 3)).ok).toBe(
      true,
    );
    // 2. Todas no pedaco de antes, baixando o total ate a ponta dele.
    const baixar = await editarLancamento(id, await versaoDe(id), { ...doze12, numeroParcelas: 2 }, 'TODAS', 1);
    // 3. Todas de novo, subindo o total de volta. Era aqui que [1..2] regerava
    //    3..12, que ja eram do outro pedaco.
    await editarLancamento(id, await versaoDe(id), doze12, 'TODAS', 1);

    expect(await numerosVivos()).toEqual(doze);
    expect(baixar).toEqual({ ok: false, motivo: 'TOTAL_INVALIDO', minimo: 12, maximo: 12 });
    expect(await prisma.lancamento.findUniqueOrThrow({ where: { id } })).toMatchObject({
      parcelaInicial: 1,
      parcelaFinal: 2,
      numeroParcelas: 12,
    });
  });

  it('depois de excluir da 10 em diante, o pedaco que ficou nao muda o total, e restaurar nao duplica', async () => {
    const doze12 = { ...entrada(), numeroParcelas: 12, competenciaManual: '2026-10' };
    const id = await criarOk(doze12);
    expect((await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 10)).ok).toBe(true);

    const baixar = await editarLancamento(id, await versaoDe(id), { ...doze12, numeroParcelas: 9 }, 'TODAS', 1);
    await editarLancamento(id, await versaoDe(id), doze12, 'TODAS', 1);
    const pedaco = await prisma.lancamento.findFirstOrThrow({ where: { deletadoEm: { not: null } } });
    expect((await restaurarLancamento(pedaco.id, pedaco.versao)).ok).toBe(true);

    expect(await numerosVivos()).toEqual(doze);
    expect(baixar).toEqual({ ok: false, motivo: 'TOTAL_INVALIDO', minimo: 12, maximo: 12 });
  });

  it('recusa total que o alcance nao comporta sem gravar nada', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 6, competenciaManual: '2026-10' });

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      4,
    );

    expect(resultado).toEqual({ ok: false, motivo: 'TOTAL_INVALIDO', minimo: 4, maximo: 72 });
    expect(await prisma.lancamento.count()).toBe(1);
    expect(await versaoDe(id)).toBe(1);
  });

  /** Tudo o que uma edicao sem mudanca nao pode tocar: os lancamentos e cada linha deles. */
  const fotografia = async () =>
    prisma.lancamento.findMany({
      orderBy: { criadoEm: 'asc' },
      select: {
        id: true,
        versao: true,
        parcelaInicial: true,
        parcelaFinal: true,
        numeroParcelas: true,
        parcelas: {
          orderBy: { numero: 'asc' },
          select: { id: true, numero: true, valorCentavos: true, competencia: true },
        },
      },
    });

  it('salvar so esta sem mudar nada nao divide a compra', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await fotografia();

    const resultado = await editarLancamento(id, 1, { ...entrada(), numeroParcelas: 4 }, 'SO_ESTA', 2);

    expect(resultado).toEqual({ ok: true });
    // Dividir sem mudar nada nao tem volta: nao ha como juntar os pedacos.
    expect(await fotografia()).toEqual(antes);
  });

  it('salvar esta e as seguintes sem mudar nada nao divide a compra', async () => {
    const conjunto = {
      ...entrada(),
      numeroParcelas: 4,
      competenciaManual: '2026-10',
      escopo: 'CONJUNTO' as const,
      ehReembolso: true,
      devedorNome: 'Tia Cida',
    };
    const id = await criarOk(conjunto);
    const antes = await fotografia();

    // A tela manda a pessoa mesmo em conjunto; o que vale e o membro gravado, nulo.
    const resultado = await editarLancamento(id, 1, conjunto, 'ESTA_E_SEGUINTES', 3);

    expect(resultado).toEqual({ ok: true });
    expect(await fotografia()).toEqual(antes);
  });

  it('salvar sem mudar nada passa mesmo com um mes travado no alcance, porque nao escreve', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    await travarFatura('2026-12');
    const antes = await fotografia();

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' },
      'ESTA_E_SEGUINTES',
      2,
    );

    expect(resultado).toEqual({ ok: true });
    expect(await fotografia()).toEqual(antes);
  });

  it('mudar so a Fatura em esta e as seguintes ainda divide', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, competenciaManual: '2026-11' },
      'ESTA_E_SEGUINTES',
      3,
    );

    expect(resultado).toEqual({ ok: true });
    expect(await prisma.lancamento.count()).toBe(2);
    expect(await versaoDe(id)).toBe(2);
  });

  it('recusa dividir lancamento de valor total', async () => {
    const id = await criarOk({
      ...entrada(),
      numeroParcelas: 3,
      origemValor: 'TOTAL',
      valorCentavos: 10000,
      competenciaManual: '2026-10',
    });

    await expect(
      editarLancamento(
        id,
        1,
        { ...entrada(), numeroParcelas: 3, origemValor: 'TOTAL', valorCentavos: 9000 },
        'SO_ESTA',
        2,
      ),
    ).rejects.toThrow('valor total');
    expect(await prisma.lancamento.count()).toBe(1);
  });

  it('exclui esta e as seguintes com novembro travado, e o pedaco vai para a lixeira', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);
    await travarFatura('2026-11');

    const resultado = await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 3);

    expect(resultado).toEqual({ ok: true });
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ deletadoEm: null, parcelaInicial: 1, parcelaFinal: 2, versao: 2 });
    const naLixeira = await prisma.lancamento.findFirstOrThrow({
      where: { deletadoEm: { not: null } },
      include: { parcelas: { orderBy: { numero: 'asc' } } },
    });
    expect(naLixeira).toMatchObject({ parcelaInicial: 3, parcelaFinal: null });
    expect(naLixeira.parcelas.map((p) => p.id)).toEqual(antes.slice(2).map((p) => p.id));
  });

  it('exclui so a parcela do meio, deixando as de antes e as de depois', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });

    expect((await excluirLancamento(id, 1, 'SO_ESTA', 2)).ok).toBe(true);

    const vivos = await prisma.lancamento.findMany({
      where: { deletadoEm: null },
      orderBy: { parcelaInicial: 'asc' },
    });
    expect(vivos.map((l) => [l.parcelaInicial, l.parcelaFinal])).toEqual([
      [1, 1],
      [3, null],
    ]);
    const excluido = await prisma.lancamento.findFirstOrThrow({ where: { deletadoEm: { not: null } } });
    expect([excluido.parcelaInicial, excluido.parcelaFinal]).toEqual([2, 2]);
  });

  it('recusa excluir esta e as seguintes que alcanca um mes travado', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    await travarFatura('2026-12');

    const resultado = await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 2);

    expect(resultado).toEqual({
      ok: false,
      motivo: 'FATURA_TRAVADA',
      travada: { numero: 3, numeroParcelas: 3, competencia: '2026-12', contaNome: nomeDoC6 },
    });
    expect(await prisma.lancamento.count()).toBe(1);
  });

  it('restaura o pedaco excluido com as linhas que ele levou', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    expect((await excluirLancamento(id, 1, 'ESTA_E_SEGUINTES', 2)).ok).toBe(true);
    const pedaco = await prisma.lancamento.findFirstOrThrow({ where: { deletadoEm: { not: null } } });

    expect((await restaurarLancamento(pedaco.id, pedaco.versao)).ok).toBe(true);

    const visiveis = await prisma.parcela.findMany({
      where: { lancamento: { deletadoEm: null } },
      orderBy: { numero: 'asc' },
    });
    expect(visiveis.map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it('so esta no meio passa mesmo com um mes travado nas parcelas de depois, que so mudam de dono', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 4, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);
    await travarFatura('2027-01');

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 4, valorCentavos: 2650 },
      'SO_ESTA',
      2,
    );

    expect(resultado).toEqual({ ok: true });
    const depois = await prisma.lancamento.findFirstOrThrow({ where: { parcelaInicial: 3 } });
    const linhas = await linhasDe(depois.id);
    expect(linhas.map((p) => p.id)).toEqual(antes.slice(2).map((p) => p.id));
    expect(linhas.map((p) => p.valorCentavos)).toEqual([2500, 2500]);
    expect(linhas.map((p) => p.competencia)).toEqual(['2026-12', '2027-01']);
  });

  it('so esta na primeira parcela: o original fica com as de depois, sem mudar de id', async () => {
    const id = await criarOk({ ...entrada(), numeroParcelas: 3, competenciaManual: '2026-10' });
    const antes = await linhasDe(id);

    const resultado = await editarLancamento(
      id,
      1,
      { ...entrada(), numeroParcelas: 3, valorCentavos: 2650 },
      'SO_ESTA',
      1,
    );

    expect(resultado).toEqual({ ok: true });
    const original = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    expect(original).toMatchObject({ parcelaInicial: 2, parcelaFinal: null });
    expect((await linhasDe(id)).map((p) => p.id)).toEqual(antes.slice(1).map((p) => p.id));
    const outro = await prisma.lancamento.findFirstOrThrow({ where: { id: { not: id } } });
    expect(outro).toMatchObject({ parcelaInicial: 1, parcelaFinal: 1 });
    const linhas = await linhasDe(outro.id);
    expect(linhas.map((p) => [p.numero, p.valorCentavos, p.competencia])).toEqual([[1, 2650, '2026-10']]);
  });
});
