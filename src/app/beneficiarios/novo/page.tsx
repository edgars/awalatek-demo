import type { Metadata } from "next";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { incluirBeneficiarioAction } from "../actions";
import { FormBeneficiario } from "../_componentes/FormBeneficiario";

export const metadata: Metadata = { title: "Novo beneficiário" };

/** Pantalla 4.5 — inclusión de beneficiário (operación I do legado). */
export default async function NovoBeneficiarioPage() {
  const programas = await listarOpcoesProgramas();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo beneficiário</h1>
        <p className="text-sm text-muted-foreground">Cadastro de beneficiário — inclusão.</p>
      </div>
      <FormBeneficiario acao={incluirBeneficiarioAction} programas={programas} />
    </div>
  );
}
