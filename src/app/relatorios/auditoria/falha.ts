import { ERRO_INESPERADO, falhaInesperada as falhaInesperadaCompartilhada } from "@/lib/falhas";

// Error inesperado en el informe de auditoría (solo lectura).

export { ERRO_INESPERADO };

/** Falha inesperada de `relatorio-auditoria`: só nome e código do erro no log (NFR-04, LGPD). */
export function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  return falhaInesperadaCompartilhada("relatorio-auditoria", contexto, e);
}
