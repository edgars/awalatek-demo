import type { Metadata } from "next";
import { FormInclusao } from "../_componentes/FormInclusao";

export const metadata: Metadata = { title: "Novo programa" };

/** Pantalla 4.2 — inclusión de programa (operación I del legado). */
export default function NovoProgramaPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo programa</h1>
        <p className="text-sm text-muted-foreground">Cadastro de programas sociais — dados do programa.</p>
      </div>
      <FormInclusao />
    </div>
  );
}
