"use server";

import { entradaElegibilidadeSchema } from "@/domain/elegibilidade";
import { resolverCpfPorChave } from "@/server/beneficiarios";
import { verificarElegibilidade } from "@/server/elegibilidade";
import { lerQuirksServidor } from "@/server/quirksConfig";
import type { EstadoElegibilidade } from "./estado";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";

// Server Action de /elegibilidade (VALELEG). Solo lee: VALELEG no graba ni audita,
// así que aquí no hay escrituras ni registrarEvento.

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

export async function verificarElegibilidadeAction(_anterior: EstadoElegibilidade, dados: FormData): Promise<EstadoElegibilidade> {
  // H2 (LGPD): chegando pelo atalho `?benef=`, o formulário leva a chave opaca (campo oculto)
  // e o campo CPF vazio; um CPF digitado prevalece. Chave inexistente → CPF vazio → o domínio
  // responde BENEFICIARIO NAO ENCONTRADO; falha da base → mensagem genérica.
  let numCpf = texto(dados, "numCpf");
  const benef = texto(dados, "benef");
  if (!numCpf.replace(/\D/g, "") && benef) {
    const resolvido = await resolverCpfPorChave(benef, "elegibilidade (chave)");
    if (!resolvido.ok) return { ok: false, mensagem: ERRO_INESPERADO };
    numCpf = resolvido.valor ?? "";
  }
  const parsed = entradaElegibilidadeSchema.safeParse({
    numCpf,
    codPrograma: texto(dados, "codPrograma"),
  });
  if (!parsed.success) return { ok: false, mensagem: parsed.error.issues[0]?.message ?? ERRO_INESPERADO };
  // D12: la configuración se lee una vez por solicitud y se inyecta en el caso de uso.
  const quirks = lerQuirksServidor("elegibilidade");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return { ok: true, resultado: await verificarElegibilidade(parsed.data.numCpf, parsed.data.codPrograma, undefined, undefined, quirks) };
  } catch (e) {
    return falhaInesperada("elegibilidade", "verificação", e);
  }
}
