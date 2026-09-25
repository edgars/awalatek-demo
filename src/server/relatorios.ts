import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import {
  montarRelatorioPagamentos,
  normalizarFiltroPrograma,
  type FiltrosRelatorioPagamentos,
  type RelatorioPagamentos,
} from "@/domain/relatorios/pagamentos";
import { LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { prisma } from "@/server/db";

// Informes de solo lectura (épica 7). Este módulo solo consulta y delega en
// `src/domain/relatorios`: no expone ninguna escritura (ADR-009).

/** Informe completo (la consulta cabe en `LIMITE_LINHAS_RELATORIO`). */
export type RelatorioPagamentosCompleto = RelatorioPagamentos & {
  limiteExcedido: false;
  filtros: FiltrosRelatorioPagamentos;
  /** `#DT-HOJE` (AAAAMMDD) de la cabecera. */
  dataEmissao: number;
};

/**
 * `limiteExcedido: true`: la consulta supera `LIMITE_LINHAS_RELATORIO`; no se cargó el
 * detalle ni se calcularon totales y la pantalla pide refinar el filtro.
 */
export type ResultadoRelatorioPagamentos =
  | RelatorioPagamentosCompleto
  | { limiteExcedido: true; filtros: FiltrosRelatorioPagamentos; dataEmissao: number };

/**
 * Condición necesaria del filtro de programa para la base (volumen, H3). El dominio compara
 * `trim().toUpperCase()` del código con el filtro; `contains` (LIKE de SQLite: ignora
 * mayúsculas/minúsculas ASCII y admite espacios alrededor) devuelve un superconjunto y
 * `montarRelatorioPagamentos` sigue decidiendo cada fila. Solo se aplica a filtros A-Z/0-9
 * (los que acepta la pantalla); cualquier otro filtro no se empuja a la base. Supuesto: los
 * códigos grabados son ASCII (codProgramaSchema: 1 a 4 letras o números), así que el
 * `toUpperCase` de JS y el LIKE coinciden.
 */
function filtroProgramaNaBase(programa: string): Prisma.PagamentoWhereInput {
  const p = normalizarFiltroPrograma(programa);
  return p !== "" && /^[A-Z0-9]+$/.test(p) ? { codPrograma: { contains: p } } : {};
}

/** RELPGT — informe analítico de pagos por período (story 7.1). */
export async function relatorioPagamentos(
  filtros: FiltrosRelatorioPagamentos,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
  { limite = LIMITE_LINHAS_RELATORIO }: { limite?: number } = {},
): Promise<ResultadoRelatorioPagamentos> {
  if (!Number.isSafeInteger(limite) || limite < 0) throw new Error("limite de linhas inválido");
  const dataEmissao = hoje(agora).data;
  if (filtros.compIni > filtros.compFim) return { ...montarRelatorioPagamentos([], filtros), limiteExcedido: false, filtros, dataEmissao };
  // READ PAGAMENTO-V BY COMPETENCIA = #COMP-INI … ESCAPE BOTTOM al pasar #COMP-FIM:
  // la base acota el rango (y el programa, como condición necesaria); filtros, corte y
  // descripciones los aplica el dominio.
  const where: Prisma.PagamentoWhereInput = { anoMesRef: { gte: filtros.compIni, lte: filtros.compFim }, ...filtroProgramaNaBase(filtros.programa) };
  // Conteo (tope de filas) y lectura en la misma transacción: la consistencia entre ambos
  // descansa en la serialización de SQLite (una conexión; la transacción ve una sola foto).
  const filas = await db.$transaction(async (tx) => {
    if ((await tx.pagamento.count({ where })) > limite) return null;
    return tx.pagamento.findMany({
      where,
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
  });
  if (filas === null) return { limiteExcedido: true, filtros, dataEmissao };
  return { ...montarRelatorioPagamentos(filas, filtros), limiteExcedido: false, filtros, dataEmissao };
}
