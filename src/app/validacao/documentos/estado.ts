/** Resultado de la validación VALDOCS mostrado en el panel. */
export type EstadoValidacaoDocumentos =
  | { ok: true; resultado: "V" | "I"; erros: string[]; docEspecial: boolean }
  | { ok: false; mensagem: string }
  | null;
