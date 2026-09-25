import type { Metadata } from "next";
import { FormCorrecao } from "./_componentes/FormCorrecao";

export const metadata: Metadata = { title: "Correção retroativa" };

/** Pantalla 4.16 — Correção retroativa (CALCCORR): corrige os pagamentos pelo IPCA. */
export default function CorrecaoPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Correção retroativa</h1>
        <p className="text-sm text-muted-foreground">
          Corrige pelo IPCA os pagamentos do beneficiário no período informado. Pagamentos já corrigidos não são corrigidos
          de novo.
        </p>
      </div>
      <FormCorrecao />
    </div>
  );
}
