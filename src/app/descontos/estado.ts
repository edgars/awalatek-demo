import type { ResumoDescontos } from "@/server/descontos";

/** Resultado del recálculo de descuentos mostrado debajo del formulario. */
export type EstadoDescontos =
  | { ok: true; mensagem: string; resumo: ResumoDescontos }
  /** `campo`: control rechazado por la validación de forma (zod), para mostrar el error junto a él. */
  | { ok: false; mensagem: string; campo?: CampoDescontos }
  | null;

export type CampoDescontos = "numCpf" | "numPagamento";
