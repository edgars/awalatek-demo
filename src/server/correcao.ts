import type { PrismaClient } from "@/generated/prisma/client";
import {
  calcularCorrecao,
  IND_CORRIGIDO,
  MSG_CORRECAO_FINALIZADA,
  selecionarPagamentos,
  totalizar,
  validarPeriodo,
} from "@/domain/calculo/correcao";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Caso de uso de la corrección retroactiva (CALCCORR, FR-COR-01..04). Orquesta
// Prisma + dominio (`domain/calculo/correcao.ts`) sin lógica de negocio propia.
// CALCCORR no registra auditoría: aquí no se llama a registrarEvento.

export type PagamentoCorrigido = {
  numPagamento: number;
  competencia: number;
  /** Centavos. */
  vlrOriginal: number;
  /** Centavos (valor grabado en `vlrCorrecao`). */
  vlrCorrigido: number;
  /** Centavos. */
  vlrDiferenca: number;
};

export type ResultadoCorrecao =
  | { ok: true; mensagem: string; qtdRegistros: number; vlrTotal: number; corrigidos: PagamentoCorrigido[] }
  | { ok: false; mensagem: string };

/**
 * FR-COR — corrige por IPCA los pagos de `numCpf` con competencia entre
 * `compIni` y `compFim` (AAAAMM). Una transacción por pago corregido
 * (`END TRANSACTION` dentro del bucle, CALCCORR:163).
 */
export async function corrigirPagamentos(
  numCpf: string,
  compIni: number,
  compFim: number,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
): Promise<ResultadoCorrecao> {
  const erro = validarPeriodo(compIni, compFim);
  if (erro) return { ok: false, mensagem: erro };

  // Orden por competencia (y número de pago para desempatar) para que el
  // ESCAPE BOTTOM de CALCCORR:136 equivalga a la lectura del legado.
  const pagamentos = await db.pagamento.findMany({
    where: { numCpf, anoMesRef: { gte: compIni, lte: compFim } },
    orderBy: [{ anoMesRef: "asc" }, { numPagamento: "asc" }],
    select: { id: true, numPagamento: true, numCpf: true, anoMesRef: true, vlrBruto: true, indCorrigido: true },
  });

  const { data } = hoje(agora);
  const corrigidos: PagamentoCorrigido[] = [];
  for (const p of selecionarPagamentos(pagamentos, numCpf, compIni, compFim)) {
    const c = calcularCorrecao(p.vlrBruto, p.anoMesRef);
    if (!c.corrigir) continue;
    // Solo graba si el pago sigue sin corregir: dos ejecuciones concurrentes no
    // corrigen dos veces el mismo pago (FR-COR-02).
    const { count } = await db.$transaction((tx) =>
      tx.pagamento.updateMany({
        where: { id: p.id, OR: [{ indCorrigido: null }, { indCorrigido: { not: IND_CORRIGIDO } }] },
        data: { vlrCorrecao: c.vlrCorrigido, dtCorrecao: data, indCorrigido: IND_CORRIGIDO },
      }),
    );
    if (count === 0) continue;
    corrigidos.push({
      numPagamento: p.numPagamento,
      competencia: p.anoMesRef,
      vlrOriginal: c.vlrOriginal,
      vlrCorrigido: c.vlrCorrigido,
      vlrDiferenca: c.vlrDiferenca,
    });
  }

  return { ok: true, mensagem: MSG_CORRECAO_FINALIZADA, ...totalizar(corrigidos), corrigidos };
}
