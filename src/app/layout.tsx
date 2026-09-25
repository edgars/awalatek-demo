import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { NavLateral } from "@/components/layout/NavLateral";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIFAP", template: "%s · SIFAP" },
  description: "Sistema de Pagamentos de Programas Sociais",
};

/** Usuario operativo leído en tiempo de ejecución (no en el build). */
async function UsuarioOperativo() {
  await connection();
  const usuario = process.env.SIFAP_USER?.trim() || "—";
  return (
    <span className="text-sm">
      Usuário: <strong className="valor font-mono">{usuario}</strong>
    </span>
  );
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen md:grid md:grid-cols-[15rem_1fr] print:block print:bg-white">
        <aside className="bg-sidebar p-4 text-sidebar-foreground md:min-h-screen print:hidden">
          <Link href="/" className="mb-5 block px-2 text-lg font-bold tracking-tight">
            SIFAP
          </Link>
          <NavLateral />
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="flex items-center justify-between gap-4 border-b bg-card px-6 py-3 print:hidden">
            <span className="text-sm text-muted-foreground">Sistema de Pagamentos de Programas Sociais</span>
            <Suspense fallback={<span className="text-sm">Usuário: …</span>}>
              <UsuarioOperativo />
            </Suspense>
          </header>
          <main className="w-full flex-1 p-6 print:p-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
