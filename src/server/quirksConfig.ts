import { detalheErroQuirks, lerQuirks, type Quirks } from "@/domain/quirks";

// Lectura de los flags LEGACY-QUIRK en la capa de servidor (una vez por solicitud).
// Configuración inválida → se registra el motivo sin datos personales y quien llama
// responde con el mensaje genérico (patrón de src/app/validacao/documentos/actions.ts).

/** Mensaje genérico al usuario (configuración inválida o error inesperado): fuente única en `@/lib/falhas`. */
export { ERRO_INESPERADO } from "@/lib/falhas";

/** Flags LEGACY-QUIRK del entorno o `null` si la configuración es inválida (ya registrado). */
export function lerQuirksServidor(contexto: string): Quirks | null {
  try {
    return lerQuirks();
  } catch (e) {
    // El detalle solo nombra la variable y el valor de configuración (sin datos personales).
    console.error(`[${contexto}] ${detalheErroQuirks(e)}`);
    return null;
  }
}
