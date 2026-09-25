"use server";

import { z } from "zod";
import { calcularBeneficioIndividual } from "@/server/calculo";
import type { CampoCalculo, EstadoCalculo } from "./estado";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";

// Server Action de /calculo (CALCBENF). Valida la forma de la entrada con zod;
// las reglas (FR-CAL-01/02 y el cálculo) están en el dominio.

const entradaCalculoSchema = z.object({
  numCpf: z.string().regex(/^\d{11}$/, "Informe o CPF do beneficiário (11 dígitos)."),
  // AAAAMM; el mes (1–12) lo valida el dominio para devolver "COMPETENCIA INVALIDA".
  competencia: z
    .string()
    .regex(/^\d{6}$/, "Informe a competência (mês/ano).")
    .transform(Number),
});

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function calcularBeneficioAction(_anterior: EstadoCalculo, dados: FormData): Promise<EstadoCalculo> {
  const parsed = entradaCalculoSchema.safeParse({ numCpf: texto(dados, "numCpf"), competencia: texto(dados, "competencia") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = issue?.path[0] === "numCpf" || issue?.path[0] === "competencia" ? (issue.path[0] as CampoCalculo) : undefined;
    return { ok: false, mensagem: issue?.message ?? ERRO_INESPERADO, campo };
  }
  // D8/D17: la configuración de correcciones se lee una vez por solicitud y se inyecta en el motor.
  // Configuración inválida → ya registrada (sin datos personales); mensaje genérico.
  const quirks = lerQuirksServidor("calculo");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return await calcularBeneficioIndividual(parsed.data.numCpf, parsed.data.competencia, { quirks });
  } catch (e) {
    return falhaInesperada("calculo", "cálculo individual", e);
  }
}
