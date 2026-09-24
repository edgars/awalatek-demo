import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Único punto de acceso a la base. Prisma 7 exige un driver adapter para SQLite.

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
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
