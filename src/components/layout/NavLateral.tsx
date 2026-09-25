"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAVEGACAO } from "./navegacao";

export function NavLateral() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="grid gap-5 text-sm">
      {NAVEGACAO.map((g) => (
        <div key={g.titulo} className="grid gap-1">
          <h2 className="px-2 text-xs font-semibold tracking-wide text-sidebar-muted uppercase">{g.titulo}</h2>
          <ul className="grid gap-0.5">
            {g.itens.map((item) => {
              if (!item.href) {
                return (
                  <li key={item.titulo}>
                    <span
                      className="block cursor-not-allowed rounded-md px-2 py-1 text-sidebar-muted/70"
                      aria-disabled="true"
                      title="Disponível em uma próxima entrega"
                    >
                      {item.titulo}
                    </span>
                  </li>
                );
              }
              const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.titulo}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sidebar-foreground/60",
                      ativo && "bg-white/15 font-semibold",
                    )}
                  >
                    {item.titulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
