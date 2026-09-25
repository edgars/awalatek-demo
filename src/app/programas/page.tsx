import type { Metadata } from "next";
import Link from "next/link";
import { TabelaPaginada, type Coluna } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarReais } from "@/domain/money";
import { podeAlterarPrograma, ROTULOS_SITUACAO, ROTULOS_TIPO, type TipoPrograma } from "@/domain/programa";
import { listarProgramas } from "@/server/programas";

export const metadata: Metadata = { title: "Programas sociais" };

type Linha = Awaited<ReturnType<typeof listarProgramas>>["itens"][number];

const COLUNAS: readonly Coluna<Linha>[] = [
  {
    titulo: "Código",
    celula: (p) => (
      <Link href={`/programas/${p.codPrograma}`} className="valor font-mono font-medium text-primary underline-offset-4 hover:underline">
        {p.codPrograma}
      </Link>
    ),
  },
  { titulo: "Nome", celula: (p) => p.nomePrograma, className: "whitespace-normal" },
  { titulo: "Sigla", celula: (p) => p.siglaPrograma ?? "—" },
  { titulo: "Tipo", celula: (p) => `${p.tipoPrograma} — ${ROTULOS_TIPO[p.tipoPrograma as TipoPrograma] ?? p.tipoPrograma}` },
  {
    titulo: "Situação",
    celula: (p) => (
      <Badge variant={p.sitPrograma === "A" ? "success" : "secondary"}>
        {p.sitPrograma} — {ROTULOS_SITUACAO[p.sitPrograma] ?? p.sitPrograma}
      </Badge>
    ),
  },
  { titulo: "Valor base (R$)", celula: (p) => formatarReais(p.vlrBaseIndividual), className: "valor text-right" },
  {
    titulo: "Ações",
    // Programa encerrado (E) no se altera: sin acción de fila.
    celula: (p) =>
      podeAlterarPrograma(p.sitPrograma) ? (
      <Link
        href={`/programas/${p.codPrograma}/editar`}
        aria-label={`Editar programa ${p.codPrograma}`}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Editar
      </Link>
      ) : (
        "—"
      ),
  },
];

/** Pantalla 4.1 — lista de programas. */
export default async function ProgramasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const pagina = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  const r = await listarProgramas({ q, pagina });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Programas sociais</h1>
        <Button asChild>
          <Link href="/programas/novo">Novo programa</Link>
        </Button>
      </div>
      <TabelaPaginada
        caminho="/programas"
        colunas={COLUNAS}
        linhas={r.itens}
        chave={(p) => p.codPrograma}
        q={q}
        pagina={r.pagina}
        totalPaginas={r.totalPaginas}
        total={r.total}
        rotuloBusca="Buscar por código ou nome"
        vazio={
          <div className="grid justify-items-center gap-3">
            <p>{q ? `Nenhum programa encontrado para “${q}”.` : "Nenhum programa cadastrado."}</p>
            <Button asChild size="sm">
              <Link href="/programas/novo">Novo programa</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
