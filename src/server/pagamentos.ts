import type { PrismaClient } from "@/generated/prisma/client";
import { MENSAGENS_PAGAMENTO, type FiltrosPagamentos } from "@/domain/pagamento";
import { prisma } from "@/server/db";

// Consulta de pagos (story 4.4). Solo lectura: ADR-009 prohíbe crear, editar o borrar
// pagos fuera de los procesos (cálculo, lote, descuentos, corrección, conciliación).
// Este módulo no expone ninguna escritura.

export const TAMANHO_PAGINA = 10;

export async function listarPagamentos(
  filtros: Partial<FiltrosPagamentos> = {},
  db: PrismaClient = prisma,
) {
  const { cpf = "", competencia = 0, programa = "", situacao = "", pagina = 1 } = filtros;
  // CPF informado pero incompleto: ninguna coincidencia (sin búsqueda parcial, LGPD).
  if (cpf === null) return { itens: [], total: 0, pagina: 1, totalPaginas: 1 };
  const where = {
    ...(cpf ? { numCpf: cpf } : {}),
    ...(competencia ? { anoMesRef: competencia } : {}),
    ...(programa ? { codPrograma: programa } : {}),
    ...(situacao ? { sitPagamento: situacao } : {}),
  };
  const select = {
    numPagamento: true,
    numCpf: true,
    codPrograma: true,
    anoMesRef: true,
    vlrBruto: true,
    vlrDescontoTotal: true,
    vlrLiquido: true,
    sitPagamento: true,
    tipoPgto: true,
  } as const;
  // count + findMany en la misma transacción: total y filas consistentes entre sí.
  const consultar = (p: number) =>
    db.$transaction([
      db.pagamento.count({ where }),
      db.pagamento.findMany({ where, orderBy: { numPagamento: "desc" }, skip: (p - 1) * TAMANHO_PAGINA, take: TAMANHO_PAGINA, select }),
    ]);
  let atual = Math.max(1, Math.trunc(pagina) || 1);
  let [total, itens] = await consultar(atual);
  let totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  if (atual > totalPaginas) {
    // Página más allá del final → última página (nueva lectura consistente).
    atual = totalPaginas;
    [total, itens] = await consultar(atual);
    totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  }
  return { itens, total, pagina: atual, totalPaginas };
}

export async function obterPagamento(numPagamento: number | null, db: PrismaClient = prisma) {
  const pagamento =
    numPagamento != null && Number.isSafeInteger(numPagamento) && numPagamento > 0
      ? await db.pagamento.findUnique({
          where: { numPagamento },
          include: { descontos: { orderBy: { occurrence: "asc" } } },
        })
      : null;
  if (!pagamento) return { ok: false as const, mensagem: MENSAGENS_PAGAMENTO.naoEncontrado };
  return { ok: true as const, pagamento };
}
