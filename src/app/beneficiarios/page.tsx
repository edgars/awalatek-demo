import type { Metadata } from "next";
import Link from "next/link";
import { TabelaPaginada, type Coluna } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROTULOS_SITUACAO_BENEFICIARIO } from "@/domain/beneficiario/cadastro";
import { mascaraCpfLista } from "@/domain/cpf";
import { listarBeneficiarios } from "@/server/beneficiarios";

export const metadata: Metadata = { title: "Beneficiários" };

type Linha = Awaited<ReturnType<typeof listarBeneficiarios>>["itens"][number];

const VARIANTE_SITUACAO: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  A: "success",
  S: "warning",
  C: "destructive",
  I: "secondary",
  D: "secondary",
};

function AcaoFutura({ children }: { children: string }) {
  return (
    <span className="cursor-not-allowed text-muted-foreground/70" aria-disabled="true" title="Disponível em uma próxima entrega">
      {children}
    </span>
  );
}

const COLUNAS: readonly Coluna<Linha>[] = [
  // LGPD (NFR-04): CPF sempre mascarado na lista.
  { titulo: "CPF", celula: (b) => <span className="valor font-mono">{mascaraCpfLista(b.numCpf)}</span> },
  { titulo: "Nome", celula: (b) => b.nomeCompleto, className: "whitespace-normal" },
  { titulo: "Programa", celula: (b) => <span className="font-mono">{b.codPrograma}</span> },
  {
    titulo: "Situação",
    celula: (b) => (
      <Badge variant={VARIANTE_SITUACAO[b.sitBeneficiario] ?? "secondary"}>
        {b.sitBeneficiario} — {ROTULOS_SITUACAO_BENEFICIARIO[b.sitBeneficiario] ?? "Desconhecido"}
      </Badge>
    ),
  },
  { titulo: "Região", celula: (b) => String(b.codRegiao).padStart(2, "0"), className: "valor" },
  { titulo: "Dependentes", celula: (b) => b.numDependentes, className: "valor text-right" },
  {
    titulo: "Ações",
    // Sem ação de excluir: o legado não exclui beneficiários.
    celula: (b) => (
      <span className="flex flex-wrap gap-3 text-sm">
        <Link href={`/beneficiarios/${b.numCpf}/editar`} className="font-medium text-primary underline-offset-4 hover:underline">
          Editar<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
        <Link href={`/beneficiarios/${b.numCpf}/dependentes`} className="font-medium text-primary underline-offset-4 hover:underline">
          Dependentes<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
        <AcaoFutura>Descontos</AcaoFutura>
        <AcaoFutura>Consultar</AcaoFutura>
      </span>
    ),
  },
];

/** Pantalla 4.4 — lista de beneficiários. */
export default async function BeneficiariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const pagina = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  const r = await listarBeneficiarios({ q, pagina });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Beneficiários</h1>
        <Button asChild>
          <Link href="/beneficiarios/novo">Novo beneficiário</Link>
        </Button>
      </div>
      <TabelaPaginada
        caminho="/beneficiarios"
        colunas={COLUNAS}
        linhas={r.itens}
        chave={(b) => b.numCpf}
        q={q}
        pagina={r.pagina}
        totalPaginas={r.totalPaginas}
        total={r.total}
        rotuloBusca="Buscar por CPF ou nome"
        vazio={
          <div className="grid justify-items-center gap-3">
            <p>{q ? `Nenhum beneficiário encontrado para “${q}”.` : "Nenhum beneficiário"}</p>
            <Button asChild size="sm">
              <Link href="/beneficiarios/novo">Novo beneficiário</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
