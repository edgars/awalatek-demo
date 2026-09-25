import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import {
  aplicarPadroesAuditoria,
  montarRelatorioAuditoria,
  type EntradaRelatorioAuditoria,
  type RelatorioAuditoria,
} from "@/domain/relatorios/auditoria";
import { prisma } from "@/server/db";

// Informe de la trilla de auditoría (RELAUDIT, story 7.3). Solo lectura: consulta la
// tabla Auditoria y delega las reglas al dominio. Nunca escribe auditoría (FR-AUD-07):
// el único escritor es `registrarEvento` (src/server/auditoria.ts, ADR-009).

export type ResultadoRelatorioAuditoria = RelatorioAuditoria & {
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
};

/** RELAUDIT — trilla de auditoría con filtros. `entrada` con 0/"" = no informado (defaults del legado). */
export async function relatorioAuditoria(
  entrada: EntradaRelatorioAuditoria,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
): Promise<ResultadoRelatorioAuditoria> {
  const dataEmissao = hoje(agora).data;
  const filtros = aplicarPadroesAuditoria(entrada, dataEmissao);
  // READ AUDITORIA-V BY DT-EVENTO … ESCAPE TOP (< ini) / ESCAPE BOTTOM (> fim): la base solo
  // acota el rango; EX, filtros, descripciones y contadores los aplica el dominio.
  const eventos =
    filtros.dtIni <= filtros.dtFim
      ? await db.auditoria.findMany({
          where: { dtEvento: { gte: filtros.dtIni, lte: filtros.dtFim } },
          // TODO(review): orden secundario no definido en el legado (ver ordenarLeituraAuditoria).
          orderBy: [{ dtEvento: "asc" }, { hrEvento: "asc" }, { numAuditoria: "asc" }],
          select: {
            numAuditoria: true,
            dtEvento: true,
            hrEvento: true,
            usrEvento: true,
            codAcao: true,
            tipoEntidade: true,
            idEntidade: true,
            desAcao: true,
          },
        })
      : [];
  return { ...montarRelatorioAuditoria(eventos, filtros), dataEmissao };
}
