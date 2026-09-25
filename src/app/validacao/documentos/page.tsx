import type { Metadata } from "next";
import { FormValidacaoDocumentos } from "./_componentes/FormValidacaoDocumentos";

export const metadata: Metadata = { title: "Validação de documentos" };

/** Pantalla 4.10 — Validação de documentos (VALDOCS): CPF e RG, até 5 erros. */
export default function ValidacaoDocumentosPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Validação de documentos</h1>
        <p className="text-sm text-muted-foreground">
          Valida CPF e RG do beneficiário e lista os erros encontrados. Nada é gravado.
        </p>
      </div>
      <FormValidacaoDocumentos />
    </div>
  );
}
