import type { Metadata } from "next";
import { Competencia, ResultadoLegado } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { formatarCompetencia } from "@/domain/legacyDate";
import { CABECALHO_CONSOLIDADO, lerFiltroConsolidado, MENSAGEM_COMPETENCIA_INVALIDA } from "@/domain/relatorios/consolidado";
import { relatorioConsolidado } from "@/server/relatorioConsolidado";
import { BotaoImprimir } from "./_componentes/BotaoImprimir";
import { TabelasConsolidado } from "./_componentes/TabelasConsolidado";
import { falhaInesperada } from "./falha";

export const metadata: Metadata = { title: "Relatório consolidado" };

type SearchParams = Record<string, string | string[] | undefined>;

async function carregar(competencia: number) {
  try {
    return { ok: true as const, relatorio: await relatorioConsolidado(competencia) };
  } catch (e) {
    return falhaInesperada("consolidado", e);
  }
}

/** Pantalla 4.19 — relatório consolidado mensal (BATCHREL). Solo lectura. */
export default async function RelatorioConsolidadoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { competencia } = lerFiltroConsolidado(await searchParams);
  // null = parámetro presente pero inválido; 0 = ausente (informe no solicitado).
  const invalida = competencia === null;
  const r = competencia ? await carregar(competencia) : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Relatório consolidado</h1>
        <p className="text-sm text-muted-foreground">Totais mensais por região, por situação e gerais. Somente leitura.</p>
      </div>

      {/* Consulta (GET): solo lee, no escribe nada. */}
      <form
        role="search"
        method="get"
        action="/relatorios/consolidado"
        aria-label="Filtro do relatório consolidado"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 print:hidden"
      >
        <Competencia
          key={String(competencia)}
          name="competencia"
          label="Competência"
          required
          defaultValue={competencia || undefined}
          erro={invalida ? MENSAGEM_COMPETENCIA_INVALIDA : undefined}
        />
        <Button type="submit">Gerar relatório</Button>
        {r?.ok ? <BotaoImprimir /> : null}
      </form>

      {invalida ? null : !r ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground print:hidden">
          Informe a competência para gerar o relatório.
        </div>
      ) : !r.ok ? (
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]} />
      ) : (
        <>
          {/* Cabecera literal del legado (BATCHREL:203–207), solo en la versión imprimible. */}
          <div data-testid="cabecalho-impressao" className="hidden font-mono text-sm print:block">
            <p>
              {CABECALHO_CONSOLIDADO.titulo} {CABECALHO_CONSOLIDADO.pagina} 1
            </p>
            <p>
              {CABECALHO_CONSOLIDADO.competencia} {r.relatorio.competencia} {CABECALHO_CONSOLIDADO.data} {r.relatorio.dataEmissao}
            </p>
            <p>{"-".repeat(60)}</p>
          </div>
          <p className="text-sm text-muted-foreground print:hidden">
            Competência <strong className="valor">{formatarCompetencia(r.relatorio.competencia)}</strong>
          </p>
          <TabelasConsolidado r={r.relatorio} />
        </>
      )}
    </div>
  );
}
