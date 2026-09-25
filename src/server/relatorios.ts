import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { montarRelatorioPagamentos, type FiltrosRelatorioPagamentos, type RelatorioPagamentos } from "@/domain/relatorios/pagamentos";
import { LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { prisma } from "@/server/db";

// Informes de solo lectura (épica 7). Este módulo solo consulta y delega en
// `src/domain/relatorios`: no expone ninguna escritura (ADR-009).

export type ResultadoRelatorioPagamentos = RelatorioPagamentos & {
  filtros: FiltrosRelatorioPagamentos;
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
  /**
   * El período supera `LIMITE_LINHAS_RELATORIO`: no se cargó el detalle (líneas, páginas y
   * totales vacíos) y la pantalla pide refinar el filtro.
   */
  limiteExcedido: boolean;
};

/** RELPGT — informe analítico de pagos por período (story 7.1). */
export async function relatorioPagamentos(
  filtros: FiltrosRelatorioPagamentos,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
  { limite = LIMITE_LINHAS_RELATORIO }: { limite?: number } = {},
): Promise<ResultadoRelatorioPagamentos> {
  if (!Number.isSafeInteger(limite) || limite < 0) throw new Error("limite de linhas inválido");
  const dataEmissao = hoje(agora).data;
  if (filtros.compIni > filtros.compFim) return { ...montarRelatorioPagamentos([], filtros), filtros, dataEmissao, limiteExcedido: false };
  // READ PAGAMENTO-V BY COMPETENCIA = #COMP-INI … ESCAPE BOTTOM al pasar #COMP-FIM:
  // la base solo acota el rango; filtros, corte y descripciones los aplica el dominio.
  const periodo = { anoMesRef: { gte: filtros.compIni, lte: filtros.compFim } };
  const excedido = (): ResultadoRelatorioPagamentos => ({ ...montarRelatorioPagamentos([], filtros), filtros, dataEmissao, limiteExcedido: true });
  // Volumen (H3): tope de filas del período, contado antes de leer el detalle.
  if ((await db.pagamento.count({ where: periodo })) > limite) return excedido();
  const filas = await db.pagamento.findMany({
    where: periodo,
    // `take` acota la lectura aunque otro proceso grabe entre el `count` y aquí.
    take: limite + 1,
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
  });
  if (filas.length > limite) return excedido();
  return { ...montarRelatorioPagamentos(filas, filtros), filtros, dataEmissao, limiteExcedido: false };
}
