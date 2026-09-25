import type { DadosValbenef } from "@/domain/beneficiario/validacao";

/** Resultado de la validación VALBENEF mostrado en el panel. */
export type EstadoValidacao =
  | { ok: true; resultado: "V" | "I"; erros: string[] }
  | { ok: false; mensagem: string }
  | null;

/** Respuesta de "Carregar do cadastro". */
export type EstadoCarga = { ok: true; dados: DadosValbenef } | { ok: false; mensagem: string };
