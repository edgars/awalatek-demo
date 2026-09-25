import type { PrismaClient } from "@/generated/prisma/client";
import { calcularDescontos, type DescontoCadastrado } from "@/domain/calculo/descontos";
import { calcularLiquido } from "@/domain/calculo/motor";
import { MSG_PAGAMENTO_NAO_ENCONTRADO, verificarBeneficiario, verificarPagamento } from "@/domain/calculo/precondicoesDescontos";
import { hoje } from "@/domain/legacyDate";
import { corrige, QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";
import { prisma } from "@/server/db";

// Caso de uso del recálculo de descuentos de un pago (CALCDSCT, FR-DSC-01..06).
// Orquesta dominio + Prisma sin lógica de negocio propia: las precondiciones
// están en `domain/calculo/precondicoesDescontos.ts` y los valores en
// `domain/calculo/descontos.ts`. CALCDSCT no registra auditoría.

export const MSG_DESCONTOS_CALCULADOS = "DESCONTOS CALCULADOS";
/**
 * El total no cabe en la columna Int (centavos) del pago. En el legado VLR-DESCONTO
 * es N9.2 y tampoco cabría; no se graba nada y se informa en claro.
 */
export const MSG_DESCONTO_EXCEDE_LIMITE = "VALOR DE DESCONTO EXCEDE O LIMITE";

/** CORRECAO(D13): el líquido de un pago ya enviado/pagado no se toca. */
export function mensagemLiquidoNaoRecalculado(sitPagamento: string): string {
  return `LIQUIDO NAO RECALCULADO: PAGAMENTO COM STATUS ${sitPagamento}`;
}

/** Status del pago recién generado (aún no enviado): solo en él se recalcula el líquido (D13). */
const SIT_GERADO = "G";

/** Mayor valor de una columna Int de la base (Int32). */
const INT32_MAX = 2_147_483_647;

/** Situación de cada descuento registrado del beneficiario en el recálculo. */
export type SituacaoDesconto = "aplicado" | "ignorado" | "foraDeVigencia";

export type DescontoResumo = {
  /** `occurrence` del descuento registrado (BeneficiarioDesconto). */
  occurrence: number;
  tipoDesconto: string;
  /** Valor sumado al total, en centavos (0 si no se aplicó). */
  vlrItem: number;
  /** VLR-DSCT registrado (valor fijo), en centavos; 0 = usa el porcentaje. */
  vlrDesconto: number;
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
  /** Líquido del pago: SIN cambios en modo legado (D13); recalculado con la corrección D13. */
  vlrLiquido: number;
  /** CORRECAO(D13): presente (true) solo si el líquido se recalculó y se grabó. */
  liquidoRecalculado?: true;
  /** CORRECAO(D13): "LIQUIDO NAO RECALCULADO: …" cuando el pago no está en status G. */
  avisoLiquido?: string;
  /** Descuentos registrados en orden de occurrence. */
  descontos: DescontoResumo[];
};

export interface OpcoesRecalculo {
  db?: PrismaClient;
  /** Momento de la ejecución; default = ahora. */
  agora?: Date;
  /** Correcciones activas (D13), leídas una vez por la acción; default = legado. */
  quirks?: Pick<Quirks, "corrigidos">;
}

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
 * `quirks`: correcciones activas (D13), leídas por la acción; default = legado.
 */
export async function recalcularDescontos(
  numCpf: string,
  numPagamento: number,
  { db = prisma, agora = new Date(), quirks = QUIRKS_PADRAO }: OpcoesRecalculo = {},
): Promise<ResultadoRecalculo> {
  return db.$transaction(async (tx) => {
    // Orden del legado: primero el pago (CALCDSCT:75/:82), luego el beneficiario (:91).
    // Fuera del rango Int32 no hay pago posible: "no encontrado" sin consultar.
    if (!Number.isInteger(numPagamento) || numPagamento < 1 || numPagamento > INT32_MAX) {
      return { ok: false, mensagem: MSG_PAGAMENTO_NAO_ENCONTRADO } as const;
    }
    const pagamento = await tx.pagamento.findUnique({ where: { numPagamento } });
    const prePagamento = verificarPagamento(numCpf, pagamento);
    if (!prePagamento.ok) return { ok: false, mensagem: prePagamento.mensagem } as const;
    const beneficiario = await tx.beneficiario.findUnique({ where: { numCpf } });
    const preBeneficiario = verificarBeneficiario(beneficiario);
    if (!preBeneficiario.ok) return { ok: false, mensagem: preBeneficiario.mensagem } as const;
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
    if (r.vlrTotal > INT32_MAX) return { ok: false, mensagem: MSG_DESCONTO_EXCEDE_LIMITE } as const;
    const aplicados = r.itens.filter((i) => i.aplicado);

    // LEGACY-QUIRK(D13): solo se actualiza el descuento del pago; vlrLiquido NO se recalcula.
    // CORRECAO(D13): con la corrección activa se recalcula y graba vlrLiquido con la
    // fórmula del motor (FR-CAL-10: bruto − descuento, mínimo 0; el bruto ya incluye
    // 13.º y abono). El 3 % plano del motor no cambia.
    // - `r.vlrTotal` es el total de CALCDSCT: contribución social progresiva + descuentos
    //   registrados, con el tope del 30 % (D2). Es lo que se graba en vlrDescontoTotal,
    //   así que el líquido queda coherente con ese campo.
    // - La base es el bruto ORIGINAL (vlrBruto). CALCCORR guarda el valor corregido por
    //   IPCA aparte (vlrCorrecao/indCorrigido) y nunca cambió vlrLiquido: no se usa aquí.
    // - Solo pagos en status G (generados, aún no enviados): el líquido de un pago ya
    //   enviado/pagado/devuelto no se cambia y se devuelve un aviso.
    const corrigeD13 = corrige(quirks, "D13");
    const recalculaLiquido = corrigeD13 && pagamento.sitPagamento === SIT_GERADO;
    const avisoLiquido = corrigeD13 && !recalculaLiquido ? mensagemLiquidoNaoRecalculado(pagamento.sitPagamento) : undefined;
    const vlrLiquido = recalculaLiquido ? calcularLiquido(pagamento.vlrBruto, r.vlrTotal) : pagamento.vlrLiquido;
    await tx.pagamento.update({
      where: { id: pagamento.id },
      data: {
        vlrDescontoTotal: r.vlrTotal,
        ...(recalculaLiquido ? { vlrLiquido } : {}),
        dtUltAlteracao: data,
        hrUltAlteracao: hora,
        usrUltAlteracao: usuario,
      },
    });
    // LEGACY-QUIRK(D14): CALCDSCT no graba detalle por ítem (solo UPDATE PAGAMENTO-V.VLR-DESCONTO).
    // Las filas PagamentoDesconto son el detalle del modelo nuevo: una por descuento
    // APLICADO, con el valor propio de cada ítem (#VLR-DSCT-ITEM) y reemplazo completo.
    // Por eso, cuando el tope del 30 % recorta el total (D2), la suma de las filas puede
    // superar vlrDescontoTotal: el total del pago es el valor legado, las filas no.
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
        vlrDesconto: d.vlrDesconto,
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
        vlrLiquido,
        descontos,
        ...(recalculaLiquido ? { liquidoRecalculado: true as const } : {}),
        ...(avisoLiquido ? { avisoLiquido } : {}),
      },
    } as const;
  });
}
