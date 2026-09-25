import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { camposViolados } from "@/server/unicidade";

// Candado entre procesos en la base (tabla ProcessoLock): el lote mensual corre desde
// la web y desde el CLI (otro proceso), y la conciliación desde la web; un candado en
// memoria no los ve entre sí. Adquisición atómica = INSERT de la fila `nome` (clave
// primaria): si otro proceso la tiene, el insert falla con P2002 → ocupado.
// Un candado más viejo que la expiración (SIFAP_LOCK_EXPIRACAO_MIN, default 120 min)
// se considera huérfano (el proceso cayó sin liberar) y se reemplaza.

export const LOCK_LOTE_PAGAMENTOS = "LOTE-PAGAMENTOS";
export const LOCK_CONCILIACAO = "CONCILIACAO";

const EXPIRACAO_PADRAO_MIN = 120;

/** Expiración en ms leída de `SIFAP_LOCK_EXPIRACAO_MIN`; vacío o inválido → 120 min. */
export function expiracaoLockMs(env: Record<string, string | undefined> = process.env): number {
  const bruto = env.SIFAP_LOCK_EXPIRACAO_MIN?.trim();
  const minutos = bruto ? Number(bruto) : Number.NaN;
  return (Number.isFinite(minutos) && minutos > 0 ? minutos : EXPIRACAO_PADRAO_MIN) * 60_000;
}

export interface OpcoesLock {
  /** Momento de la adquisición; default = ahora. */
  agora?: Date;
  /** Expiración en ms; default = `expiracaoLockMs()`. */
  expiracaoMs?: number;
}

/** Candado adquirido: `liberar()` lo suelta (solo si sigue siendo del mismo dueño). */
export interface LockAdquirido {
  nome: string;
  dono: string;
  liberar: () => Promise<void>;
}

/**
 * Intenta tomar el candado `nome`. Devuelve `null` si otro proceso lo tiene y no
 * expiró. Sentencias sueltas (autocommit, sin `$transaction`): el busy_timeout de
 * SQLite cubre la espera de escritura.
 */
export async function adquirirLock(db: PrismaClient, nome: string, { agora = new Date(), expiracaoMs = expiracaoLockMs() }: OpcoesLock = {}): Promise<LockAdquirido | null> {
  // Huérfano: más viejo que la expiración → se borra; si dos procesos lo ven a la vez,
  // solo uno gana el insert siguiente.
  await db.processoLock.deleteMany({ where: { nome, adquiridoEm: { lt: new Date(agora.getTime() - expiracaoMs) } } });
  const dono = randomUUID();
  try {
    await db.processoLock.create({ data: { nome, dono, adquiridoEm: agora } });
  } catch (e) {
    if (camposViolados(e) !== null) return null; // P2002: ocupado
    throw e;
  }
  return { nome, dono, liberar: () => liberarLock(db, nome, dono) };
}

/** Suelta el candado solo si sigue siendo de `dono` (si expiró y otro lo tomó, no lo toca). */
export async function liberarLock(db: PrismaClient, nome: string, dono: string): Promise<void> {
  await db.processoLock.deleteMany({ where: { nome, dono } });
}

/** true si hay un candado vigente (no expirado) con ese nombre. */
export async function lockAtivo(db: PrismaClient, nome: string, { agora = new Date(), expiracaoMs = expiracaoLockMs() }: OpcoesLock = {}): Promise<boolean> {
  const n = await db.processoLock.count({ where: { nome, adquiridoEm: { gte: new Date(agora.getTime() - expiracaoMs) } } });
  return n > 0;
}

/**
 * Ejecuta `fn` con el candado `nome`; `ocupado()` si otro proceso lo tiene. Libera en
 * `finally`; un fallo al liberar se registra (solo nombre/código) y no tapa el
 * resultado: el candado expirará solo.
 */
export async function comLock<T>(db: PrismaClient, nome: string, ocupado: () => T, fn: () => Promise<T>, opcoes: OpcoesLock = {}): Promise<T> {
  const lock = await adquirirLock(db, nome, opcoes);
  if (!lock) return ocupado();
  try {
    return await fn();
  } finally {
    try {
      await lock.liberar();
    } catch (e) {
      const codigo = (e as { code?: unknown } | null)?.code;
      console.error(`[lock] falha ao liberar ${nome}:`, e instanceof Error ? e.name : "erro desconhecido", typeof codigo === "string" ? codigo : "");
    }
  }
}
