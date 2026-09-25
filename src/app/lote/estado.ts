import type { ResumoLote } from "@/domain/calculo/lote";

/**
 * Resultado do lote mostrado debaixo do botão. `ok: false` com `resumo`: lote
 * interrompido por erro inesperado (resumo parcial).
 */
export type EstadoLote = { ok: true; resumo: ResumoLote } | { ok: false; mensagem: string; resumo?: ResumoLote } | null;
