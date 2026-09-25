import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import {
  ACAO_EXCLUSAO,
  aplicarPadroesAuditoria,
  montarRelatorioAuditoria,
  type EntradaRelatorioAuditoria,
  type FiltrosRelatorioAuditoria,
  type RelatorioAuditoria,
  valoresFiltroAuditoria,
} from "@/domain/relatorios/auditoria";
import { LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { prisma } from "@/server/db";

// Informe de la trilla de auditoría (RELAUDIT, story 7.3). Solo lectura: consulta la
// tabla Auditoria y delega las reglas al dominio. Nunca escribe auditoría (FR-AUD-07):
// el único escritor es `registrarEvento` (src/server/auditoria.ts, ADR-009).

/** Informe completo (la consulta cabe en `LIMITE_LINHAS_RELATORIO`). */
export type RelatorioAuditoriaCompleto = RelatorioAuditoria & {
  limiteExcedido: false;
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
};

/**
 * `limiteExcedido: true`: los eventos que pasan el prefiltro superan `LIMITE_LINHAS_RELATORIO`;
 * no se cargó el detalle ni se armó el resumen y la pantalla pide refinar el filtro.
 */
export type ResultadoRelatorioAuditoria =
  | RelatorioAuditoriaCompleto
  | { limiteExcedido: true; filtros: FiltrosRelatorioAuditoria; dataEmissao: number };

/** RELAUDIT — trilla de auditoría con filtros. `entrada` con 0/"" = no informado (defaults del legado). */
export async function relatorioAuditoria(
  entrada: EntradaRelatorioAuditoria,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
  { limite = LIMITE_LINHAS_RELATORIO }: { limite?: number } = {},
): Promise<ResultadoRelatorioAuditoria> {
  if (!Number.isSafeInteger(limite) || limite < 0) throw new Error("limite de linhas inválido");
  const dataEmissao = hoje(agora).data;
  const filtros = aplicarPadroesAuditoria(entrada, dataEmissao);
  if (filtros.dtIni > filtros.dtFim) return { ...montarRelatorioAuditoria([], filtros), limiteExcedido: false, dataEmissao };

  // READ AUDITORIA-V BY DT-EVENTO … ESCAPE TOP (< ini) / ESCAPE BOTTOM (> fim).
  const periodo: Prisma.AuditoriaWhereInput = { dtEvento: { gte: filtros.dtIni, lte: filtros.dtFim } };
  // Volumen (H3): la base descarta lo que seguro no se exhibe — EX y los que no empiezan con
  // el valor del filtro (condición necesaria; ver `valoresFiltroAuditoria`). codAcao,
  // usrEvento y tipoEntidade son NOT NULL en el esquema (el test de volumen lo verifica),
  // así que el prefiltro no pierde filas con NULL. Es un
  // superconjunto: EX con espacios finales, mayúsculas/minúsculas o comodines de LIKE
  // pueden colarse y el dominio (`motivoFiltro`) decide cada evento como antes.
  const f = valoresFiltroAuditoria(filtros);
  const candidatos: Prisma.AuditoriaWhereInput = {
    AND: [
      periodo,
      { codAcao: { not: ACAO_EXCLUSAO } },
      ...(f.acao ? [{ codAcao: { startsWith: f.acao } }] : []),
      ...(f.usuario ? [{ usrEvento: { startsWith: f.usuario } }] : []),
      ...(f.tabela ? [{ tipoEntidade: { startsWith: f.tabela } }] : []),
    ],
  };
  // Conteos y lectura en la misma transacción: la consistencia (total ≥ exhibidos, tope)
  // descansa en la serialización de SQLite (una conexión; la transacción ve una sola foto).
  const leitura = await db.$transaction(async (tx) => {
    // Tope de filas: se cuenta antes de leer el detalle.
    if ((await tx.auditoria.count({ where: candidatos })) > limite) return null;
    // ADD 1 TO #QTD-TOTAL: el total del período (incluidos EX y filtrados) sale de un `count`.
    const total = await tx.auditoria.count({ where: periodo });
    const eventos = await tx.auditoria.findMany({
      where: candidatos,
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
    });
    return { total, eventos };
  });
  if (leitura === null) return { limiteExcedido: true, filtros, dataEmissao };
  return { ...montarRelatorioAuditoria(leitura.eventos, filtros, leitura.total), limiteExcedido: false, dataEmissao };
}
