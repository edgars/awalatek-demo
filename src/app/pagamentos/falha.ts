// Error inesperado en las pantallas de consulta de pagos (solo lectura).

export const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

/**
 * Registra solo el tipo y el código del error: el mensaje de Prisma incluye los
 * argumentos de la consulta (CPF) y no puede ir al log (NFR-04).
 */
export function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error(`[pagamentos] ${contexto}:`, nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
}
