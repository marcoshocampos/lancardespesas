'use server';

import type { Categoria, Conta, Membro, TipoConta } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { prisma } from '../db';
import {
  arquivarCategoria,
  criarCategoria,
  definirQuemAbsorveSobra,
  editarCategoria,
  editarConta,
  editarMembro,
  type ResultadoConfiguracao,
} from '../repositorios/configuracao';

const identificador = z.string().min(1, 'Identificador obrigatório');
const booleano = z.boolean();
const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB');
const nome = z
  .string()
  .trim()
  .min(1, 'Nome obrigatório')
  .max(40, 'Nome com no máximo 40 caracteres');
const diaDoMes = z.number().int().min(1).max(31).nullable();

/** Categoria e membro tem exatamente os mesmos dois campos editaveis por esta tela. */
const esquemaNomeECor = z.object({ nome, cor });

const esquemaContaBase = z.object({
  nome,
  cor,
  diaFechamento: diaDoMes,
  diaVencimento: diaDoMes,
  ativa: booleano,
});

async function exigirSessao() {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');
  return sessao;
}

/**
 * Categoria e membro aparecem na grade e no resumo; conta aparece tambem nos
 * chips. Nenhuma das tres telas le configuracao de um lugar so, entao as tres
 * caem juntas a cada gravacao.
 *
 * `/configuracoes` ainda nao existe como rota — chega na Tarefa 4. Revalidar
 * caminho sem pagina nao faz nada; deixar de fora era garantir que a tela nova
 * nascesse mostrando o dado anterior a propria edicao.
 */
function revalidarTelasQueMostramConfiguracao(): void {
  revalidatePath('/despesas');
  revalidatePath('/resumo');
  revalidatePath('/configuracoes');
}

/**
 * Identidade sobre o resultado do repositorio, com a revalidacao pendurada. O
 * ponto e nao haver neste arquivo nenhum lugar onde um resultado seja lido,
 * interpretado e trocado por outra coisa: recusa engolida como sucesso faz a
 * pessoa achar que salvou (docs/arquitetura.md). O cache so cai quando gravou.
 */
function comRevalidacao<T>(resultado: ResultadoConfiguracao<T>): ResultadoConfiguracao<T> {
  if (resultado.ok) revalidarTelasQueMostramConfiguracao();
  return resultado;
}

const CAMPOS_DE_CARTAO = ['diaFechamento', 'diaVencimento'] as const;

export type CampoDeCartao = (typeof CAMPOS_DE_CARTAO)[number];

const ROTULO_DO_CAMPO: Record<CampoDeCartao, string> = {
  diaFechamento: 'dia de fechamento',
  diaVencimento: 'dia de vencimento',
};

/**
 * Conta de cartao sem dia de fechamento ou sem dia de vencimento e recusa de
 * REGRA, e por isso volta como valor, nao como excecao.
 *
 * A linha e a mesma que o repositorio ja traca entre P2002 (regra: vira recusa)
 * e banco fora do ar (falha: sobe). Payload fora do formato — `cor` que nao e
 * #RRGGBB, `ativa` que nao e booleano — e o cliente mandando o que o formulario
 * nunca produz: sobe como excecao, igual ao `esquema.parse` de lancamento.ts.
 * Campo obrigatorio deixado em branco por uma pessoa e o caso previsto, e tem
 * dono na tela.
 *
 * Excecao aqui tambem nao chegaria legivel: o Next redige a mensagem de erro
 * lancado por server action em producao e entrega so um digest ao cliente. A
 * tela veria "erro" e nada mais — exatamente o que nao pode acontecer, porque o
 * conserto depende de a pessoa saber QUAL dia falta. `campos` deixa a tela
 * marcar o input certo; `mensagem` serve o aviso pronto.
 */
export type RecusaDiasDeCartao = {
  ok: false;
  motivo: 'CARTAO_SEM_DIAS';
  campos: CampoDeCartao[];
  mensagem: string;
};

export type ResultadoEdicaoConta = ResultadoConfiguracao<Conta> | RecusaDiasDeCartao;

function mensagemDeCartaoSemDias(campos: CampoDeCartao[]): string {
  const faltando = campos.map((campo) => ROTULO_DO_CAMPO[campo]).join(' e do ');
  return `Conta de cartão precisa do ${faltando}.`;
}

/**
 * O `tipo` entra por parametro, lido do banco, e nunca vem no payload: validar
 * contra um `tipo` enviado pelo cliente seria deixar quem manda os dados
 * escolher a regra que os julga, que e justamente o que a validacao de
 * fronteira existe para impedir.
 */
