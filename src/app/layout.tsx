import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Despesas do casal",
  description: "Lançamento e resumo mensal das despesas de Nardy e Nick.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        {/* Só para ação sem resultado visível na tela — por isso curto e discreto */}
        <Toaster position="bottom-right" duration={3000} />
      </body>
    </html>
  );
}
