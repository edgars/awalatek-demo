import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { lerFiltrosRelatorioPagamentos, TITULO_RELATORIO_PAGAMENTOS, type FiltrosTelaRelatorioPagamentos } from "@/domain/relatorios/pagamentos";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { relatorioPagamentos } from "@/server/relatorios";
import { BotaoImprimir } from "./_componentes/BotaoImprimir";
import { Filtros } from "./_componentes/Filtros";
import { TabelaRelatorio, TotalGeralRelatorio } from "./_componentes/TabelaRelatorio";
import { VersaoImpressao } from "./_componentes/VersaoImpressao";
import { falhaInesperada } from "./falha";

export const metadata: Metadata = { title: "Relatório de pagamentos" };

type SearchParams = Record<string, string | string[] | undefined>;

/** URL del informe con los filtros vigentes (ya validados). */
function hrefRelatorio(f: FiltrosTelaRelatorioPagamentos, extra: { pagina?: number; impressao?: boolean } = {}): string {
  const q = new URLSearchParams();
  q.set("compIni", String(f.compIni));
  q.set("compFim", String(f.compFim));
  if (f.programa) q.set("programa", f.programa);
  if (extra.pagina && extra.pagina > 1) q.set("pagina", String(extra.pagina));
  if (extra.impressao) q.set("impressao", "1");
  return `/relatorios/pagamentos?${q.toString()}`;
}

async function carregar(f: FiltrosTelaRelatorioPagamentos) {
  try {
    return { ok: true as const, relatorio: await relatorioPagamentos({ compIni: f.compIni, compFim: f.compFim, programa: f.programa }) };
  } catch (e) {
    return falhaInesperada("relatorio", e);
  }
}

/** Opciones del select de programas; si falla, lista vacía para que los filtros sigan visibles. */
async function carregarProgramas() {
  try {
    return await listarOpcoesProgramas();
  } catch (e) {
    falhaInesperada("programas", e);
    return [];
  }
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

/** Pantalla 4.18 — Relatório de pagamentos (RELPGT). Solo lectura. */
export default async function RelatorioPagamentosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const f = lerFiltrosRelatorioPagamentos(await searchParams);
  const informado = f.compIni > 0 && f.compFim > 0;
  const [r, programas] = await Promise.all([informado ? carregar(f) : Promise.resolve(null), carregarProgramas()]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Relatório de pagamentos</h1>
        <p className="text-sm text-muted-foreground">Relatório analítico por período, com subtotal por programa e total geral. Somente leitura.</p>
      </div>

      <Filtros f={f} programas={programas} />

      {r === null ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Informe a competência inicial e a final.</div>
      ) : !r.ok ? (
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]} />
      ) : f.impressao ? (
        <>
          <div className="flex items-center justify-between gap-2 print:hidden">
            <Button asChild variant="outline">
              <Link href={hrefRelatorio(f)}>Voltar ao relatório</Link>
            </Button>
            <BotaoImprimir />
          </div>
          <VersaoImpressao
            paginas={r.relatorio.paginas}
            total={r.relatorio.total}
            compIni={f.compIni}
            compFim={f.compFim}
            data={r.relatorio.dataEmissao}
          />
        </>
      ) : (
        <TelaRelatorio f={f} relatorio={r.relatorio} />
      )}
    </div>
  );
}

function TelaRelatorio({ f, relatorio }: { f: FiltrosTelaRelatorioPagamentos; relatorio: Awaited<ReturnType<typeof relatorioPagamentos>> }) {
  const totalPaginas = relatorio.paginas.length;
  const pagina = Math.min(f.pagina, Math.max(1, totalPaginas));
  const linhas = relatorio.paginas[pagina - 1] ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted-foreground">
          {TITULO_RELATORIO_PAGAMENTOS} · PERIODO: {f.compIni} A {f.compFim}
        </p>
        <Button asChild variant="outline">
          <Link href={hrefRelatorio(f, { impressao: true })}>Versão para impressão</Link>
        </Button>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Nenhum pagamento no período</div>
      ) : (
        <div className="rounded-lg border bg-card">
          <TabelaRelatorio linhas={linhas} rotulo="Relatório de pagamentos" />
        </div>
      )}

      {totalPaginas > 0 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {relatorio.total.qtd} pagamento{relatorio.total.qtd === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
          </span>
          <span className="flex gap-2">
            <PaginaLink href={hrefRelatorio(f, { pagina: pagina - 1 })} ativo={pagina > 1}>
              Anterior
            </PaginaLink>
            <PaginaLink href={hrefRelatorio(f, { pagina: pagina + 1 })} ativo={pagina < totalPaginas}>
              Próxima
            </PaginaLink>
          </span>
        </nav>
      ) : null}

      <TotalGeralRelatorio total={relatorio.total} />
    </>
  );
}
