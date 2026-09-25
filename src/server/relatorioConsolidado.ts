import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { consolidar, type Consolidado } from "@/domain/relatorios/consolidado";
import { prisma } from "@/server/db";

// Informe consolidado mensual (BATCHREL, story 7.2). Solo lectura: lee los pagos
// de la competencia con la región del beneficiario y delega las reglas al dominio.

/** Tamaño por defecto del lote de CPFs por consulta de beneficiarios. */
export const LOTE_CPFS = 500;

export type RelatorioConsolidado = Consolidado & { dataEmissao: number };

export async function relatorioConsolidado(
  competencia: number,
  db: PrismaClient = prisma,
  { agora = new Date(), loteCpfs = LOTE_CPFS }: { agora?: Date; loteCpfs?: number } = {},
): Promise<RelatorioConsolidado> {
  if (!Number.isSafeInteger(loteCpfs) || loteCpfs < 1) throw new Error("tamanho de lote inválido");
  // READ PAGAMENTO-V BY COMPETENCIA = #COMPETENCIA (el filtro exacto vive en el dominio).
  const pagamentos = await db.pagamento.findMany({
    where: { anoMesRef: competencia },
    orderBy: { numPagamento: "asc" },
    select: {
      anoMesRef: true,
      numCpf: true,
      vlrBruto: true,
      vlrDescontoTotal: true,
      vlrLiquido: true,
      sitPagamento: true,
    },
  });
  // FIND BENEFICIARIO-V WITH CPF = CPF-BENEF → COD-REGIAO (no encontrado → 0 en el dominio).
  const cpfs = [...new Set(pagamentos.map((p) => p.numCpf))];
  const regiaoPorCpf = new Map<string, number>();
  // Lotes: el `IN` de SQLite tiene límite de variables por sentencia.
  for (let i = 0; i < cpfs.length; i += loteCpfs) {
    const lote = cpfs.slice(i, i + loteCpfs);
    const beneficiarios = await db.beneficiario.findMany({ where: { numCpf: { in: lote } }, select: { numCpf: true, codRegiao: true } });
    for (const b of beneficiarios) regiaoPorCpf.set(b.numCpf, b.codRegiao);
  }
  const linhas = pagamentos.map(({ numCpf, ...p }) => ({ ...p, codRegiao: regiaoPorCpf.get(numCpf) ?? null }));
  return { ...consolidar(competencia, linhas), dataEmissao: hoje(agora).data };
}
