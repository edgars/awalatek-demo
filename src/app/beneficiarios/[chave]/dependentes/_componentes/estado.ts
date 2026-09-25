/** Estado devuelto por la Server Action de dependientes al formulario. */
export type EstadoDependente = {
  ok: boolean;
  /** CADDEPEND escribe cada mensaje: puede haber más de uno (nombre y parentesco). */
  mensagens: string[];
  /** Error por campo (nombre del campo → mensaje), para mostrarlo junto al control. */
  erros?: Record<string, string>;
  /** Total de dependientes tras la inclusión. */
  total?: number;
} | null;
