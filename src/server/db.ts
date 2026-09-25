import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Único punto de acceso a la base. Prisma 7 exige un driver adapter para SQLite.

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  // better-sqlite3 usa una sola conexión: las transacciones interactivas esperan su
  // turno en un mutex, así que se amplía la espera por defecto de Prisma (2 s).
  const client = new PrismaClient({ adapter, transactionOptions: { maxWait: 15_000, timeout: 20_000 } });
  return conReintentoSqliteBusy(client);
}

const TENTATIVAS_BUSY = 6;

/**
 * El adapter abre las transacciones con `BEGIN` (DEFERRED): si otra conexión (CLI del
 * lote, clientes de test) escribe entre la lectura y la escritura de la transacción,
 * SQLite devuelve SQLITE_BUSY sin esperar el busy_timeout, que Prisma expone como
 * P1008. La transacción ya se revirtió, así que se reintenta completa con backoff.
 */
export function conReintentoSqliteBusy(client: PrismaClient): PrismaClient {
  const original = client.$transaction.bind(client) as (...args: unknown[]) => Promise<unknown>;
  const comReintento = async (...args: unknown[]) => {
    for (let tentativa = 1; ; tentativa++) {
      try {
        return await original(...args);
      } catch (e) {
        const codigo = (e as { code?: unknown } | null)?.code;
        if (codigo !== "P1008" || tentativa >= TENTATIVAS_BUSY) throw e;
        await new Promise((r) => setTimeout(r, 25 * 2 ** tentativa + Math.random() * 25));
      }
    }
  };
  // Proxy (no se modifica el cliente): los clientes de transacción que Prisma deriva
  // del cliente real no deben heredar `$transaction`.
  return new Proxy(client, {
    get(alvo, prop, receptor) {
      return prop === "$transaction" ? comReintento : Reflect.get(alvo, prop, receptor);
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL não configurada (ver .env.example)");
    }
    // Se guarda en globalThis para evitar múltiples instancias con el hot-reload de `next dev`.
    globalForPrisma.prisma = createPrismaClient(url);
  }
  return globalForPrisma.prisma;
}

/**
 * Cliente singleton, creado de forma perezosa en el primer uso: importar este
 * módulo no exige `DATABASE_URL` (p. ej. durante `next build` o en tests).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value: unknown = Reflect.get(client, prop, client);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
