import type { Metadata } from "next";
import { FormDescontos } from "./_componentes/FormDescontos";

export const metadata: Metadata = { title: "Cálculo de descontos" };

/** Pantalla 4.14 — Cálculo de descontos (CALCDSCT): recalcula os descontos de um pagamento. */
export default function DescontosPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cálculo de descontos</h1>
        <p className="text-sm text-muted-foreground">
          Recalcula os descontos de um pagamento a partir dos descontos registrados do beneficiário.
        </p>
      </div>
      <FormDescontos />
    </div>
  );
}
