import type { ResumoCalculo } from "@/server/calculo";

/** Resultado del cálculo individual mostrado debajo del formulario. */
export type EstadoCalculo = { ok: true; mensagem: string; resumo: ResumoCalculo } | { ok: false; mensagem: string } | null;
