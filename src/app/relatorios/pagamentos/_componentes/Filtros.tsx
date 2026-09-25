import Link from "next/link";
import { Competencia } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { FiltrosTelaRelatorioPagamentos } from "@/domain/relatorios/pagamentos";

export type OpcaoPrograma = { codPrograma: string; nomePrograma: string };
export type ErrosFiltros = { compIni?: string; compFim?: string; programa?: string };

/** Filtros de RELPGT (FR-REL-01). Formulario GET: solo consulta, no escribe nada. */
export function Filtros({ f, erros, programas }: { f: FiltrosTelaRelatorioPagamentos; erros: ErrosFiltros; programas: readonly OpcaoPrograma[] }) {
  // Programa válido del filtro que no está en la lista (código desconocido o lista que no
  // cargó): se ofrece como opción extra para que el select refleje el filtro vigente.
  const programaForaDaLista = f.programa && !programas.some((p) => p.codPrograma === f.programa) ? f.programa : null;
  return (
    <form
      // Remonta con cada cambio de filtros: "Limpar" (navegación cliente) no conserva el
      // estado interno de Competencia ni el defaultValue del select.
      key={`${f.compIni}|${f.compFim}|${f.programa}`}
      role="search"
      method="get"
      action="/relatorios/pagamentos"
      aria-label="Filtros do relatório"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-start print:hidden"
    >
      <Competencia name="compIni" id="filtro-comp-ini" label="Competência inicial" defaultValue={f.compIni || undefined} erro={erros.compIni} required />
      <Competencia name="compFim" id="filtro-comp-fim" label="Competência final" defaultValue={f.compFim || undefined} erro={erros.compFim} required />
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-programa">Programa</Label>
        <Select
          id="filtro-programa"
          name="programa"
          defaultValue={f.programa ?? ""}
          aria-invalid={erros.programa ? true : undefined}
          aria-describedby={erros.programa ? "filtro-programa-erro" : undefined}
        >
          <option value="">Todos</option>
          {programas.map((p) => (
            <option key={p.codPrograma} value={p.codPrograma}>
              {p.codPrograma} – {p.nomePrograma}
            </option>
          ))}
          {programaForaDaLista ? <option value={programaForaDaLista}>{programaForaDaLista}</option> : null}
        </Select>
        {erros.programa ? (
          <p id="filtro-programa-erro" className="text-xs font-medium text-destructive">
            {erros.programa}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2 lg:self-end">
        <Button type="submit">Gerar relatório</Button>
        <Button asChild variant="ghost">
          <Link href="/relatorios/pagamentos">Limpar</Link>
        </Button>
      </div>
    </form>
  );
}
