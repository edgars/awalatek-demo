import type { Metadata } from "next";
import { FormConciliacao } from "./_componentes/FormConciliacao";

export const metadata: Metadata = { title: "Conciliação bancária" };

/** Pantalla 4.17 — Conciliação bancária (BATCHCON): retorno CNAB 240 do Banco do Brasil. */
export default function ConciliacaoPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conciliação bancária</h1>
        <p className="text-sm text-muted-foreground">
          Concilia o arquivo de retorno CNAB 240 do Banco do Brasil com os pagamentos da competência: atualiza a situação dos
          pagamentos e registra a auditoria.
        </p>
      </div>
      <FormConciliacao />
    </div>
  );
}
