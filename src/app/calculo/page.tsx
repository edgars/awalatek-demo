import type { Metadata } from "next";
import { FormCalculo } from "./_componentes/FormCalculo";

export const metadata: Metadata = { title: "Cálculo de benefício" };

/** Pantalla 4.12 — Cálculo de benefício (CALCBENF): calcula e grava o pagamento. */
export default function CalculoPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cálculo de benefício</h1>
        <p className="text-sm text-muted-foreground">
          Calcula o benefício do beneficiário na competência informada e gera o pagamento (situação G).
        </p>
      </div>
      <FormCalculo />
    </div>
  );
}
