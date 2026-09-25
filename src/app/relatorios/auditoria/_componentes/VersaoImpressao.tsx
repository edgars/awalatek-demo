import {
  CABECALHO_AUDITORIA,
  COLUNAS_CABECALHO_AUDITORIA,
  MENSAGENS_RELATORIO_AUDITORIA,
  type LinhaAuditoria,
  type ResumoAuditoria,
  type SaidaAuditoria,
} from "@/domain/relatorios/auditoria";
import { ResumoAuditoriaBloco, TabelaAuditoria } from "./TabelaAuditoria";

// Cada hoja legada (66 líneas) empieza en una página nueva. La barra lateral y la
// cabecera del layout ya llevan `print:hidden`.
const CSS_IMPRESSAO = `
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  .folha-relatorio { break-after: page; border: 0 !important; }
  .folha-relatorio:last-of-type { break-after: auto; }
}
`;

/** Cabecera literal de IMPRIME-CAB-AUDIT (RELAUDIT:208–232): T con 100 guiones, I con 120. */
function Cabecalho({ pagina, dtIni, dtFim, data, saida }: { pagina: number; dtIni: number; dtFim: number; data: number; saida: SaidaAuditoria }) {
  const C = CABECALHO_AUDITORIA;
  const col = COLUNAS_CABECALHO_AUDITORIA[saida];
  return (
    <header data-testid="cabecalho-relatorio" className="grid gap-0.5 border-b pb-2 font-mono text-xs">
      <p className="flex justify-between gap-4">
        <span>{C.titulo}</span>
        <span>
          {C.pagina} {pagina}
        </span>
      </p>
      <p className="flex justify-between gap-4">
        <span>
          {C.periodo} {dtIni} {C.ate} {dtFim}
        </span>
        <span>
          {C.data} {data}
        </span>
      </p>
      <p aria-hidden="true" className="overflow-hidden whitespace-pre">
        {"-".repeat(col.guioes)}
      </p>
      <p aria-hidden="true" data-testid="colunas-cabecalho" className="overflow-hidden whitespace-pre">
        {col.colunas}
      </p>
    </header>
  );
}

/** Versión imprimible: todas las hojas legadas con su cabecera y el resumen. */
export function VersaoImpressao({
  paginas,
  resumo,
  saida,
  dtIni,
  dtFim,
  data,
}: {
  paginas: readonly (readonly LinhaAuditoria[])[];
  resumo: ResumoAuditoria;
  saida: SaidaAuditoria;
  dtIni: number;
  dtFim: number;
  data: number;
}) {
  return (
    <div data-testid="versao-impressao" className="grid gap-4">
      <style>{CSS_IMPRESSAO}</style>
      {paginas.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">{MENSAGENS_RELATORIO_AUDITORIA.vazio}</div>
      ) : null}
      {paginas.map((linhas, i) => (
        <section key={i} className="folha-relatorio grid gap-2 rounded-lg border bg-card p-4" aria-label={`Página ${i + 1}`}>
          <Cabecalho pagina={i + 1} dtIni={dtIni} dtFim={dtFim} data={data} saida={saida} />
          <TabelaAuditoria linhas={linhas} saida={saida} rotulo={`Relatório de auditoria — página ${i + 1}`} />
        </section>
      ))}
      <ResumoAuditoriaBloco resumo={resumo} />
    </div>
  );
}
