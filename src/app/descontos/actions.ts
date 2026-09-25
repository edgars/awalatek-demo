"use server";

import { z } from "zod";
import { recalcularDescontos } from "@/server/descontos";
import type { CampoDescontos, EstadoDescontos } from "./estado";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";

// Server Action de /descontos (CALCDSCT). Valida la forma de la entrada con zod;
// las reglas (FR-DSC-01 y el cálculo) están en el dominio.

const MSG_NUM_PAGAMENTO = "Informe o número do pagamento.";

const entradaDescontosSchema = z.object({
  numCpf: z.string().regex(/^\d{11}$/, "Informe o CPF do beneficiário (11 dígitos)."),
  // NUM-PGTO (N10); en la base nueva es Int (máx. 2.147.483.647).
  numPagamento: z
    .string()
    .regex(/^\d{1,10}$/, MSG_NUM_PAGAMENTO)
    .transform(Number)
    .refine((n) => n >= 1 && n <= 2_147_483_647, MSG_NUM_PAGAMENTO),
});

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function recalcularDescontosAction(_anterior: EstadoDescontos, dados: FormData): Promise<EstadoDescontos> {
  const parsed = entradaDescontosSchema.safeParse({ numCpf: texto(dados, "numCpf"), numPagamento: texto(dados, "numPagamento") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = issue?.path[0] === "numCpf" || issue?.path[0] === "numPagamento" ? (issue.path[0] as CampoDescontos) : undefined;
    return { ok: false, mensagem: issue?.message ?? ERRO_INESPERADO, campo };
  }
  // D13: la configuración de correcciones se lee una vez por solicitud.
  // Configuración inválida → ya registrada (sin datos personales); mensaje genérico.
  const quirks = lerQuirksServidor("descontos");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return await recalcularDescontos(parsed.data.numCpf, parsed.data.numPagamento, { quirks });
  } catch (e) {
    return falhaInesperada("descontos", "recálculo de descontos", e);
  }
}
