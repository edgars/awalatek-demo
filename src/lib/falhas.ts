// Módulo único de falhas inesperadas (antes duplicado em cada Server Action, página e
// caso de uso). Sem dependências de servidor nem variáveis de ambiente: os componentes cliente
// importam `ERRO_INESPERADO` daqui. O usuário operativo está em `src/server/usuario.ts`.

/** Mensagem genérica ao usuário (configuração inválida ou erro inesperado). */
export const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

/**
 * Nome e código do erro — o único que pode ir ao log. A mensagem (p. ex. a do Prisma,
 * que inclui os argumentos da consulta: CPF, nome, NIS, renda) nunca é registrada (NFR-04, LGPD).
 */
export function identificacaoErro(e: unknown): { nome: string; codigo: string } {
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  return { nome, codigo: typeof codigo === "string" ? codigo : "" };
}

/** Registra `[modulo] contexto:` + nome + código do erro (sem mensagem nem dados pessoais). */
export function registrarFalha(modulo: string, contexto: string, e: unknown): void {
  const { nome, codigo } = identificacaoErro(e);
  console.error(`[${modulo}] ${contexto}:`, nome, codigo);
}

/** Registra a falha (só nome/código) e devolve a mensagem genérica. */
export function falhaInesperada(modulo: string, contexto: string, e: unknown): { ok: false; mensagem: string } {
  registrarFalha(modulo, contexto, e);
  return { ok: false, mensagem: ERRO_INESPERADO };
}

/** Variante para estados de tela com lista de mensagens (`mensagens: string[]`). */
export function falhaInesperadaMensagens(modulo: string, contexto: string, e: unknown): { ok: false; mensagens: string[] } {
  registrarFalha(modulo, contexto, e);
  return { ok: false, mensagens: [ERRO_INESPERADO] };
}
