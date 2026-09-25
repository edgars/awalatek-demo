import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// ADR-009 — único escritor de la tabla Auditoria. Append-only: este módulo no
// expone (ni debe exponer) funciones de actualización o borrado.

export const ACOES_AUDITORIA = ["IN", "AL", "CO", "CN", "DV", "EX"] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

export type EventoAuditoria = {
  acao: AcaoAuditoria;
  /** Entidad afectada (TABELA-REF). */
  tabela: string;
  /** Clave de la entidad (CHAVE-REF). */
  chave: string;
  /** Usuario del evento; default `SIFAP_USER` (usar `BATCH` en procesos batch). */
  usuario?: string;
  descricao: string;
  valorAnterior?: string | null;
  valorPosterior?: string | null;
  /**
   * Momento del evento provisto por el llamador (AAAAMMDD / HHMMSS). Un proceso batch
   * toma `*DATN`/`*TIMN` una sola vez al inicio y graba todos sus eventos con ese
   * momento (BATCHCON:79-80). Ausente → `hoje()` en cada evento.
   */
  momento?: { data: number; hora: number };
};

/** Cliente completo (abre su transacción) o cliente de una transacción en curso. */
export type ClienteAuditoria = PrismaClient | Prisma.TransactionClient;

// Longitudes del DDM AUDITORIA: los textos se cortan como un MOVE de Natural.
const LEN = { usrEvento: 8, tipoEntidade: 15, idEntidade: 20, desAcao: 80 } as const;

const corta = (s: string, n: number): string => s.slice(0, n);

async function gravar(tx: Prisma.TransactionClient, evento: EventoAuditoria, usuario: string) {
  // numAuditoria = máx.+1, calculado dentro de la misma transacción que el insert.
  const { _max } = await tx.auditoria.aggregate({ _max: { numAuditoria: true } });
  const numAuditoria = (_max.numAuditoria ?? 0) + 1;
  const { data: dtEvento, hora: hrEvento } = evento.momento ?? hoje();
  return tx.auditoria.create({
    data: {
      numAuditoria,
      dtEvento,
      hrEvento,
      codAcao: evento.acao,
      tipoEntidade: corta(evento.tabela, LEN.tipoEntidade),
      idEntidade: corta(evento.chave, LEN.idEntidade),
      usrEvento: corta(usuario, LEN.usrEvento),
      desAcao: corta(evento.descricao, LEN.desAcao),
      valorAnterior: evento.valorAnterior ?? null,
      valorPosterior: evento.valorPosterior ?? null,
    },
  });
}

/** `data` AAAAMMDD plausible (8 dígitos, mes 01–12, día 01–31) y `hora` HHMMSS (≤ 235959, mm/ss ≤ 59). */
function momentoValido({ data, hora }: { data: number; hora: number }): boolean {
  if (!Number.isInteger(data) || data < 10000101 || data > 99991231) return false;
  const mes = Math.floor(data / 100) % 100;
  const dia = data % 100;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  if (!Number.isInteger(hora) || hora < 0 || hora > 235959) return false;
  return Math.floor(hora / 100) % 100 <= 59 && hora % 100 <= 59;
}

function ehClienteCompleto(c: ClienteAuditoria): c is PrismaClient {
  return typeof (c as PrismaClient).$transaction === "function";
}

/**
 * Registra un evento de auditoría. Si recibe el cliente de una transacción en
 * curso (p. ej. un proceso de E6), graba dentro de ella; si no, abre una propia.
 */
export async function registrarEvento(evento: EventoAuditoria, cliente: ClienteAuditoria = prisma) {
  if (!ACOES_AUDITORIA.includes(evento.acao)) {
    throw new Error(`ação de auditoria inválida: ${String(evento.acao)}`);
  }
  if (evento.momento && !momentoValido(evento.momento)) {
    throw new Error("momento de auditoria inválido");
  }
  const usuario = evento.usuario?.trim() || process.env.SIFAP_USER?.trim() || "";
  if (!usuario) throw new Error("usuário de auditoria não informado (SIFAP_USER)");

  if (ehClienteCompleto(cliente)) {
    return cliente.$transaction((tx) => gravar(tx, evento, usuario));
  }
  return gravar(cliente, evento, usuario);
}
