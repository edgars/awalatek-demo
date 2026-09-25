"use server";

import { detalheErroQuirks, lerQuirks, type Quirks } from "@/domain/quirks";
import { ejecutarLotePagamentos } from "@/server/lotePagamentos";
import type { EstadoLote } from "./estado";

// Server Action de /lote (BATCHPGT). Sem entrada: a competência é a da data de
// execução (FR-LOT-01). As regras estão no domínio; aqui só se trata o erro inesperado.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

export async function executarLoteAction(): Promise<EstadoLote> {
  // D8/D17: la configuración se lee una vez por corrida; el lote usa el mismo motor
  // y la misma configuración que el cálculo individual.
  let quirks: Quirks;
  try {
    quirks = lerQuirks();
  } catch (e) {
    // Motivo sin datos personales para operaciones; al usuario, el mensaje genérico.
    console.error("[lote]", detalheErroQuirks(e));
    return { ok: false, mensagem: ERRO_INESPERADO };
  }
  try {
    return await ejecutarLotePagamentos({ quirks });
  } catch (e) {
    // Solo tipo y código: nada de datos personales en el log (NFR-04).
    const nome = e instanceof Error ? e.name : "erro desconhecido";
    const codigo = (e as { code?: unknown } | null)?.code;
    console.error("[lote] lote mensal:", nome, typeof codigo === "string" ? codigo : "");
    return { ok: false, mensagem: ERRO_INESPERADO };
  }
}
