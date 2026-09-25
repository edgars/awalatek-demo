"use server";

import { entradaElegibilidadeSchema } from "@/domain/elegibilidade";
import { verificarElegibilidade } from "@/server/elegibilidade";
import { lerQuirksServidor } from "@/server/quirksConfig";
import type { EstadoElegibilidade } from "./estado";

// Server Action de /elegibilidade (VALELEG). Solo lee: VALELEG no graba ni audita,
// así que aquí no hay escrituras ni registrarEvento.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error(`[elegibilidade] ${contexto}:`, nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
}

export async function verificarElegibilidadeAction(_anterior: EstadoElegibilidade, dados: FormData): Promise<EstadoElegibilidade> {
  const parsed = entradaElegibilidadeSchema.safeParse({
    numCpf: texto(dados, "numCpf"),
    codPrograma: texto(dados, "codPrograma"),
  });
  if (!parsed.success) return { ok: false, mensagem: parsed.error.issues[0]?.message ?? ERRO_INESPERADO };
  // D12: la configuración se lee una vez por solicitud y se inyecta en el caso de uso.
  const quirks = lerQuirksServidor("elegibilidade");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return { ok: true, resultado: await verificarElegibilidade(parsed.data.numCpf, parsed.data.codPrograma, undefined, undefined, quirks) };
  } catch (e) {
    return falhaInesperada("verificação", e);
  }
}
