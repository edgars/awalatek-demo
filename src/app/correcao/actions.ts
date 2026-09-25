"use server";

import { z } from "zod";
import { corrigirPagamentos } from "@/server/correcao";
import type { CampoCorrecao, EstadoCorrecao } from "./estado";

// Server Action de /correcao (CALCCORR). Valida la forma de la entrada con zod;
// las reglas (período, índice, aplicación) están en el dominio.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";
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

function falhaInesperada(e: unknown): { ok: false; mensagem: string } {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[correcao] correção retroativa:", nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
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
  try {
    return await corrigirPagamentos(parsed.data.numCpf, parsed.data.compIni, parsed.data.compFim);
  } catch (e) {
    return falhaInesperada(e);
  }
}
