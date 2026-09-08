import { redirect } from 'next/navigation';

/**
 * A raiz nao tem conteudo proprio: o sistema comeca na grade do mes, que e
 * onde o casal passa quase todo o tempo. O middleware ja exigiu sessao antes
 * de chegar aqui.
 */
export default function Home() {
  redirect('/despesas');
}
