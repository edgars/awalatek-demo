import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIFAP",
  description: "Sistema de Pagamentos de Programas Sociais",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo">
          <strong>SIFAP</strong>
          <span>Sistema de Pagamentos de Programas Sociais</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
