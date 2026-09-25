import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { hoje } from "@/domain/legacyDate";
import {
  CABECALHO_AUDITORIA,
  lerFiltrosRelatorioAuditoria,
  MENSAGENS_RELATORIO_AUDITORIA,
  validarFiltrosRelatorioAuditoria,
  type ErrosFiltrosAuditoria,
  type FiltrosRelatorioAuditoria,
  type FiltrosTelaRelatorioAuditoria,
} from "@/domain/relatorios/auditoria";
import { MSG_LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { relatorioAuditoria, type RelatorioAuditoriaCompleto } from "@/server/relatorioAuditoria";
import { BotaoImprimir } from "./_componentes/BotaoImprimir";
import { Filtros, type ValoresFiltrosAuditoria } from "./_componentes/Filtros";
import { ResumoAuditoriaBloco, TabelaAuditoria } from "./_componentes/TabelaAuditoria";
import { VersaoImpressao } from "./_componentes/VersaoImpressao";
import { falhaInesperada } from "@/lib/falhas";

export const metadata: Metadata = { title: "Relatório de auditoria" };

type SearchParams = Record<string, string | string[] | undefined>;

/** URL del informe con los filtros vigentes (ya con defaults). */
function hrefRelatorio(f: FiltrosRelatorioAuditoria, extra: { pagina?: number; impressao?: boolean } = {}): string {
  const q = new URLSearchParams();
  q.set("dtIni", String(f.dtIni));
  q.set("dtFim", String(f.dtFim));
  if (f.acao) q.set("acao", f.acao);
  if (f.usuario) q.set("usuario", f.usuario);
  if (f.tabela) q.set("tabela", f.tabela);
  q.set("saida", f.saida);
  if (extra.pagina && extra.pagina > 1) q.set("pagina", String(extra.pagina));
  if (extra.impressao) q.set("impressao", "1");
  return `/relatorios/auditoria?${q.toString()}`;
}

async function carregar(f: FiltrosRelatorioAuditoria, agora: Date) {
  try {
    return { ok: true as const, relatorio: await relatorioAuditoria(f, undefined, agora) };
  } catch (e) {
    return falhaInesperada("relatorio-auditoria", "relatorio", e);
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

/** Primer valor crudo de un parámetro de la query string. */
function bruto(sp: SearchParams, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

/** Fecha cruda para el selector: solo si tiene forma de fecha (el navegador descarta días inexistentes). */
function dataBruta(s: string): number {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : 0;
}

function valoresComErro(sp: SearchParams, tela: FiltrosTelaRelatorioAuditoria, erros: ErrosFiltrosAuditoria): ValoresFiltrosAuditoria {
  const texto = (k: "acao" | "usuario" | "tabela", ok: string | null) => (erros[k] ? bruto(sp, k) : (ok ?? ""));
  return {
    dtIni: erros.dtIni ? dataBruta(bruto(sp, "dtIni")) : (tela.dtIni ?? 0),
    dtFim: erros.dtFim ? dataBruta(bruto(sp, "dtFim")) : (tela.dtFim ?? 0),
    dtIniBruta: erros.dtIni ? bruto(sp, "dtIni") : undefined,
    dtFimBruta: erros.dtFim ? bruto(sp, "dtFim") : undefined,
    acao: texto("acao", tela.acao),
    usuario: texto("usuario", tela.usuario),
    tabela: texto("tabela", tela.tabela),
    saida: erros.saida ? bruto(sp, "saida") : tela.saida || "T",
  };
}

/** Pantalla 4.20 — Relatório de auditoria (RELAUDIT). Solo lectura: no escribe auditoría (FR-AUD-07). */
export default async function RelatorioAuditoriaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const agora = new Date();
  const sp = await searchParams;
  const tela = lerFiltrosRelatorioAuditoria(sp);
  const v = validarFiltrosRelatorioAuditoria(tela, hoje(agora).data);
  const r = v.ok ? await carregar(v.filtros, agora) : null;

  // Valores del formulario: con defaults si son válidos; si no, cada campo inválido vuelve a
  // mostrar lo que se envió, junto a su error.
  const valores: ValoresFiltrosAuditoria = v.ok ? { ...v.filtros } : valoresComErro(sp, tela, v.erros);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Relatório de auditoria</h1>
        <p className="text-sm text-muted-foreground">Trilha de auditoria do sistema por período, ação, usuário e tabela. Somente leitura.</p>
      </div>

      <Filtros v={valores} erros={v.ok ? {} : v.erros} />

      {!v.ok || r === null ? null : !r.ok ? (
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
            resumo={r.relatorio.resumo}
            saida={r.relatorio.saida}
            dtIni={r.relatorio.filtros.dtIni}
            dtFim={r.relatorio.filtros.dtFim}
            data={r.relatorio.dataEmissao}
          />
        </>
      ) : (
        <TelaRelatorio f={v.filtros} paginaPedida={tela.pagina} relatorio={r.relatorio} />
      )}
    </div>
  );
}

function TelaRelatorio({ f, paginaPedida, relatorio }: { f: FiltrosRelatorioAuditoria; paginaPedida: number; relatorio: RelatorioAuditoriaCompleto }) {
  const totalPaginas = relatorio.paginas.length;
  const pagina = Math.min(paginaPedida, Math.max(1, totalPaginas));
  const linhas = relatorio.paginas[pagina - 1] ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted-foreground">
          {CABECALHO_AUDITORIA.titulo} · {CABECALHO_AUDITORIA.periodo} {f.dtIni} {CABECALHO_AUDITORIA.ate} {f.dtFim}
        </p>
        <Button asChild variant="outline" className="print:hidden">
          <Link href={hrefRelatorio(f, { impressao: true })}>Versão para impressão</Link>
        </Button>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{MENSAGENS_RELATORIO_AUDITORIA.vazio}</div>
      ) : (
        <div className="rounded-lg border bg-card">
          <TabelaAuditoria linhas={linhas} saida={relatorio.saida} rotulo="Relatório de auditoria" />
        </div>
      )}

      {totalPaginas > 0 ? (
        <nav aria-label="Paginação" className="print:hidden flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {relatorio.resumo.exibidos} evento{relatorio.resumo.exibidos === 1 ? "" : "s"} · página {pagina} de {totalPaginas}
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

      <ResumoAuditoriaBloco resumo={relatorio.resumo} />
    </>
  );
}
