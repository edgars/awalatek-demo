"use client";

import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión del navegador (solo lectura). */
export function BotaoImprimir() {
  return (
    <Button type="button" onClick={() => window.print()}>
      Imprimir
    </Button>
  );
}
