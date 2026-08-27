'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../auth';
import { registrarValorReal } from '../repositorios/fatura';

const esquema = z.object({
  contaId: z.string().min(1),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  valorCentavos: z.number().int(),
});

export async function acaoRegistrarValorReal(dados: unknown) {
  const sessao = await auth();
  if (!sessao?.user) throw new Error('Não autenticado');

  const { contaId, competencia, valorCentavos } = esquema.parse(dados);
  await registrarValorReal(contaId, competencia, valorCentavos);
  revalidatePath('/resumo');
}
