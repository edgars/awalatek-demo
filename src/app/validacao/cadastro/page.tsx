import type { Metadata } from "next";
import { FormValidacaoCadastro } from "./_componentes/FormValidacaoCadastro";

export const metadata: Metadata = { title: "Validação cadastral" };

/** Pantalla 4.9 — Validação cadastral (VALBENEF): acumula todos os erros. */
export default function ValidacaoCadastroPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Validação cadastral</h1>
        <p className="text-sm text-muted-foreground">
          Valida os dados cadastrais e lista todos os erros encontrados. Nada é gravado.
        </p>
      </div>
      <FormValidacaoCadastro />
    </div>
  );
}
