import type { ResumoLote } from "@/domain/calculo/lote";

/** Resultado do lote mostrado debaixo do botão. */
export type EstadoLote = { ok: true; resumo: ResumoLote } | { ok: false; mensagem: string } | null;
