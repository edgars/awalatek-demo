"use server";

import { ejecutarLotePagamentos } from "@/server/lotePagamentos";
import type { EstadoLote } from "./estado";

// Server Action de /lote (BATCHPGT). Sem entrada: a competência é a da data de
// execução (FR-LOT-01). As regras estão no domínio; aqui só se trata o erro inesperado.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

export async function executarLoteAction(): Promise<EstadoLote> {
  try {
    return await ejecutarLotePagamentos();
  } catch (e) {
    // Solo tipo y código: nada de datos personales en el log (NFR-04).
    const nome = e instanceof Error ? e.name : "erro desconhecido";
    const codigo = (e as { code?: unknown } | null)?.code;
    console.error("[lote] lote mensal:", nome, typeof codigo === "string" ? codigo : "");
    return { ok: false, mensagem: ERRO_INESPERADO };
  }
}
