import { ERRO_INESPERADO, falhaInesperada as falhaInesperadaCompartilhada } from "@/lib/falhas";

// Error inesperado en las pantallas de consulta de pagos (solo lectura).

export { ERRO_INESPERADO };

/** Falha inesperada de `pagamentos`: só nome e código do erro no log (NFR-04, LGPD). */
export function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  return falhaInesperadaCompartilhada("pagamentos", contexto, e);
}
