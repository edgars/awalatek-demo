import type { PrismaClient } from "@/generated/prisma/client";
import {
  calcularCorrecao,
  IND_CORRIGIDO,
  mensagemSemIndiceIpca,
  MSG_CORRECAO_FINALIZADA,
  type QuirksCorrecao,
  selecionarPagamentos,
  totalizar,
  validarPeriodo,
} from "@/domain/calculo/correcao";
import { hoje } from "@/domain/legacyDate";
import { corrige, QUIRKS_PADRAO } from "@/domain/quirks";
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
  | {
      ok: true;
      mensagem: string;
      qtdRegistros: number;
      vlrTotal: number;
      corrigidos: PagamentoCorrigido[];
      /** CORRECAO(D9): avisos "SEM INDICE IPCA: …" (solo con la corrección D9 activa). */
      avisos?: string[];
    }
  | { ok: false; mensagem: string };

/**
 * FR-COR — corrige por IPCA los pagos de `numCpf` con competencia entre
 * `compIni` y `compFim` (AAAAMM). Una transacción por pago corregido
 * (`END TRANSACTION` dentro del bucle, CALCCORR:163).
 * `quirks`: correcciones activas (D9/D22), leídas por la acción; default = legado.
 */
export async function corrigirPagamentos(
  numCpf: string,
  compIni: number,
  compFim: number,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
  quirks: QuirksCorrecao = QUIRKS_PADRAO,
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
  // CORRECAO(D22): con la corrección activa se leen solo los pagos del período,
  // ordenados por competencia (y nº), sin parada anticipada.
  const corrigeD22 = corrige(quirks, "D22");
  const pagamentos = await db.pagamento.findMany({
    where: corrigeD22 ? { numCpf, anoMesRef: { gte: compIni, lte: compFim } } : { numCpf },
    orderBy: corrigeD22 ? [{ anoMesRef: "asc" }, { numPagamento: "asc" }] : { numPagamento: "asc" },
    select: { id: true, numPagamento: true, numCpf: true, anoMesRef: true, vlrBruto: true, indCorrigido: true },
  });

  const { data } = hoje(agora);
  const corrigidos: PagamentoCorrigido[] = [];
  const avisos: string[] = [];
  for (const p of selecionarPagamentos(pagamentos, numCpf, compIni, compFim, quirks)) {
    const c = calcularCorrecao(p.vlrBruto, p.anoMesRef, quirks);
    if (c.semIndiceIpca) {
      // CORRECAO(D9): sin IPCA del año → aviso; el pago no se marca ni se cuenta.
      avisos.push(mensagemSemIndiceIpca(p.anoMesRef, p.numPagamento));
      continue;
    }
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

  const resultado = { ok: true as const, mensagem: MSG_CORRECAO_FINALIZADA, ...totalizar(corrigidos), corrigidos };
  // LEGACY-QUIRK(D9): sin avisos (el resultado del legado no los tiene).
  return corrige(quirks, "D9") ? { ...resultado, avisos } : resultado;
}
