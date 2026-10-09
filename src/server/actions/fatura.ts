'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { membroDaSessao } from '../membro-da-sessao';
import { destravarFatura, registrarValorReal, travarFatura } from '../repositorios/fatura';

// Uma definicao so: as duas acoes recebem a mesma dupla, e duas copias da
// regex de competencia e como as duas divergem sem ninguem notar.
const alvoDaFatura = {
  contaId: z.string().min(1),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
};

const esquema = z.object({ ...alvoDaFatura, valorCentavos: z.number().int() });

export async function acaoRegistrarValorReal(dados: unknown) {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');

  const { contaId, competencia, valorCentavos } = esquema.parse(dados);
  const resultado = await registrarValorReal(contaId, competencia, valorCentavos);
  if (resultado.ok) revalidatePath('/resumo');
  return resultado;
}

const esquemaTrava = z.object(alvoDaFatura);

/**
 * Fecha o mes. Nao recebe o membro da tela: quem gravou a trava e quem a
 * sessao diz que e, nunca quem o cliente afirma ser.
 */
export async function acaoTravarFatura(dados: unknown) {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');

  const { contaId, competencia } = esquemaTrava.parse(dados);
  const resultado = await travarFatura(contaId, competencia, await membroDaSessao());
  if (resultado.ok) {
    // As duas telas mudam: o Resumo mostra o selo travado, e o Despesas passa
    // a recusar lancamento naquelas competencias.
    revalidatePath('/resumo');
    revalidatePath('/despesas');
  }
  return resultado;
}

export async function acaoDestravarFatura(dados: unknown) {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');

  const { contaId, competencia } = esquemaTrava.parse(dados);
  const resultado = await destravarFatura(contaId, competencia, await membroDaSessao());
  if (resultado.ok) {
    revalidatePath('/resumo');
    revalidatePath('/despesas');
  }
  return resultado;
}
