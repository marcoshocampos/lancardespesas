import { Prisma, type Categoria, type Conta, type Membro } from '@prisma/client';
import { prisma } from '../db';

type Recusa = { ok: false; motivo: 'NOME_DUPLICADO' | 'NAO_ENCONTRADO' };
type Sucesso<T> = { ok: true; registro: T };
export type ResultadoConfiguracao<T> = Sucesso<T> | Recusa;

/**
 * Traduz para recusa tratavel os erros do Prisma que sao regra, e deixa o resto
 * subir. Dois codigos, que ninguem conhece de cabeca:
 *
 *   P2002 — violacao de constraint unica. Entre os campos que este arquivo
 *           grava so `Categoria.nome` e @unique, entao P2002 aqui e sempre
 *           colisao de nome de categoria. (`Membro.email` tambem e @unique, mas
 *           `editarMembro` nao toca nele.)
 *   P2025 — a gravacao dependia de um registro que nao existe: id errado, ou a
 *           outra pessoa apagou enquanto esta estava com a tela aberta.
 *
 * A colisao e CAPTURADA, nunca pre-checada. Um `findUnique` antes do `create`
 * tem janela de corrida entre a consulta e a gravacao — sao duas pessoas no
 * mesmo sistema, e e por isso que todo lancamento grava com lock otimista. A
 * constraint do banco nao tem essa janela.
 */
function traduzirErroDoPrisma(erro: unknown): Recusa {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === 'P2002') return { ok: false, motivo: 'NOME_DUPLICADO' };
    if (erro.code === 'P2025') return { ok: false, motivo: 'NAO_ENCONTRADO' };
  }
  // Banco fora do ar, timeout, Neon hibernando: nao e recusa de regra, e falha.
  // Devolver isso como recusa faria a tela dizer "nome duplicado" para um erro
  // de conexao, e a pessoa trocaria o nome ate desistir.
  throw erro;
}

/**
 * As gravacoes devolvem resultado tratavel em vez de lancar (docs/arquitetura.md),
 * e quem chama tem que tratar. Um unico try/catch para as seis funcoes: seis
 * copias do mesmo bloco seriam seis chances de uma delas esquecer a traducao e
 * deixar a excecao do Prisma vazar para a tela.
 */
async function gravar<T>(operacao: () => PromiseLike<T>): Promise<ResultadoConfiguracao<T>> {
  try {
    return { ok: true, registro: await operacao() };
  } catch (erro) {
    return traduzirErroDoPrisma(erro);
  }
}

/** `icone` fica de fora: o campo existe no schema e ainda nao e usado em lugar nenhum. */
export async function criarCategoria(dados: {
  nome: string;
  cor: string;
}): Promise<ResultadoConfiguracao<Categoria>> {
  return gravar(() => prisma.categoria.create({ data: { nome: dados.nome, cor: dados.cor } }));
}

export async function editarCategoria(
  id: string,
  dados: { nome: string; cor: string },
): Promise<ResultadoConfiguracao<Categoria>> {
  return gravar(() =>
    prisma.categoria.update({ where: { id }, data: { nome: dados.nome, cor: dados.cor } }),
  );
}

/**
 * Arquivar so vira o booleano: nenhum lancamento e tocado. A categoria arquivada
 * some das opcoes de lancamento novo — o `where: { arquivada: false }` das
 * paginas ja cuida disso — e continua aparecendo nos lancamentos antigos, que e
 * o ponto. Arquivar nao reescreve historico; para isso existe a exclusao.
 */
export async function arquivarCategoria(
  id: string,
  arquivada: boolean,
): Promise<ResultadoConfiguracao<Categoria>> {
  return gravar(() => prisma.categoria.update({ where: { id }, data: { arquivada } }));
}

/**
 * `Conta.nome` nao e @unique no schema, e nao e aqui que se inventa a unicidade:
 * duas contas com o mesmo nome, uma de cada pessoa, sao dado legitimo. Por isso
 * esta funcao nunca devolve NOME_DUPLICADO — o motivo existe no tipo porque
 * `Categoria` precisa dele.
 *
 * `tipo` e `ordem` ficam de fora de proposito: trocar o tipo de uma conta que ja
 * tem fatura conferida nao e edicao, e migracao de dado.
 */
