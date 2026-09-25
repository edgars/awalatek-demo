import type { PagamentoCorrigido } from "@/server/correcao";

/** Resultado de la corrección retroactiva mostrado debajo del formulario. */
export type EstadoCorrecao =
  | { ok: true; mensagem: string; qtdRegistros: number; vlrTotal: number; corrigidos: PagamentoCorrigido[] }
  /** `campo`: control rechazado por la validación de forma (zod), para mostrar el error junto a él. */
  | { ok: false; mensagem: string; campo?: CampoCorrecao }
  | null;

export type CampoCorrecao = "numCpf" | "compIni" | "compFim";
