// Límite del archivo de retorno CNAB 240 subido en /conciliacao. Única fuente: lo usan
// la validación del cliente, la del servidor (zod), el texto de ayuda y el
// `serverActions.bodySizeLimit` de `next.config.ts` (sin alias `@/`: lo importa la config).

/** Tamaño máximo del archivo, en MB. */
export const LIMITE_ARQUIVO_MB = 5;
/** Tamaño máximo del archivo, en bytes. */
export const LIMITE_ARQUIVO_BYTES = LIMITE_ARQUIVO_MB * 1024 * 1024;
/** Margen para el overhead de multipart (boundaries, cabeceras y el campo competencia). */
export const MARGEM_MULTIPART_MB = 1;
/** Mensaje del campo cuando el archivo excede el límite. */
export const MSG_ARQUIVO_GRANDE = `O arquivo de retorno excede o limite de ${LIMITE_ARQUIVO_MB} MB.`;
/** Texto de ayuda del campo. */
export const DESCRICAO_ARQUIVO = `CNAB 240 (.ret ou .txt), até ${LIMITE_ARQUIVO_MB} MB.`;
