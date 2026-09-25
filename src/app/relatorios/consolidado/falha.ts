import { detalheErroQuirks } from "@/domain/quirks";
import { ERRO_INESPERADO } from "@/lib/falhas";

// Configuración inválida en el informe consolidado (solo lectura). Los errores
// inesperados usan `falhaInesperada` de `@/lib/falhas`.

/** Configuración LEGACY-QUIRK inválida: se registra el motivo (sin datos personales) y se muestra el mensaje genérico. */
export function falhaConfiguracao(e: unknown): { ok: false; mensagem: string } {
  console.error(`[relatorio-consolidado] ${detalheErroQuirks(e)}`);
  return { ok: false, mensagem: ERRO_INESPERADO };
}
