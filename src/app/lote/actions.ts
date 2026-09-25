"use server";

import { ejecutarLotePagamentos } from "@/server/lotePagamentos";
import type { EstadoLote } from "./estado";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { ERRO_INESPERADO, registrarFalha } from "@/lib/falhas";

// Server Action de /lote (BATCHPGT). Sem entrada: a competência é a da data de
// execução (FR-LOT-01). As regras estão no domínio; aqui só se trata o erro inesperado.

export async function executarLoteAction(): Promise<EstadoLote> {
  // D8/D17: la configuración se lee una vez por corrida; el lote usa el mismo motor
  // y la misma configuración que el cálculo individual.
  // Configuración inválida → ya registrada (sin datos personales); mensaje genérico.
  const quirks = lerQuirksServidor("lote");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return await ejecutarLotePagamentos({ quirks });
  } catch (e) {
    registrarFalha("lote", "lote mensal", e);
    return { ok: false, mensagem: ERRO_INESPERADO };
  }
}
