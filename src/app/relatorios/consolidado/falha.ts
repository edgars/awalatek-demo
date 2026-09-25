import { ERRO_INESPERADO, falhaInesperada as falhaInesperadaCompartilhada } from "@/lib/falhas";
import { detalheErroQuirks } from "@/domain/quirks";

// Error inesperado en el informe consolidado (solo lectura).

export { ERRO_INESPERADO };

/** Falha inesperada de `relatorio-consolidado`: só nome e código do erro no log (NFR-04, LGPD). */
export function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  return falhaInesperadaCompartilhada("relatorio-consolidado", contexto, e);
}

/** Configuración LEGACY-QUIRK inválida: se registra el motivo (sin datos personales) y se muestra el mensaje genérico. */
export function falhaConfiguracao(e: unknown): { ok: false; mensagem: string } {
  console.error(`[relatorio-consolidado] ${detalheErroQuirks(e)}`);
  return { ok: false, mensagem: ERRO_INESPERADO };
}
