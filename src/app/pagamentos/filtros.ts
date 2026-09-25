import { BENEF_CPF_INCOMPLETO, BENEF_ERRO } from "@/domain/chavePublica";
import type { PrismaClient } from "@/generated/prisma/client";
import { resolverCpfPorChave } from "@/server/beneficiarios";
import { prisma } from "@/server/db";

// H2 (LGPD): el filtro por CPF de /pagamentos viaja como clave opaca del beneficiario
// (`?benef=`), nunca como CPF. Los valores especiales de `benef` están en @/domain/chavePublica.

/** Filtros (además de `benef`) que la URL de la lista conserva, en orden. */
export const PARAMS_LISTA = ["competencia", "programa", "situacao"] as const;

export type FiltroCpf =
  /** Sin `?benef=`: sin filtro de CPF. */
  | { tipo: "semFiltro" }
  /** CPF informado pero incompleto: ninguna coincidencia y aviso. */
  | { tipo: "incompleto" }
  /** Clave malformada/inexistente o CPF sin beneficiario: ninguna coincidencia. */
  | { tipo: "inexistente" }
  /** Falla de la base al resolver (ya registrada sin datos personales): error genérico. */
  | { tipo: "erro" }
  | { tipo: "cpf"; cpf: string };

/** Traduce `?benef=` al filtro de CPF (el CPF solo existe en el servidor). Nunca lanza. */
export async function cpfDoFiltro(benef: string, db: PrismaClient = prisma): Promise<FiltroCpf> {
  if (!benef) return { tipo: "semFiltro" };
  if (benef === BENEF_CPF_INCOMPLETO) return { tipo: "incompleto" };
  if (benef === BENEF_ERRO) return { tipo: "erro" };
  const r = await resolverCpfPorChave(benef, "filtro de pagamentos (chave)", db);
  if (!r.ok) return { tipo: "erro" };
  return r.valor ? { tipo: "cpf", cpf: r.valor } : { tipo: "inexistente" };
}
