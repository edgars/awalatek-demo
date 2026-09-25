import Link from "next/link";
import { Competencia } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { FiltrosTelaRelatorioPagamentos } from "@/domain/relatorios/pagamentos";

export type OpcaoPrograma = { codPrograma: string; nomePrograma: string };

/** Filtros de RELPGT (FR-REL-01). Formulario GET: solo consulta, no escribe nada. */
export function Filtros({ f, programas }: { f: FiltrosTelaRelatorioPagamentos; programas: readonly OpcaoPrograma[] }) {
  return (
    <form
      role="search"
      method="get"
      action="/relatorios/pagamentos"
      aria-label="Filtros do relatório"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end print:hidden"
    >
      <Competencia name="compIni" id="filtro-comp-ini" label="Competência inicial" defaultValue={f.compIni || undefined} required />
      <Competencia name="compFim" id="filtro-comp-fim" label="Competência final" defaultValue={f.compFim || undefined} required />
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
      <div className="flex gap-2">
        <Button type="submit">Gerar relatório</Button>
        <Button asChild variant="ghost">
          <Link href="/relatorios/pagamentos">Limpar</Link>
        </Button>
      </div>
    </form>
  );
}
