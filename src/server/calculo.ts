import type { PrismaClient } from "@/generated/prisma/client";
import { calcular, type TipoPgto } from "@/domain/calculo/motor";
import { verificarPrecondicoes } from "@/domain/calculo/precondicoes";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Caso de uso del cálculo individual (CALCBENF, FR-CAL-01..10). Orquesta dominio
// + Prisma sin lógica de negocio propia: las precondiciones están en
// `domain/calculo/precondicoes.ts` y los valores en `domain/calculo/motor.ts`.
// CALCBENF no registra auditoría: aquí no se llama a registrarEvento.

export const MSG_CALCULO_REALIZADO = "CALCULO REALIZADO COM SUCESSO";

/** Status del pago recién generado (D15: dominio del código G/P/C/D/E). */
const SIT_GERADO = "G";
/** Reintentos si otro escritor tomó el mismo `numPagamento` (unique) entre la lectura y el insert. */
const TENTATIVAS_NUMERACAO = 3;

export type ResumoCalculo = {
  numPagamento: number;
  numCpf: string;
  competencia: number;
  vlrBruto: number;
  vlrDesconto: number;
  vlrLiquido: number;
  vlr13: number;
  vlrAbono: number;
  tipoPgto: TipoPgto;
};

export type ResultadoCalculoIndividual = { ok: true; mensagem: string; resumo: ResumoCalculo } | { ok: false; mensagem: string };

function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}

function ehUnicoViolado(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

/**
 * FR-CAL — calcula el beneficio de `numCpf` en `competencia` (AAAAMM) y graba
 * el `Pagamento` (status G) en una transacción. Valores en centavos.
 */
export async function calcularBeneficioIndividual(
  numCpf: string,
  competencia: number,
  db: PrismaClient = prisma,
  agora: Date = new Date(),
): Promise<ResultadoCalculoIndividual> {
  const usuario = usuarioOperativo();
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await db.$transaction(async (tx) => {
        const beneficiario = /^\d{11}$/.test(numCpf) ? await tx.beneficiario.findUnique({ where: { numCpf } }) : null;
        const programa = beneficiario
          ? await tx.programaSocial.findUnique({ where: { codPrograma: beneficiario.codPrograma } })
          : null;
        const pre = verificarPrecondicoes({ competencia, beneficiario, programa });
        if (!pre.ok) return { ok: false, mensagem: pre.mensagem } as const;
        // verificarPrecondicoes garantiza ambos; el `if` solo estrecha los tipos.
        if (!beneficiario || !programa) throw new Error("precondições inconsistentes");

        // D17: el individual NO pasa fatorRendaAnterior (renta > 9.999,99 → factor 0).
        const r = calcular({
          vlrBase: programa.vlrBaseIndividual,
          fatorReajuste: programa.fatorReajuste,
          tipoPrograma: programa.tipoPrograma,
          codRegiao: beneficiario.codRegiao,
          numDependentes: beneficiario.numDependentes,
          renda: beneficiario.vlrRendaFamiliar,
          dtNascimento: beneficiario.dtNascimento,
          competencia,
        });

        // CALCBENF no asigna NUM-PAGTO; el esquema exige número único → máx. + 1
        // (mismo criterio que BATCHPGT, FR-LOT-01).
        const ultimo = await tx.pagamento.aggregate({ _max: { numPagamento: true } });
        const numPagamento = (ultimo._max.numPagamento ?? 0) + 1;
        const { data, hora } = hoje(agora);

        // LEGACY-QUIRK: CALCBENF (CALCBENF:155-274) no verifica si ya existe un pago
        // del CPF en la competencia ni el STATUS-PROG del programa (BATCHPGT sí lo
        // hace). Se replica: dos cálculos seguidos generan dos pagos.
        // TODO(review): confirmar con negocio si el individual debe impedir duplicados.
        await tx.pagamento.create({
          data: {
            numPagamento,
            numCpf: beneficiario.numCpf,
            codPrograma: programa.codPrograma,
            anoMesRef: competencia,
            vlrBruto: r.vlrBruto,
            vlrDescontoTotal: r.vlrDesc,
            vlrLiquido: r.vlrLiq,
            vlrAbono: r.vlrAbono,
            tipoPgto: r.tipoPgto,
            sitPagamento: SIT_GERADO,
            dtGeracao: data,
            hrGeracao: hora,
            dtInclusao: data,
            hrInclusao: hora,
            usrInclusao: usuario,
          },
        });

        return {
          ok: true,
          mensagem: MSG_CALCULO_REALIZADO,
          resumo: {
            numPagamento,
            numCpf: beneficiario.numCpf,
            competencia,
            vlrBruto: r.vlrBruto,
            vlrDesconto: r.vlrDesc,
            vlrLiquido: r.vlrLiq,
            vlr13: r.vlr13,
            vlrAbono: r.vlrAbono,
            tipoPgto: r.tipoPgto,
          },
        } as const;
      });
    } catch (e) {
      if (ehUnicoViolado(e) && tentativa < TENTATIVAS_NUMERACAO) continue;
      throw e;
    }
  }
}
