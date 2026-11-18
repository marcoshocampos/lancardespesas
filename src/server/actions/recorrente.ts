'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import {
  criarRecorrente,
  editarRecorrente,
  lancarRecorrentes,
} from '../repositorios/recorrente';

const competencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês deve ser AAAA-MM');

const esquemaBase = z
  .object({
    descricao: z.string().trim().min(1, 'Descrição obrigatória').max(120),
    // Positivo: recorrente e cobranca que se repete. Estorno recorrente nao
    // existe, e valor zero geraria lancamento que nao soma nada.
    valorCentavos: z.number().int().positive('Valor deve ser maior que zero'),
    escopo: z.enum(['PESSOAL', 'CONJUNTO']),
    membroId: z.string().min(1).optional(),
    contaId: z.string().min(1),
    categoriaId: z.string().min(1),
    diaDoMes: z.number().int().min(1).max(31),
    competenciaInicio: competencia,
  })
  .refine((d) => d.escopo === 'CONJUNTO' || Boolean(d.membroId), {
    message: 'Recorrente pessoal precisa de uma pessoa',
    path: ['membroId'],
  });

async function exigirSessao() {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');
}

/** A lista muda em /recorrentes; a faixa de pendentes muda no Despesas. */
function revalidarCadastro() {
  revalidatePath('/recorrentes');
  revalidatePath('/despesas');
}

export async function acaoCriarRecorrente(dados: unknown) {
  await exigirSessao();
  const criada = await criarRecorrente(esquemaBase.parse(dados));
  revalidarCadastro();
  return { ok: true as const, id: criada.id };
}

export async function acaoEditarRecorrente(id: string, dados: unknown) {
  await exigirSessao();
  const alvo = z.string().min(1).parse(id);
  const entrada = esquemaBase.and(z.object({ ativa: z.boolean() })).parse(dados);
  const resultado = await editarRecorrente(alvo, entrada);
  if (resultado.ok) revalidarCadastro();
  return resultado;
}

/**
 * O clique da faixa. Recebe so a competencia: QUAIS recorrentes lancar e
 * decidido no servidor, pela mesma triagem que montou a faixa — a tela nao
 * manda lista de ids, entao nao ha como pedir uma recorrente desativada, de
 * conta travada ou ja lancada.
 */
export async function acaoLancarRecorrentes(dados: unknown) {
  await exigirSessao();
  const { competencia: alvo } = z.object({ competencia }).parse(dados);
  const resultado = await lancarRecorrentes(alvo);
  if (resultado.lancadas > 0) {
    revalidatePath('/despesas');
    revalidatePath('/resumo');
    revalidatePath('/graficos');
  }
  return resultado;
}
