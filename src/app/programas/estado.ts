/** Estado devuelto por las Server Actions de programas al formulario. */
export type EstadoAcao = {
  ok: boolean;
  /** Mensajes para el panel de resultado (literales del legado cuando existen). */
  mensagens: string[];
  /** Error por campo (nombre del campo → mensaje), para mostrarlo junto al control. */
  erros?: Record<string, string>;
  codPrograma?: string;
  /** Versión gravada tras una alteración/cambio de situación (control optimista). */
  numVersao?: number;
  /** Versión desactualizada: la pantalla ofrece "Recarregar". */
  conflito?: boolean;
} | null;
