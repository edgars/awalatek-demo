import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { camposViolados } from "@/server/unicidade";

// Candado entre procesos en la base (tabla ProcessoLock): el lote mensual corre desde
// la web y desde el CLI (otro proceso), y la conciliación desde la web; un candado en
// memoria no los ve entre sí. Adquisición atómica = INSERT de la fila `nome` (clave
// primaria): si otro proceso la tiene, el insert falla con P2002 → ocupado.
// Un candado más viejo que la expiración (SIFAP_LOCK_EXPIRACAO_MIN, default 120 min)
// se considera huérfano (el proceso cayó sin liberar) y se reemplaza. Quien lo tiene
// lo renueva periódicamente (`renovar`), así una corrida larga no lo pierde.
// Hora del proceso (no de la base): despliegue de un solo host.

export const LOCK_LOTE_PAGAMENTOS = "LOTE-PAGAMENTOS";
export const LOCK_CONCILIACAO = "CONCILIACAO";
export const NOMES_LOCK = [LOCK_LOTE_PAGAMENTOS, LOCK_CONCILIACAO] as const;

const EXPIRACAO_PADRAO_MIN = 120;
/** 1 minuto a 7 días. */
const EXPIRACAO_MIN_MIN = 1;
const EXPIRACAO_MAX_MIN = 10_080;

/**
 * Expiración en ms leída de `SIFAP_LOCK_EXPIRACAO_MIN`: entero en [1, 10080] minutos.
 * Vacío → 120 min; inválido → 120 min con aviso de configuración (sin datos personales).
 */
export function expiracaoLockMs(env: Record<string, string | undefined> = process.env): number {
  const bruto = env.SIFAP_LOCK_EXPIRACAO_MIN?.trim();
  if (!bruto) return EXPIRACAO_PADRAO_MIN * 60_000;
  const minutos = /^\d+$/.test(bruto) ? Number(bruto) : Number.NaN;
  if (!Number.isSafeInteger(minutos) || minutos < EXPIRACAO_MIN_MIN || minutos > EXPIRACAO_MAX_MIN) {
    console.warn(
      `[lock] SIFAP_LOCK_EXPIRACAO_MIN inválida (inteiro de ${EXPIRACAO_MIN_MIN} a ${EXPIRACAO_MAX_MIN}); usando ${EXPIRACAO_PADRAO_MIN}.`,
    );
    return EXPIRACAO_PADRAO_MIN * 60_000;
  }
  return minutos * 60_000;
}

export interface OpcoesLock {
  /** Momento de la adquisición (inyectable en tests); las renovaciones avanzan desde él con el reloj real. */
  agora?: Date;
  /** Expiración en ms; default = `expiracaoLockMs()`. */
  expiracaoMs?: number;
}

/** Candado adquirido. */
export interface LockAdquirido {
  nome: string;
  dono: string;
  /**
   * Renueva `adquiridoEm`. `false` si el candado ya no es de este dueño (expiró y otro
   * lo tomó, o se liberó a la fuerza): quien corre debe detenerse.
   */
  renovar: () => Promise<boolean>;
  /** Lo suelta (solo si sigue siendo del mismo dueño). */
  liberar: () => Promise<void>;
}

/** Candados tomados por este proceso, para soltarlos ante SIGINT/SIGTERM. */
const ativos = new Set<{ db: PrismaClient; nome: string; dono: string }>();

/**
 * Intenta tomar el candado `nome`. Devuelve `null` si otro proceso lo tiene y no
 * expiró. Sentencias sueltas (autocommit, sin `$transaction`): el busy_timeout de
 * SQLite cubre la espera de escritura. Otro error (no P2002) se propaga.
 */
