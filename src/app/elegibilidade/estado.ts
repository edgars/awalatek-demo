import type { ResultadoElegibilidade } from "@/domain/elegibilidade";

/** Resultado de VALELEG mostrado en el panel. */
export type EstadoElegibilidade = { ok: true; resultado: ResultadoElegibilidade } | { ok: false; mensagem: string } | null;