export async function editarConta(
  id: string,
  dados: {
    nome: string;
    cor: string;
    diaFechamento: number | null;
    diaVencimento: number | null;
    ativa: boolean;
  },
): Promise<ResultadoConfiguracao<Conta>> {
  return gravar(() =>
    prisma.conta.update({
      where: { id },
      data: {
        nome: dados.nome,
        cor: dados.cor,
        diaFechamento: dados.diaFechamento,
        diaVencimento: dados.diaVencimento,
        ativa: dados.ativa,
      },
    }),
  );
}

/**
 * `Membro.nome` tambem nao e @unique: mesma leitura de `editarConta`.
 *
 * `email` fica de fora porque e a chave da allowlist do login — trocar por aqui
 * tiraria a pessoa do proprio sistema. `absorveSobra` tem funcao propria abaixo,
 * porque precisa de transacao.
 */
export async function editarMembro(
  id: string,
  dados: { nome: string; cor: string },
): Promise<ResultadoConfiguracao<Membro>> {
  return gravar(() =>
    prisma.membro.update({ where: { id }, data: { nome: dados.nome, cor: dados.cor } }),
  );
}

/**
 * Exatamente um membro deve ter `absorveSobra: true` (docs/decisoes.md, "A sobra
 * de centavos vai sempre para o mesmo membro"). Ate agora isso era invariante de
 * dado conferida a mao; marcar um passa a desmarcar os outros.
 *
 * A transacao nao e opcional. Sem ela, uma falha entre as duas gravacoes deixa
 * zero ou dois membros absorvendo a sobra, e o rateio volta a depender do
 * desempate por `criadoEm` em `repositorios/resumo.ts` — um centavo trocando de
 * dono sem ninguem ter pedido.
 *
 * Membro inexistente: o `update` levanta P2025 e derruba a transacao inteira,
 * entao o `updateMany` tambem volta atras. A recusa sai como NAO_ENCONTRADO com
 * o banco intacto — sem transacao, ninguem absorveria a sobra.
 */
export async function definirQuemAbsorveSobra(
  membroId: string,
): Promise<ResultadoConfiguracao<Membro>> {
  return gravar(async () => {
    const [, membro] = await prisma.$transaction([
      prisma.membro.updateMany({
        where: { NOT: { id: membroId } },
        data: { absorveSobra: false },
      }),
      prisma.membro.update({ where: { id: membroId }, data: { absorveSobra: true } }),
    ]);
    return membro;
  });
}

/**
 * Conta nova, no fim da ordem.
 *
 * `ordem` sai de `max(ordem) + 1` porque e ela que decide a posicao da coluna
 * no Resumo: conta nova entrando no meio empurraria as outras de lugar sem
 * ninguem ter pedido.
 *
 * `tipo` so existe aqui, e nunca em `editarConta` — trocar o tipo de uma conta
 * que ja tem fatura conferida nao e edicao, e migracao de dado. Criar e o unico
 * momento em que essa escolha acontece pela tela.
 *
 * `ativa` nasce true: conta criada para nao ser usada nao faz sentido, e
 * desativar ja existe na edicao.
 */
export async function criarConta(dados: {
  nome: string;
  tipo: 'CARTAO' | 'EXTERNA';
  cor: string;
  diaFechamento: number | null;
  diaVencimento: number | null;
}): Promise<ResultadoConfiguracao<Conta>> {
  return gravar(async () => {
    const ultima = await prisma.conta.aggregate({ _max: { ordem: true } });
    return prisma.conta.create({
      data: {
        nome: dados.nome,
        tipo: dados.tipo,
        cor: dados.cor,
        // Externa nunca guarda dia: o schema aceita, e um dia pendurado numa
        // conta sem fatura viraria lixo que alguem leria como regra um dia.
        diaFechamento: dados.tipo === 'CARTAO' ? dados.diaFechamento : null,
        diaVencimento: dados.tipo === 'CARTAO' ? dados.diaVencimento : null,
        ordem: (ultima._max.ordem ?? 0) + 1,
      },
    });
  });
}
