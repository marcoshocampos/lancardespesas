'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import {
  criarLancamento,
  editarLancamento,
  excluirLancamento,
  marcarReembolso,
  restaurarLancamento,
} from '../repositorios/lancamento';

const esquema = z.object({
  descricao: z.string().trim().min(1, 'Descrição obrigatória').max(120),
  valorCentavos: z.number().int('Valor deve ser inteiro em centavos'),
  origemValor: z.enum(['POR_PARCELA', 'TOTAL']),
  dataCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
  numeroParcelas: z.number().int().min(1).max(72),
  escopo: z.enum(['PESSOAL', 'CONJUNTO']),
  contaId: z.string().min(1),
  categoriaId: z.string().min(1),
  membroId: z.string().optional(),
  competenciaManual: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  ehReembolso: z.boolean().optional(),
  devedorNome: z.string().trim().max(80).optional(),
});

async function exigirSessao() {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');
  return sessao;
}

export async function acaoCriarLancamento(dados: unknown) {
  await exigirSessao();
  const entrada = esquema.parse(dados);
  const resultado = await criarLancamento(entrada);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoEditarLancamento(id: string, versao: number, dados: unknown) {
  await exigirSessao();
  const entrada = esquema.parse(dados);
  const resultado = await editarLancamento(id, versao, entrada);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoExcluirLancamento(id: string, versao: number) {
  await exigirSessao();
  const resultado = await excluirLancamento(id, versao);
  revalidatePath('/despesas');
  return resultado;
}

const esquemaReembolso = z.object({
  id: z.string().min(1),
  versao: z.number().int().min(1),
  recebido: z.boolean(),
});

export async function acaoMarcarReembolso(dados: unknown) {
  await exigirSessao();
  const { id, versao, recebido } = esquemaReembolso.parse(dados);
  const resultado = await marcarReembolso(id, versao, recebido);
  if (resultado.ok) {
    // O Resumo mostra a lista; a grade mostra o selo de reembolso na linha.
    revalidatePath('/resumo');
    revalidatePath('/despesas');
  }
  return resultado;
}

export async function acaoRestaurarLancamento(id: string, versao: number) {
  await exigirSessao();
  const resultado = await restaurarLancamento(id, versao);
  if (resultado.ok) {
    // A grade do mes volta a mostrar as parcelas, o resumo volta a soma-las,
    // e a lixeira perde a linha.
    revalidatePath('/despesas');
    revalidatePath('/resumo');
    revalidatePath('/lixeira');
  }
  return resultado;
}
