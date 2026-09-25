import type { PrismaClient } from "@/generated/prisma/client";
import { calcularDescontos, type DescontoCadastrado } from "@/domain/calculo/descontos";
import { verificarPrecondicoesDescontos } from "@/domain/calculo/precondicoesDescontos";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Caso de uso del recálculo de descuentos de un pago (CALCDSCT, FR-DSC-01..06).
// Orquesta dominio + Prisma sin lógica de negocio propia: las precondiciones
// están en `domain/calculo/precondicoesDescontos.ts` y los valores en
// `domain/calculo/descontos.ts`. CALCDSCT no registra auditoría.

export const MSG_DESCONTOS_CALCULADOS = "DESCONTOS CALCULADOS";

/** Situación de cada descuento registrado del beneficiario en el recálculo. */
export type SituacaoDesconto = "aplicado" | "ignorado" | "foraDeVigencia";

export type DescontoResumo = {
  /** `occurrence` del descuento registrado (BeneficiarioDesconto). */
  occurrence: number;
  tipoDesconto: string;
  /** Valor sumado al total, en centavos (0 si no se aplicó). */
  vlrItem: number;
  pctDesconto: string;
  dtInicioDsct: number;
  dtFimDsct: number;
  numProcesso: string | null;
  situacao: SituacaoDesconto;
  /** true si el tope del 30 % recortó el total tras este descuento (D2). */
  tetoAplicado: boolean;
};

export type ResumoDescontos = {
  numPagamento: number;
  numCpf: string;
  competencia: number;
  vlrBruto: number;
  vlrDesconto: number;
  vlrTeto: number;
  vlrContribuicao: number;
  /** Líquido del pago, SIN cambios (D13). */
  vlrLiquido: number;
  /** Descuentos registrados en orden de occurrence. */
  descontos: DescontoResumo[];
};

export type ResultadoRecalculo = { ok: true; mensagem: string; resumo: ResumoDescontos } | { ok: false; mensagem: string };

// Mismo criterio que `server/calculo.ts` (usuario operativo de 8 posiciones).
function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}

/**
 * FR-DSC — recalcula los descuentos del pago `numPagamento` de `numCpf` a partir
 * de los descuentos registrados del beneficiario y graba el total en el pago
 * (una transacción). Valores en centavos.
 */
export async function recalcularDescontos(
  numCpf: string,
  numPagamento: number,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
): Promise<ResultadoRecalculo> {
  return db.$transaction(async (tx) => {
    const pagamento = Number.isSafeInteger(numPagamento) ? await tx.pagamento.findUnique({ where: { numPagamento } }) : null;
    const beneficiario = /^\d{11}$/.test(numCpf) ? await tx.beneficiario.findUnique({ where: { numCpf } }) : null;
    const pre = verificarPrecondicoesDescontos({ numCpf, pagamento, beneficiario });
    if (!pre.ok) return { ok: false, mensagem: pre.mensagem } as const;
    if (!pagamento || !beneficiario) throw new Error("precondições inconsistentes");
    const usuario = usuarioOperativo();
    const { data, hora } = hoje(agora);

    // LEGACY-QUIRK(D14): la fuente son los descuentos REGISTRADOS del beneficiario.
    const registrados = await tx.beneficiarioDesconto.findMany({
      where: { beneficiarioId: beneficiario.id },
      orderBy: { occurrence: "asc" },
    });
    const cadastrados: DescontoCadastrado[] = registrados.map((d) => ({
      occurrence: d.occurrence,
      tipoDesconto: d.tipoDesconto,
      vlrDesconto: d.vlrDesconto,
      pctDesconto: d.pctDesconto,
      dtInicioDsct: d.dtInicioDsct,
      dtFimDsct: d.dtFimDsct,
      numProcesso: d.numProcesso,
    }));
    const r = calcularDescontos({ vlrBruto: pagamento.vlrBruto, descontos: cadastrados, dtHoje: data });
    const aplicados = r.itens.filter((i) => i.aplicado);

    // LEGACY-QUIRK(D13): solo se actualiza el descuento del pago; vlrLiquido NO se recalcula.
    await tx.pagamento.update({
      where: { id: pagamento.id },
      data: { vlrDescontoTotal: r.vlrTotal, dtUltAlteracao: data, hrUltAlteracao: hora, usrUltAlteracao: usuario },
    });
    // LEGACY-QUIRK(D14): los descuentos aplicados van a PagamentoDesconto (reemplazo completo).
    await tx.pagamentoDesconto.deleteMany({ where: { pagamentoId: pagamento.id } });
    if (aplicados.length > 0) {
      await tx.pagamentoDesconto.createMany({
        data: aplicados.map((i, idx) => ({
          pagamentoId: pagamento.id,
          occurrence: idx + 1,
          tipoDesconto: i.tipoDesconto,
          vlrDesconto: i.vlrItem,
          pctDesconto: i.pctDesconto,
          numProcesso: i.numProcesso ?? null,
          dtInicioDsct: i.dtInicioDsct,
          dtFimDsct: i.dtFimDsct,
        })),
      });
    }

    const processados = new Map(r.itens.map((i) => [i.occurrence, i]));
    const descontos: DescontoResumo[] = cadastrados.map((d) => {
      const p = processados.get(d.occurrence);
      return {
        occurrence: d.occurrence,
        tipoDesconto: d.tipoDesconto,
        vlrItem: p?.vlrItem ?? 0,
        pctDesconto: d.pctDesconto,
        dtInicioDsct: d.dtInicioDsct,
        dtFimDsct: d.dtFimDsct,
        numProcesso: d.numProcesso ?? null,
        situacao: !p ? "foraDeVigencia" : p.aplicado ? "aplicado" : "ignorado",
        tetoAplicado: p?.tetoAplicado ?? false,
      };
    });

    return {
      ok: true,
      mensagem: MSG_DESCONTOS_CALCULADOS,
      resumo: {
        numPagamento: pagamento.numPagamento,
        numCpf: pagamento.numCpf,
        competencia: pagamento.anoMesRef,
        vlrBruto: r.vlrBruto,
        vlrDesconto: r.vlrTotal,
        vlrTeto: r.vlrTeto,
        vlrContribuicao: r.vlrContribuicao,
        vlrLiquido: pagamento.vlrLiquido,
        descontos,
      },
    } as const;
  });
}
