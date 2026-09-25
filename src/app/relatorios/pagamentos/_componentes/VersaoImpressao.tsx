import { MENSAGENS_RELATORIO_PAGAMENTOS, TITULO_RELATORIO_PAGAMENTOS, type LinhaRelatorio, type TotalGeral } from "@/domain/relatorios/pagamentos";
import { TabelaRelatorio, TotalGeralRelatorio } from "./TabelaRelatorio";

// Estilos de impresión propios de este informe: cada hoja legada (66 líneas) empieza en
// una página nueva. La barra lateral y la cabecera del layout ya llevan `print:hidden`.
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  .folha-relatorio { break-after: page; border: 0 !important; }
  .folha-relatorio:last-of-type { break-after: auto; }
}
`;

/** Cabecera literal de IMPRIME-CABECALHO (RELPGT:188–199). */
function Cabecalho({ pagina, compIni, compFim, data }: { pagina: number; compIni: number; compFim: number; data: number }) {
  return (
    <header data-testid="cabecalho-relatorio" className="grid gap-0.5 border-b pb-2 font-mono text-xs">
      <p className="flex justify-between gap-4">
        <span>{TITULO_RELATORIO_PAGAMENTOS}</span>
        <span>PAG: {pagina}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span>
          PERIODO: {compIni} A {compFim}
        </span>
        <span>DATA: {data}</span>
      </p>
    </header>
  );
}

/** Versión imprimible: todas las páginas legadas con su cabecera y el total general. */
export function VersaoImpressao({
  paginas,
  total,
  compIni,
  compFim,
  data,
}: {
  paginas: readonly (readonly LinhaRelatorio[])[];
  total: TotalGeral;
  compIni: number;
  compFim: number;
  data: number;
}) {
  return (
    <div data-testid="versao-impressao" className="grid gap-4">
      <style>{CSS_IMPRESSAO}</style>
      {paginas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{MENSAGENS_RELATORIO_PAGAMENTOS.vazio}</div>
      ) : null}
      {paginas.map((linhas, i) => (
        <section key={i} className="folha-relatorio grid gap-2 rounded-lg border bg-card p-4" aria-label={`Página ${i + 1}`}>
          <Cabecalho pagina={i + 1} compIni={compIni} compFim={compFim} data={data} />
          <TabelaRelatorio linhas={linhas} rotulo={`Relatório de pagamentos — página ${i + 1}`} />
        </section>
      ))}
      <TotalGeralRelatorio total={total} />
    </div>
  );
}
