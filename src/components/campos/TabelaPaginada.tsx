import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Coluna<T> = {
  titulo: string;
  celula: (linha: T) => ReactNode;
  className?: string;
};

/**
 * Tabla de listas e informes con búsqueda (`?q=`) y paginación (`?pagina=`) por
 * URL: funciona sin JS y el estado se puede compartir por enlace. Componente de
 * servidor. Los CPF deben llegar ya enmascarados en `celula` (E2+).
 */
export function TabelaPaginada<T>({
  caminho,
  colunas,
  linhas,
  chave,
  q = "",
  pagina,
  totalPaginas,
  total,
  rotuloBusca = "Buscar",
  vazio,
}: {
  caminho: string;
  colunas: readonly Coluna<T>[];
  linhas: readonly T[];
  chave: (linha: T) => string;
  q?: string;
  pagina: number;
  totalPaginas: number;
  total: number;
  rotuloBusca?: string;
  vazio: ReactNode;
}) {
  const idBusca = useId();
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("pagina", String(p));
    const s = sp.toString();
    return s ? `${caminho}?${s}` : caminho;
  };
  return (
    <div className="grid gap-3">
      <form role="search" action={caminho} className="flex max-w-md gap-2">
        <label htmlFor={idBusca} className="sr-only">
          {rotuloBusca}
        </label>
        <Input id={idBusca} name="q" type="search" defaultValue={q} placeholder={rotuloBusca} />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{vazio}</div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {colunas.map((c, i) => (
                  <TableHead key={i} scope="col" className={c.className}>
                    {c.titulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={chave(l)}>
                  {colunas.map((c, i) => (
                    <TableCell key={i} className={c.className}>
                      {c.celula(l)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <nav aria-label="Paginação" className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} registro{total === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
        </span>
        <span className="flex gap-2">
          <PaginaLink href={href(pagina - 1)} ativo={pagina > 1}>
            Anterior
          </PaginaLink>
          <PaginaLink href={href(pagina + 1)} ativo={pagina < totalPaginas}>
            Próxima
          </PaginaLink>
        </span>
      </nav>
    </div>
  );
}

function PaginaLink({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  if (!ativo) {
    return (
      <Button variant="outline" size="sm" disabled aria-disabled="true">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
