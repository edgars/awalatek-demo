"use client";

import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión del navegador (versión imprimible vía `@media print`). */
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Versão para impressão
    </Button>
  );
}
