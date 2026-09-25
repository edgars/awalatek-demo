/** Estado devuelto por las Server Actions de beneficiarios al formulario. */
export type EstadoAcao = {
  ok: boolean;
  /** Un solo mensaje (CADBENEF corta en el primer error). */
  mensagens: string[];
  /** Error por campo (nombre del campo → mensaje), para mostrarlo junto al control. */
  erros?: Record<string, string>;
  /** Clave opaca del beneficiario grabado (H2: los enlaces nunca llevan el CPF). */
  chavePublica?: string;
  status?: string;
  suspensoPorIdade?: boolean;
  numVersao?: number;
} | null;