function esquemaDeConta(tipo: TipoConta) {
  return esquemaContaBase.superRefine((dados, ctx) => {
    if (tipo !== 'CARTAO') return;
    for (const campo of CAMPOS_DE_CARTAO) {
      if (dados[campo] === null) {
        ctx.addIssue({ code: 'custom', path: [campo], message: mensagemDeCartaoSemDias([campo]) });
      }
    }
  });
}

/**
 * Separa os problemas que sao a regra do cartao dos demais. O `superRefine` so
 * roda depois de o objeto passar, entao na pratica os dois conjuntos nunca se
 * misturam — mas quem decide entre lancar e recusar nao pode depender disso.
 */
function camposDeCartaoFaltando(erro: z.ZodError): CampoDeCartao[] {
  const faltando: CampoDeCartao[] = [];
  for (const problema of erro.issues) {
    if (problema.code !== 'custom' || problema.path.length !== 1) continue;
    const alvo = problema.path[0];
    if (typeof alvo !== 'string') continue;
    const campo = CAMPOS_DE_CARTAO.find((candidato) => candidato === alvo);
    if (campo) faltando.push(campo);
  }
  return faltando;
}

/**
 * `editarConta` nao recebe `tipo` e grava os dias como vierem. Uma conta CARTAO
 * que perca o dia de fechamento derruba `competenciaBaseDe`
 * (repositorios/lancamento.ts), que atende criar E editar lancamento, e
 * `registrarValorReal` (repositorios/fatura.ts) — os dois com `throw` cru, nao
 * com recusa tratavel. O estrago aparece longe da causa: a pessoa edita a conta
 * em Configuracoes e a excecao estoura depois, quando alguem tenta lancar uma
 * compra. Antes desta etapa o estado so era alcancavel pelo prisma studio; a
 * tela o poe ao alcance de um campo vazio, entao a tela paga a conta.
 *
 * A leitura do tipo e a gravacao nao sao atomicas. Hoje nada no sistema troca o
 * tipo de uma conta — o repositorio deixa o campo de fora de proposito —, e
 * fechar a janela exigiria transacao dentro do repositorio.
 */
export async function acaoEditarConta(id: string, dados: unknown): Promise<ResultadoEdicaoConta> {
  await exigirSessao();
  const alvo = identificador.parse(id);

  const conta = await prisma.conta.findUnique({ where: { id: alvo }, select: { tipo: true } });
  if (conta === null) return { ok: false, motivo: 'NAO_ENCONTRADO' };

  const analise = esquemaDeConta(conta.tipo).safeParse(dados);
  if (!analise.success) {
    const faltando = camposDeCartaoFaltando(analise.error);
    if (faltando.length !== analise.error.issues.length) throw analise.error;
    return {
      ok: false,
      motivo: 'CARTAO_SEM_DIAS',
      campos: faltando,
      mensagem: mensagemDeCartaoSemDias(faltando),
    };
  }

  return comRevalidacao(await editarConta(alvo, analise.data));
}

export async function acaoCriarCategoria(
  dados: unknown,
): Promise<ResultadoConfiguracao<Categoria>> {
  await exigirSessao();
  const entrada = esquemaNomeECor.parse(dados);
  return comRevalidacao(await criarCategoria(entrada));
}

export async function acaoEditarCategoria(
  id: string,
  dados: unknown,
): Promise<ResultadoConfiguracao<Categoria>> {
  await exigirSessao();
  const alvo = identificador.parse(id);
  const entrada = esquemaNomeECor.parse(dados);
  return comRevalidacao(await editarCategoria(alvo, entrada));
}

export async function acaoArquivarCategoria(
  id: string,
  arquivada: boolean,
): Promise<ResultadoConfiguracao<Categoria>> {
  await exigirSessao();
  const alvo = identificador.parse(id);
  return comRevalidacao(await arquivarCategoria(alvo, booleano.parse(arquivada)));
}

export async function acaoEditarMembro(
  id: string,
  dados: unknown,
): Promise<ResultadoConfiguracao<Membro>> {
  await exigirSessao();
  const alvo = identificador.parse(id);
  const entrada = esquemaNomeECor.parse(dados);
  return comRevalidacao(await editarMembro(alvo, entrada));
}

export async function acaoDefinirQuemAbsorveSobra(
  membroId: string,
): Promise<ResultadoConfiguracao<Membro>> {
  await exigirSessao();
  const alvo = identificador.parse(membroId);
  return comRevalidacao(await definirQuemAbsorveSobra(alvo));
}
