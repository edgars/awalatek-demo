import { z } from "zod";

// Flags LEGACY-QUIRK tipados. Un valor inválido es un error de configuración
// (se lanza, no se asume un default silencioso).
//
// Dos familias (docs/prd.md §5):
// - Réplica del legado OPT-IN (default = comportamiento corregido): D4 y D18.
// - Corrección OPT-IN (default = réplica del legado): la lista SIFAP_QUIRKS_CORRIGIDOS,
//   p. ej. "D5,D17,D23" o "ALL". Vacía/ausente → todo igual al legado (paridad).
// D1–D3 quedan fuera de alcance; D14/D15 son decisiones de modelo, no comportamientos.

/** Quirks cuya corrección puede activarse por SIFAP_QUIRKS_CORRIGIDOS. */
export const QUIRKS_CORRIGIVEIS = [
  "D4b",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "D16",
  "D17",
  "D19",
  "D20",
  "D21",
  "D22",
  "D23",
] as const;

export type QuirkCorrigivel = (typeof QUIRKS_CORRIGIVEIS)[number];

const flagBooleana = z
  .enum(["true", "false"], { error: "deve ser 'true' ou 'false'" })
  .optional()
  .transform((v) => v === "true");

const listaCorrigidos = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const itens = (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (itens.length === 1 && itens[0]?.toUpperCase() === "ALL") return new Set<QuirkCorrigivel>(QUIRKS_CORRIGIVEIS);
    const validos = new Set<QuirkCorrigivel>();
    for (const item of itens) {
      const id = QUIRKS_CORRIGIVEIS.find((q) => q.toUpperCase() === item.toUpperCase());
      if (!id) {
        ctx.addIssue({
          code: "custom",
          message: `quirk desconhecido ou não corrigível: '${item}' (válidos: ${QUIRKS_CORRIGIVEIS.join(", ")} ou ALL)`,
        });
        return z.NEVER;
      }
      validos.add(id);
    }
    return validos;
  });

const esquemaQuirks = z.object({
  // LEGACY-QUIRK(D4): bypass de validación de documentos por prefijo de CPF.
  // Default false; activarlo requiere aprobación de negocio/seguridad.
  LEGACY_DOC_ESPECIAL_ENABLED: flagBooleana,
  // LEGACY-QUIRK(D18): CADBENEF grababa el status en blanco en la alteración.
  // Default false: se sigue el PRD (FR-BEN-01, status editable).
  LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED: flagBooleana,
  // Lista de quirks corregidos (default: ninguno → paridad con el legado).
  SIFAP_QUIRKS_CORRIGIDOS: listaCorrigidos,
});

export type Quirks = {
  docEspecialHabilitado: boolean;
  statusBrancoAlteracao: boolean;
  corrigidos: ReadonlySet<QuirkCorrigivel>;
};

/** Configuración por defecto (paridad con el legado; D4 y D18 como hoy). */
export const QUIRKS_PADRAO: Quirks = Object.freeze({
  docEspecialHabilitado: false,
  statusBrancoAlteracao: false,
  corrigidos: new Set<QuirkCorrigivel>(),
});

/** Lee y valida los flags LEGACY-QUIRK del entorno. Variable vacía = ausente. */
export function lerQuirks(env: Record<string, string | undefined> = process.env): Quirks {
  const bruto = {
    LEGACY_DOC_ESPECIAL_ENABLED: env.LEGACY_DOC_ESPECIAL_ENABLED?.trim() || undefined,
    LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED: env.LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED?.trim() || undefined,
    SIFAP_QUIRKS_CORRIGIDOS: env.SIFAP_QUIRKS_CORRIGIDOS?.trim() || undefined,
  };
  const r = esquemaQuirks.safeParse(bruto);
  if (!r.success) {
    const detalhe = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`configuração LEGACY-QUIRK inválida — ${detalhe}`);
  }
  return {
    docEspecialHabilitado: r.data.LEGACY_DOC_ESPECIAL_ENABLED,
    statusBrancoAlteracao: r.data.LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED,
    corrigidos: r.data.SIFAP_QUIRKS_CORRIGIDOS,
  };
}

/** true si la corrección del quirk está activa (false = réplica del legado). */
export function corrige(quirks: Pick<Quirks, "corrigidos">, id: QuirkCorrigivel): boolean {
  return quirks.corrigidos.has(id);
}
