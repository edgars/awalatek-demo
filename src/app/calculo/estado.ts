import type { ResumoCalculo } from "@/server/calculo";

/** Resultado del cálculo individual mostrado debajo del formulario. */
export type EstadoCalculo =
  | { ok: true; mensagem: string; resumo: ResumoCalculo }
  /** `campo`: control rechazado por la validación de forma (zod), para mostrar el error junto a él. */
  | { ok: false; mensagem: string; campo?: CampoCalculo }
  | null;

export type CampoCalculo = "numCpf" | "competencia";
