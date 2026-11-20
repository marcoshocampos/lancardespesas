'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { competenciaBaseDaFatura } from '@/domain/competencia';
import { MAXIMO_DE_PARCELAS } from '@/domain/divisao';
import { auth } from '../auth';
import {
  type EntradaLancamento,
  criarLancamento,
  editarLancamento,
  excluirLancamento,
  marcarReembolso,
  restaurarLancamento,
} from '../repositorios/lancamento';

const esquema = z
  .object({
    descricao: z.string().trim().min(1, 'Descrição obrigatória').max(120),
    valorCentavos: z.number().int('Valor deve ser inteiro em centavos'),
    origemValor: z.enum(['POR_PARCELA', 'TOTAL']),
    dataCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser AAAA-MM-DD'),
    numeroParcelas: z.number().int().min(1).max(MAXIMO_DE_PARCELAS),
    escopo: z.enum(['PESSOAL', 'CONJUNTO']),
    contaId: z.string().min(1),
    categoriaId: z.string().min(1),
    membroId: z.string().optional(),
    ehReembolso: z.boolean().optional(),
    devedorNome: z.string().trim().max(80).optional(),
    /**
     * A Fatura da parcela que a tela descreve: a clicada, na edicao; a
     * inicial, na criacao. Vira competencia base aqui, e o repositorio nunca
     * ve a Fatura. Sem ela, a competencia sai da data, como sempre.
     */
    fatura: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    parcelaInicial: z.number().int().min(1).max(MAXIMO_DE_PARCELAS).optional(),
  })
  .refine((d) => (d.parcelaInicial ?? 1) <= d.numeroParcelas, {
    message: 'A parcela inicial passa do número de parcelas',
    path: ['parcelaInicial'],
  });

const esquemaAlcance = z.enum(['SO_ESTA', 'ESTA_E_SEGUINTES', 'TODAS']);
const esquemaNumero = z.number().int().min(1).max(MAXIMO_DE_PARCELAS);

/** Troca a Fatura da parcela `numero` pela competencia base que o repositorio grava. */
function paraEntrada(dados: z.infer<typeof esquema>, numero: number): EntradaLancamento {
  const { fatura, ...resto } = dados;
  return fatura ? { ...resto, competenciaManual: competenciaBaseDaFatura(fatura, numero) } : resto;
}

async function exigirSessao() {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');
  return sessao;
}

export async function acaoCriarLancamento(dados: unknown) {
  await exigirSessao();
  const lido = esquema.parse(dados);
  const resultado = await criarLancamento(paraEntrada(lido, lido.parcelaInicial ?? 1));
  revalidatePath('/despesas');
  return resultado;
}

/**
 * `alcance` e `numero` chegam como `unknown` e passam por zod: action e porta
 * publica, e a tela nao e a unica que pode chama-la. Sem `numero`, a Fatura
 * descreve a parcela 1 — a tela sempre manda a parcela clicada.
 */
export async function acaoEditarLancamento(
  id: string,
  versao: number,
  dados: unknown,
  alcance: unknown = 'TODAS',
  numero?: unknown,
) {
  await exigirSessao();
  const lido = esquema.parse(dados);
  const qual = esquemaAlcance.parse(alcance);
  const k = numero === undefined ? undefined : esquemaNumero.parse(numero);
  const resultado = await editarLancamento(id, versao, paraEntrada(lido, k ?? 1), qual, k);
  revalidatePath('/despesas');
  return resultado;
}

export async function acaoExcluirLancamento(
  id: string,
  versao: number,
  alcance: unknown = 'TODAS',
  numero?: unknown,
) {
  await exigirSessao();
  const qual = esquemaAlcance.parse(alcance);
  const k = numero === undefined ? undefined : esquemaNumero.parse(numero);
  const resultado = await excluirLancamento(id, versao, qual, k);
  revalidatePath('/despesas');
  return resultado;
}

const esquemaReembolso = z.object({
  id: z.string().min(1),
  versao: z.number().int().min(1),
  /** Qual parcela: o recebido e de cada mes, nao do lancamento inteiro. */
  numero: z.number().int().min(1),
  recebido: z.boolean(),
});

export async function acaoMarcarReembolso(dados: unknown) {
  await exigirSessao();
  const { id, versao, numero, recebido } = esquemaReembolso.parse(dados);
  const resultado = await marcarReembolso(id, versao, numero, recebido);
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
