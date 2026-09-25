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

  // `READ PAGAMENTO-V BY CPF-BENEF = #CPF` (CALCCORR:128): todos los pagos del CPF
  // en orden de ISN (inserción ≈ `numPagamento` asc, mismo criterio que D21), sin
  // filtrar por período: los ESCAPE TOP/BOTTOM los aplica `selecionarPagamentos`.
  // LEGACY-QUIRK(D22): un pago con competencia posterior a la final insertado antes
  // que los del período termina el recorrido (ESCAPE BOTTOM, CALCCORR:136) y los
  // pagos del período leídos después NO se corrigen. Se replica tal cual.
  // TODO(review): confirmar con negocio si la parada anticipada debe mantenerse.
  const pagamentos = await db.pagamento.findMany({
    where: { numCpf },
    orderBy: { numPagamento: "asc" },
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
