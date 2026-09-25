import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Button } from "@/components/ui/button";
import {
  lerFiltrosRelatorioPagamentos,
  MENSAGENS_RELATORIO_PAGAMENTOS,
  TITULO_RELATORIO_PAGAMENTOS,
  validarFiltrosRelatorioPagamentos,
  type FiltrosRelatorioPagamentos,
} from "@/domain/relatorios/pagamentos";
import { MSG_LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { relatorioPagamentos, type RelatorioPagamentosCompleto } from "@/server/relatorios";
import { BotaoImprimir } from "./_componentes/BotaoImprimir";
import { Filtros } from "./_componentes/Filtros";
import { TabelaRelatorio, TotalGeralRelatorio } from "./_componentes/TabelaRelatorio";
import { VersaoImpressao } from "./_componentes/VersaoImpressao";
import { falhaInesperada } from "@/lib/falhas";

export const metadata: Metadata = { title: "Relatório de pagamentos" };

type SearchParams = Record<string, string | string[] | undefined>;

/** URL del informe con los filtros vigentes (ya validados). */
function hrefRelatorio(f: FiltrosRelatorioPagamentos, extra: { pagina?: number; impressao?: boolean } = {}): string {
  const q = new URLSearchParams();
  q.set("compIni", String(f.compIni));
  q.set("compFim", String(f.compFim));
  if (f.programa) q.set("programa", f.programa);
  if (extra.pagina && extra.pagina > 1) q.set("pagina", String(extra.pagina));
  if (extra.impressao) q.set("impressao", "1");
  return `/relatorios/pagamentos?${q.toString()}`;
}

async function carregar(f: FiltrosRelatorioPagamentos) {
  try {
    return { ok: true as const, relatorio: await relatorioPagamentos(f) };
  } catch (e) {
    return falhaInesperada("relatorio-pagamentos", "relatorio", e);
  }
}

/** Opciones del select de programas; si falla, lista vacía para que los filtros sigan visibles. */
async function carregarProgramas() {
  try {
    return await listarOpcoesProgramas();
  } catch (e) {
    falhaInesperada("relatorio-pagamentos", "programas", e);
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
  const tela = lerFiltrosRelatorioPagamentos(await searchParams);
  const v = validarFiltrosRelatorioPagamentos(tela);
  const [r, programas] = await Promise.all([v.ok ? carregar(v.filtros) : Promise.resolve(null), carregarProgramas()]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Relatório de pagamentos</h1>
        <p className="text-sm text-muted-foreground">Relatório analítico por período, com subtotal por programa e total geral. Somente leitura.</p>
      </div>

      <Filtros f={tela} erros={v.ok ? {} : v.erros} programas={programas} />

      {!v.ok || r === null ? (
        !v.ok && v.aviso ? (
          <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{v.aviso}</div>
        ) : null
      ) : !r.ok ? (
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]} />
      ) : r.relatorio.limiteExcedido ? (
        <div role="status" data-testid="limite-relatorio" className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {MSG_LIMITE_LINHAS_RELATORIO}
        </div>
      ) : tela.impressao ? (
        <>
          <div className="flex items-center justify-between gap-2 print:hidden">
            <Button asChild variant="outline">
              <Link href={hrefRelatorio(v.filtros)}>Voltar ao relatório</Link>
            </Button>
            <BotaoImprimir />
          </div>
          <VersaoImpressao
            paginas={r.relatorio.paginas}
            total={r.relatorio.total}
            compIni={v.filtros.compIni}
            compFim={v.filtros.compFim}
            data={r.relatorio.dataEmissao}
          />
        </>
      ) : (
        <TelaRelatorio f={v.filtros} paginaPedida={tela.pagina} relatorio={r.relatorio} />
      )}
    </div>
  );
}

function TelaRelatorio({
  f,
  paginaPedida,
  relatorio,
}: {
  f: FiltrosRelatorioPagamentos;
  paginaPedida: number;
  relatorio: RelatorioPagamentosCompleto }) {
  const totalPaginas = relatorio.paginas.length;
  const pagina = Math.min(paginaPedida, Math.max(1, totalPaginas));
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
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{MENSAGENS_RELATORIO_PAGAMENTOS.vazio}</div>
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
