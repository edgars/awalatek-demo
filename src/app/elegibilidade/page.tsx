import type { Metadata } from "next";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { FormElegibilidade } from "./_componentes/FormElegibilidade";

export const metadata: Metadata = { title: "Elegibilidade" };

function param(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** Pantalla 4.11 — Elegibilidade (VALELEG): CPF + programa → ELEGÍVEL / NÃO ELEGÍVEL. */
export default async function ElegibilidadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const programas = await listarOpcoesProgramas();
  // Atalho de /consulta: CPF (e programa) pré-preenchidos por query string.
  const cpf = param(sp.cpf).replace(/\D/g, "").slice(0, 11);
  const programa = param(sp.programa).trim().toUpperCase();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Elegibilidade</h1>
        <p className="text-sm text-muted-foreground">
          Verifica se o beneficiário é elegível para o programa e lista todos os motivos de recusa. Nada é gravado.
        </p>
      </div>
      <FormElegibilidade programas={programas} cpfInicial={cpf} programaInicial={programas.some((p) => p.codPrograma === programa) ? programa : ""} />
    </div>
  );
}