export async function adquirirLock(db: PrismaClient, nome: string, { agora, expiracaoMs = expiracaoLockMs() }: OpcoesLock = {}): Promise<LockAdquirido | null> {
  const inicio = agora ?? new Date();
  // Desfase del reloj inyectado respecto del real: las renovaciones lo conservan.
  const desfase = inicio.getTime() - Date.now();
  const relogio = () => new Date(Date.now() + desfase);
  // Huérfano: más viejo que la expiración → se borra; si dos procesos lo ven a la vez,
  // solo uno gana el insert siguiente.
  await db.processoLock.deleteMany({ where: { nome, adquiridoEm: { lt: new Date(inicio.getTime() - expiracaoMs) } } });
  const dono = randomUUID();
  try {
    await db.processoLock.create({ data: { nome, dono, adquiridoEm: inicio } });
  } catch (e) {
    if (camposViolados(e) !== null) return null; // P2002: ocupado
    throw e;
  }
  const registro = { db, nome, dono };
  ativos.add(registro);
  return {
    nome,
    dono,
    renovar: async () => (await db.processoLock.updateMany({ where: { nome, dono }, data: { adquiridoEm: relogio() } })).count > 0,
    liberar: async () => {
      ativos.delete(registro);
      await liberarLock(db, nome, dono);
    },
  };
}

/** Suelta el candado solo si sigue siendo de `dono` (si expiró y otro lo tomó, no lo toca). */
export async function liberarLock(db: PrismaClient, nome: string, dono: string): Promise<void> {
  await db.processoLock.deleteMany({ where: { nome, dono } });
}

/**
 * Suelta todos los candados tomados por este proceso (manejador de SIGINT/SIGTERM del
 * CLI). Los errores se ignoran: el candado expirará solo.
 */
export async function liberarLocksDoProcesso(): Promise<number> {
  let n = 0;
  for (const r of [...ativos]) {
    ativos.delete(r);
    try {
      await liberarLock(r.db, r.nome, r.dono);
      n += 1;
    } catch {
      // expirará
    }
  }
  return n;
}

/**
 * Liberación forzada (runbook de candado trabado): borra el candado `nome` sea de quien
 * sea. Devuelve la fila borrada (dueño y momento) o `null` si no había.
 */
export async function forcarLiberacao(db: PrismaClient, nome: string): Promise<{ dono: string; adquiridoEm: Date } | null> {
  const atual = await db.processoLock.findUnique({ where: { nome } });
  if (!atual) return null;
  await db.processoLock.deleteMany({ where: { nome, dono: atual.dono } });
  return { dono: atual.dono, adquiridoEm: atual.adquiridoEm };
}

/** true si hay un candado vigente (no expirado) con ese nombre. */
export async function lockAtivo(db: PrismaClient, nome: string, { agora = new Date(), expiracaoMs = expiracaoLockMs() }: OpcoesLock = {}): Promise<boolean> {
  const n = await db.processoLock.count({ where: { nome, adquiridoEm: { gte: new Date(agora.getTime() - expiracaoMs) } } });
  return n > 0;
}

/**
 * Ejecuta `fn(lock)` con el candado `nome`; `ocupado()` si otro proceso lo tiene. Libera
 * en `finally`; un fallo al liberar se registra (solo nombre/código) y no tapa el
 * resultado: el candado expirará solo.
 */
export async function comLock<T>(
  db: PrismaClient,
  nome: string,
  ocupado: () => T,
  fn: (lock: LockAdquirido) => Promise<T>,
  opcoes: OpcoesLock = {},
): Promise<T> {
  const lock = await adquirirLock(db, nome, opcoes);
  if (!lock) return ocupado();
  try {
    return await fn(lock);
  } finally {
    try {
      await lock.liberar();
    } catch (e) {
      const codigo = (e as { code?: unknown } | null)?.code;
      console.error(`[lock] falha ao liberar ${nome}:`, e instanceof Error ? e.name : "erro desconhecido", typeof codigo === "string" ? codigo : "");
    }
  }
}

/**
 * Renovador para un recorrido: renueva cada `aCada` pasos. Devuelve `false` si el
 * candado se perdió (o la renovación falló: no se puede garantizar la exclusión).
 */
export function renovadorPorPassos(lock: LockAdquirido, aCada: number, rotulo: string): (passo: number) => Promise<boolean> {
  return async (passo) => {
    if (passo === 0 || passo % aCada !== 0) return true;
    try {
      return await lock.renovar();
    } catch (e) {
      const codigo = (e as { code?: unknown } | null)?.code;
      console.error(`[${rotulo}] falha ao renovar o cadeado:`, e instanceof Error ? e.name : "erro desconhecido", typeof codigo === "string" ? codigo : "");
      return false;
    }
  };
}
