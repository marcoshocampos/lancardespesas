import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { COOKIE_TEMA, ehTemaForcado } from "@/components/casco/tema-compartilhado";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Despesas do casal",
  description: "Lançamento e resumo mensal das despesas de Nardy e Nick.",
};

/**
 * O tema forçado vem de COOKIE, e não de `localStorage`, por um motivo que
 * custou uma tentativa: o servidor consegue ler cookie, e com isso renderiza
 * `data-tema` já no HTML.
 *
 * A alternativa comum — guardar no `localStorage` e aplicar por script inline
 * antes da primeira pintura — **foi construída e descartada**. Ela resolve o
 * lampejo, mas o atributo aparece no `<html>` antes de o React hidratar e o
 * HTML do servidor não o tem: erro de hidratação no console a cada
 * carregamento. `suppressHydrationWarning` no `<html>` **não suprime esse caso
 * no Next 16** — testado, com o servidor reiniciado, e o erro continua.
 *
 * Com cookie não há divergência a suprimir nem script a correr antes da
 * pintura: o servidor já manda o atributo certo. O custo é que ler cookie torna
 * o layout dinâmico, e `/entrar` deixa de ser pré-renderizado — irrelevante num
 * sistema onde todo o resto já é dinâmico por depender de sessão.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const forcado = (await cookies()).get(COOKIE_TEMA)?.value;
  const tema = ehTemaForcado(forcado) ? forcado : null;

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} h-full antialiased`}
      {...(tema ? { "data-tema": tema } : {})}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Só para ação sem resultado visível na tela — por isso curto e discreto */}
        <Toaster position="bottom-right" duration={3000} />
      </body>
    </html>
  );
}
