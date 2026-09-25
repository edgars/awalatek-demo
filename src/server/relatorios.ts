import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { montarRelatorioPagamentos, type FiltrosRelatorioPagamentos, type RelatorioPagamentos } from "@/domain/relatorios/pagamentos";
import { prisma } from "@/server/db";

// Informes de solo lectura (épica 7). Este módulo solo consulta y delega en
// `src/domain/relatorios`: no expone ninguna escritura (ADR-009).

export type ResultadoRelatorioPagamentos = RelatorioPagamentos & {
  filtros: FiltrosRelatorioPagamentos;
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
};

/** RELPGT — informe analítico de pagos por período (story 7.1). */
export async function relatorioPagamentos(
  filtros: FiltrosRelatorioPagamentos,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
): Promise<ResultadoRelatorioPagamentos> {
  // READ PAGAMENTO-V BY COMPETENCIA = #COMP-INI … ESCAPE BOTTOM al pasar #COMP-FIM:
  // la base solo acota el rango; filtros, corte y descripciones los aplica el dominio.
  const filas =
    filtros.compIni <= filtros.compFim
      ? await db.pagamento.findMany({
          where: { anoMesRef: { gte: filtros.compIni, lte: filtros.compFim } },
          // TODO(review): orden secundario no definido en el legado (ver ordenarLeitura).
          orderBy: [{ anoMesRef: "asc" }, { codPrograma: "asc" }, { numPagamento: "asc" }],
          select: {
            numPagamento: true,
            numCpf: true,
            codPrograma: true,
            anoMesRef: true,
            vlrBruto: true,
            vlrDescontoTotal: true,
            vlrLiquido: true,
            vlrAbono: true,
            tipoPgto: true,
            sitPagamento: true,
            // FIND BENEFICIARIO-V WITH CPF = CPF-BENEF.
            beneficiario: { select: { nomeCompleto: true, uf: true } },
          },
        })
      : [];
  return { ...montarRelatorioPagamentos(filas, filtros), filtros, dataEmissao: hoje(agora).data };
}
