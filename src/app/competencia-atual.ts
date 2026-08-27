import { competenciaDeDataISO, type Competencia } from '@/domain/competencia';
import type { DataISO } from '@/domain/data';

/**
 * Competencia do "hoje", no fuso America/Sao_Paulo — nunca no fuso do runtime.
 *
 * Na Vercel o runtime roda em UTC: usar `new Date()` direto faz as telas virarem o mes
 * entre 21h e meia-noite no horario de Brasilia do ultimo dia, ainda dentro do mes atual
 * aqui. `Intl.DateTimeFormat('sv-SE', { timeZone })` ja formata a data corrigida como
 * "AAAA-MM-DD", que e o formato de DataISO — dai so falta extrair o mes calendario.
 *
 * Fica fora de src/domain/ de proposito: e a unica peca deste calculo que toca o
 * relogio, e por isso nao pode ser funcao pura nem tem teste automatizado.
 */
export function competenciaAtual(): Competencia {
  const hoje: DataISO = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  return competenciaDeDataISO(hoje);
}
