import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mascaraCpfLista } from "@/domain/cpf";
import { intParaCompetencia } from "@/domain/legacyDate";
import { formatarReais } from "@/domain/money";
import {
  lerFiltrosPagamentos,
  normalizarParams,
  ROTULOS_SITUACAO_PAGAMENTO,
  rotuloSituacaoPagamento,
  rotuloTipoPagamento,
  SITUACOES_PAGAMENTO,
  varianteSituacaoPagamento,
  type FiltrosPagamentos,
} from "@/domain/pagamento";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { listarPagamentos } from "@/server/pagamentos";
import { falhaInesperada } from "./falha";

export const metadata: Metadata = { title: "Pagamentos" };

type SearchParams = Record<string, string | string[] | undefined>;

function competenciaTexto(c: number): string {
  try {
    return intParaCompetencia(c) ?? "—";
  } catch {
    return String(c);
  }
}

/** Query string con los filtros vigentes (para la paginación), ya normalizados. */
function hrefPagina(params: Record<string, string>, pagina: number): string {
  const q = new URLSearchParams();
  for (const k of ["cpf", "competencia", "programa", "situacao"]) {
    const v = params[k];
    if (v) q.set(k, v);
  }
  if (pagina > 1) q.set("pagina", String(pagina));
  const s = q.toString();
  return s ? `/pagamentos?${s}` : "/pagamentos";
}

function Filtros({ params, programas }: { params: Record<string, string>; programas: readonly { codPrograma: string; nomePrograma: string }[] }) {
  const f = lerFiltrosPagamentos(params);
  const competencia = f.competencia ? (intParaCompetencia(f.competencia) ?? "") : "";
  return (
    // Formulario de consulta (GET): solo filtra la lista, no escribe nada (ADR-009).
    <form role="search" method="get" action="/pagamentos" aria-label="Filtros de pagamentos" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-cpf">CPF</Label>
        <Input
          id="filtro-cpf"
          name="cpf"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          placeholder="000.000.000-00"
          className="valor font-mono"
          defaultValue={params.cpf}
          aria-describedby="filtro-cpf-ajuda"
        />
        <span id="filtro-cpf-ajuda" className="text-xs text-muted-foreground">
          CPF completo (11 dígitos)
        </span>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-competencia">Competência</Label>
        <Input id="filtro-competencia" name="competencia" type="month" className="valor" defaultValue={competencia} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-programa">Programa</Label>
        <Select id="filtro-programa" name="programa" defaultValue={f.programa}>
          <option value="">Todos</option>
          {programas.map((p) => (
            <option key={p.codPrograma} value={p.codPrograma}>
              {p.codPrograma} – {p.nomePrograma}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-situacao">Situação</Label>
        <Select id="filtro-situacao" name="situacao" defaultValue={f.situacao}>
          <option value="">Todas</option>
          {SITUACOES_PAGAMENTO.map((s) => (
            <option key={s} value={s}>
              {s} — {ROTULOS_SITUACAO_PAGAMENTO[s]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        <Button asChild variant="ghost">
          <Link href="/pagamentos">Limpar</Link>
        </Button>
      </div>
    </form>
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

async function carregar(f: FiltrosPagamentos) {
  try {
    return { ok: true as const, lista: await listarPagamentos(f) };
  } catch (e) {
    return falhaInesperada("lista", e);
  }
}

/** Opciones de programa del filtro; si falla, lista vacía para que los filtros sigan visibles. */
async function carregarProgramas() {
  try {
    return await listarOpcoesProgramas();
  } catch (e) {
    falhaInesperada("programas", e);
    return [];
  }
}

/** Pantalla 4.15 — lista de pagamentos (solo lectura, ADR-009). */
export default async function PagamentosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = normalizarParams(await searchParams);
  const f = lerFiltrosPagamentos(params);
  const [r, programas] = await Promise.all([carregar(f), carregarProgramas()]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="text-sm text-muted-foreground">Consulta somente leitura. Pagamentos são gerados pelo cálculo e pelo lote mensal.</p>
      </div>

      <Filtros params={params} programas={programas} />

      {!r.ok ? (
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]} />
      ) : (
        <>

          {r.lista.itens.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              {f.cpf === null ? "Informe o CPF completo (11 dígitos)." : "Nenhum pagamento"}
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="text-right">
                      Nº
                    </TableHead>
                    <TableHead scope="col">CPF</TableHead>
                    <TableHead scope="col">Programa</TableHead>
                    <TableHead scope="col">Competência</TableHead>
                    <TableHead scope="col" className="text-right">
                      Bruto
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Desconto
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Líquido
                    </TableHead>
                    <TableHead scope="col">Situação</TableHead>
                    <TableHead scope="col">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.lista.itens.map((p) => (
                    <TableRow key={p.numPagamento}>
                      <TableCell className="valor text-right">
                        <Link href={`/pagamentos/${p.numPagamento}`} className="font-mono font-medium text-primary underline-offset-4 hover:underline">
                          {p.numPagamento}
                        </Link>
                      </TableCell>
                      {/* LGPD (NFR-04): CPF sempre mascarado na lista. */}
                      <TableCell className="valor font-mono">{mascaraCpfLista(p.numCpf)}</TableCell>
                      <TableCell className="font-mono">{p.codPrograma}</TableCell>
                      <TableCell className="valor">{competenciaTexto(p.anoMesRef)}</TableCell>
                      <TableCell className="valor text-right">{formatarReais(p.vlrBruto)}</TableCell>
                      <TableCell className="valor text-right">{formatarReais(p.vlrDescontoTotal)}</TableCell>
                      <TableCell className="valor text-right">{formatarReais(p.vlrLiquido)}</TableCell>
                      <TableCell>
                        <Badge variant={varianteSituacaoPagamento(p.sitPagamento)}>{rotuloSituacaoPagamento(p.sitPagamento)}</Badge>
                      </TableCell>
                      <TableCell>{rotuloTipoPagamento(p.tipoPgto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <nav aria-label="Paginação" className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {r.lista.total} registro{r.lista.total === 1 ? "" : "s"} · página {r.lista.pagina} de {r.lista.totalPaginas}
            </span>
            <span className="flex gap-2">
              <PaginaLink href={hrefPagina(params, r.lista.pagina - 1)} ativo={r.lista.pagina > 1}>
                Anterior
              </PaginaLink>
              <PaginaLink href={hrefPagina(params, r.lista.pagina + 1)} ativo={r.lista.pagina < r.lista.totalPaginas}>
                Próxima
              </PaginaLink>
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
