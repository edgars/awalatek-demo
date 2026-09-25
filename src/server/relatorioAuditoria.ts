import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import {
  ACAO_EXCLUSAO,
  aplicarPadroesAuditoria,
  montarRelatorioAuditoria,
  type EntradaRelatorioAuditoria,
  type RelatorioAuditoria,
  valoresFiltroAuditoria,
} from "@/domain/relatorios/auditoria";
import { LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { prisma } from "@/server/db";

// Informe de la trilla de auditoría (RELAUDIT, story 7.3). Solo lectura: consulta la
// tabla Auditoria y delega las reglas al dominio. Nunca escribe auditoría (FR-AUD-07):
// el único escritor es `registrarEvento` (src/server/auditoria.ts, ADR-009).

export type ResultadoRelatorioAuditoria = RelatorioAuditoria & {
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
  /**
   * La lectura superaría `LIMITE_LINHAS_RELATORIO`: no se cargó el detalle (líneas y
   * páginas vacías; solo `resumo.total` es válido) y la pantalla pide refinar el filtro.
   */
  limiteExcedido: boolean;
};

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
  if (filtros.dtIni > filtros.dtFim) return { ...montarRelatorioAuditoria([], filtros), dataEmissao, limiteExcedido: false };

  // READ AUDITORIA-V BY DT-EVENTO … ESCAPE TOP (< ini) / ESCAPE BOTTOM (> fim).
  const periodo: Prisma.AuditoriaWhereInput = { dtEvento: { gte: filtros.dtIni, lte: filtros.dtFim } };
  // Volumen (H3): la base descarta lo que seguro no se exhibe — EX y los que no empiezan con
  // el valor del filtro (condición necesaria; ver `valoresFiltroAuditoria`). Es un
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
  // Tope de filas: se cuenta antes de leer el detalle.
  const excedido = async () => ({
    ...montarRelatorioAuditoria([], filtros, await db.auditoria.count({ where: periodo })),
    dataEmissao,
    limiteExcedido: true,
  });
  if ((await db.auditoria.count({ where: candidatos })) > limite) return excedido();
  // ADD 1 TO #QTD-TOTAL: el total del período (incluidos EX y filtrados) sale de un `count`,
  // en la misma transacción que la lectura (misma foto: total ≥ exhibidos aun con escrituras en paralelo).
  const [total, eventos] = await db.$transaction([
    db.auditoria.count({ where: periodo }),
    db.auditoria.findMany({
      where: candidatos,
      // `take` acota la lectura aunque otro proceso grabe entre el `count` y aquí.
      take: limite + 1,
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
    }),
  ]);
  if (eventos.length > limite) return excedido();
  return { ...montarRelatorioAuditoria(eventos, filtros, total), dataEmissao, limiteExcedido: false };
}
