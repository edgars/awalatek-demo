import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FiltroBeneficiario, ResultadoLegado, TabelaPaginada, type Coluna } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { descricaoSituacaoBeneficiario } from "@/domain/beneficiario/cadastro";
import { mascaraCpfLista } from "@/domain/cpf";
import { BENEF_ERRO, BENEF_NAO_ENCONTRADO } from "@/domain/chavePublica";
import { cpfExatoDaBusca, listarBeneficiarios, resolverChavePorCpf, resolverCpfPorChave } from "@/server/beneficiarios";
import { ERRO_INESPERADO } from "@/lib/falhas";
import { buscarBeneficiariosAction } from "./actions";

export const metadata: Metadata = { title: "Beneficiários" };

type Linha = Awaited<ReturnType<typeof listarBeneficiarios>>["itens"][number];

const VARIANTE_SITUACAO: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  A: "success",
  S: "warning",
  C: "destructive",
  I: "secondary",
  D: "secondary",
};

const COLUNAS: readonly Coluna<Linha>[] = [
  // LGPD (NFR-04): CPF sempre mascarado na lista.
  { titulo: "CPF", celula: (b) => <span className="valor font-mono">{mascaraCpfLista(b.numCpf)}</span> },
  { titulo: "Nome", celula: (b) => b.nomeCompleto, className: "whitespace-normal" },
  { titulo: "Programa", celula: (b) => <span className="font-mono">{b.codPrograma}</span> },
  {
    titulo: "Situação",
    celula: (b) => (
      <Badge variant={VARIANTE_SITUACAO[b.sitBeneficiario] ?? "secondary"}>
        {descricaoSituacaoBeneficiario(b.sitBeneficiario)}
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
        {/* LGPD (H2): os links levam a chave opaca, nunca o CPF. */}
        <Link href={`/beneficiarios/${b.chavePublica}/editar`} className="font-medium text-primary underline-offset-4 hover:underline">
          Editar<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
        <Link href={`/beneficiarios/${b.chavePublica}/dependentes`} className="font-medium text-primary underline-offset-4 hover:underline">
          Dependentes<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
        <Link href={`/beneficiarios/${b.chavePublica}/descontos`} className="font-medium text-primary underline-offset-4 hover:underline">
          Descontos<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
        <Link href={`/consulta?benef=${b.chavePublica}`} className="font-medium text-primary underline-offset-4 hover:underline">
          Consultar<span className="sr-only"> {b.nomeCompleto}</span>
        </Link>
      </span>
    ),
  },
];

/** Pantalla 4.4 — lista de beneficiários. */
export default async function BeneficiariosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const pagina = Number(typeof sp.pagina === "string" ? sp.pagina : 1) || 1;
  // H2 (LGPD): um CPF em `?q=` (link antigo ou digitado) não é buscado nem ecoado:
  // redireciona para o resultado do fluxo POST (chave opaca em `?benef=`).
  const cpfNaQuery = cpfExatoDaBusca(q);
  if (cpfNaQuery) {
    const r = await resolverChavePorCpf(cpfNaQuery, "busca da lista (query)");
    redirect(`/beneficiarios?benef=${encodeURIComponent(!r.ok ? BENEF_ERRO : (r.valor ?? BENEF_NAO_ENCONTRADO))}`);
  }
  // A busca por CPF chega como chave opaca (`?benef=`); o CPF só é usado no servidor.
  const benef = typeof sp.benef === "string" ? sp.benef : "";
  const resolvido = !benef ? null : benef === BENEF_ERRO ? ({ ok: false } as const) : await resolverCpfPorChave(benef, "lista (chave)");
  const erro = resolvido !== null && !resolvido.ok;
  const cpfBusca = resolvido?.ok ? resolvido.valor : null;
  const r =
    benef && !cpfBusca
      ? { itens: [], total: 0, pagina: 1, totalPaginas: 1 }
      : await listarBeneficiarios({ q: cpfBusca ?? q, pagina });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Beneficiários</h1>
        <Button asChild>
          <Link href="/beneficiarios/novo">Novo beneficiário</Link>
        </Button>
      </div>
      {erro ? <ResultadoLegado variante="erro" mensagens={[ERRO_INESPERADO]} /> : null}
      {/* LGPD: só o CPF mascarado; o campo de busca fica vazio. */}
      {cpfBusca ? <FiltroBeneficiario cpfMascarado={mascaraCpfLista(cpfBusca)} hrefLimpar="/beneficiarios" /> : null}
      <TabelaPaginada
        caminho="/beneficiarios"
        colunas={COLUNAS}
        linhas={r.itens}
        chave={(b) => b.chavePublica}
        q={benef ? "" : q}
        acaoBusca={buscarBeneficiariosAction}
        parametros={benef ? { benef } : {}}
        pagina={r.pagina}
        totalPaginas={r.totalPaginas}
        total={r.total}
        rotuloBusca="Buscar por CPF ou nome"
        vazio={
          <div className="grid justify-items-center gap-3">
            <p>
              {benef
                ? "Nenhum beneficiário encontrado para o CPF informado."
                : q
                  ? `Nenhum beneficiário encontrado para “${q}”.`
                  : "Nenhum beneficiário"}
            </p>
            <Button asChild size="sm">
              <Link href="/beneficiarios/novo">Novo beneficiário</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
