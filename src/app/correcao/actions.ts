"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { corrigirPagamentos } from "@/server/correcao";
import type { CampoCorrecao, EstadoCorrecao } from "./estado";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";

// Server Action de /correcao (CALCCORR). Valida la forma de la entrada con zod;
// las reglas (período, índice, aplicación) están en el dominio.

const RE_COMPETENCIA = /^\d{4}(0[1-9]|1[0-2])$/;

const entradaCorrecaoSchema = z.object({
  numCpf: z.string().regex(/^\d{11}$/, "Informe o CPF do beneficiário (11 dígitos)."),
  compIni: z.string().regex(RE_COMPETENCIA, "Informe a competência inicial (mês/ano).").transform(Number),
  compFim: z.string().regex(RE_COMPETENCIA, "Informe a competência final (mês/ano).").transform(Number),
});

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

const CAMPOS: readonly CampoCorrecao[] = ["numCpf", "compIni", "compFim"];

export async function corrigirPagamentosAction(_anterior: EstadoCorrecao, dados: FormData): Promise<EstadoCorrecao> {
  const parsed = entradaCorrecaoSchema.safeParse({
    numCpf: texto(dados, "numCpf"),
    compIni: texto(dados, "compIni"),
    compFim: texto(dados, "compFim"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = CAMPOS.find((c) => c === issue?.path[0]);
    return { ok: false, mensagem: issue?.message ?? ERRO_INESPERADO, campo };
  }
  // D9/D22: la configuración de correcciones se lee una vez por solicitud.
  // Configuración inválida → ya registrada (sin datos personales); mensaje genérico.
  const quirks = lerQuirksServidor("correcao");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    const r = await corrigirPagamentos(parsed.data.numCpf, parsed.data.compIni, parsed.data.compFim, { quirks });
    if (r.ok && r.qtdRegistros > 0) {
      // La consulta y el detalle de pagos muestran la corrección.
      revalidatePath("/pagamentos");
      for (const p of r.corrigidos) revalidatePath(`/pagamentos/${p.numPagamento}`);
    }
    return r;
  } catch (e) {
    return falhaInesperada("correcao", "correção retroativa", e);
  }
}
