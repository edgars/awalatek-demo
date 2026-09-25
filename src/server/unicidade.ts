// Reconocimiento de violaciones de unicidad (P2002) por campo y reintento común. Con el
// driver adapter los campos vienen en `meta.driverAdapterError.cause.constraint.fields`;
// sin él, en `meta.target` (lista de campos o nombre del índice, p. ej.
// "Auditoria_numAuditoria_key").

/** Campos (o nombre de índice) informados por un P2002; `null` si no es un P2002. */
export function camposViolados(e: unknown): string[] | null {
  const err = e as {
    code?: string;
    meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } } };
  } | null;
  if (err?.code !== "P2002") return null;
  const restricao = err.meta?.driverAdapterError?.cause?.constraint;
  return [err.meta?.target, restricao?.fields, restricao?.index].flat().filter((c): c is string => typeof c === "string");
}

/** true si `e` es un P2002 sobre `campo` (otro unique → false). */
export function violaUnico(e: unknown, campo: string): boolean {
  return (camposViolados(e) ?? []).some((c) => c === campo || c.includes(campo));
}

/** P2002 sobre `numAuditoria` (máx.+1 tomado por otro escritor); otro unique → false. */
export function ehColisaoNumAuditoria(e: unknown): boolean {
  return violaUnico(e, "numAuditoria");
}

/** P2002 sobre `numPagamento` (máx.+1 tomado por otro escritor); otro unique → false. */
export function ehColisaoNumPagamento(e: unknown): boolean {
  return violaUnico(e, "numPagamento");
}

/**
 * Ejecuta `fn` y la repite (hasta `tentativas` veces en total) mientras el error cumpla
 * `deveRepetir`, con una espera corta con jitter entre intentos. `antesDeRepetir` corre
 * antes de cada nuevo intento (p. ej. releer el máximo); si falla, su error sube.
 */
export async function comRetry<T>(
  fn: () => Promise<T>,
  deveRepetir: (e: unknown) => boolean,
  tentativas: number,
  antesDeRepetir?: () => Promise<void>,
): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn();
    } catch (e) {
      if (!deveRepetir(e) || tentativa >= tentativas) throw e;
    }
    await new Promise((r) => setTimeout(r, 2 * tentativa + Math.random() * 8));
    if (antesDeRepetir) await antesDeRepetir();
  }
}

/**
 * Columna única y nullable (`nis`, `cpfDependente`): vacío o en blanco se graba como
 * NULL, nunca "" (dos "" violarían el unique; varios NULL no). Los schemas zod ya lo
 * hacen; esto cubre a los llamadores directos del servidor.
 */
export function vazioParaNull(valor: string | null | undefined): string | null {
  return valor == null || valor.trim() === "" ? null : valor;
}
