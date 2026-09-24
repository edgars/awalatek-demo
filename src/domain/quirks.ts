import { z } from "zod";

// Flags LEGACY-QUIRK tipados. Un valor distinto de "true"/"false" es un error
// de configuración (se lanza, no se asume un default silencioso).

const flagBooleana = z
  .enum(["true", "false"], { error: "deve ser 'true' ou 'false'" })
  .optional()
  .transform((v) => v === "true");

const esquemaQuirks = z.object({
  // LEGACY-QUIRK(D4): bypass de validación de documentos por prefijo de CPF.
  // Default false; activarlo requiere aprobación de negocio/seguridad (consumido en E2).
  LEGACY_DOC_ESPECIAL_ENABLED: flagBooleana,
});

export type Quirks = { docEspecialHabilitado: boolean };

/** Lee y valida los flags LEGACY-QUIRK del entorno. Variable vacía = ausente. */
export function lerQuirks(env: Record<string, string | undefined> = process.env): Quirks {
  const bruto = {
    LEGACY_DOC_ESPECIAL_ENABLED: env.LEGACY_DOC_ESPECIAL_ENABLED?.trim() || undefined,
  };
  const r = esquemaQuirks.safeParse(bruto);
  if (!r.success) {
    const detalhe = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`configuração LEGACY-QUIRK inválida — ${detalhe}`);
  }
  return { docEspecialHabilitado: r.data.LEGACY_DOC_ESPECIAL_ENABLED };
}
