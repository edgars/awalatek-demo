import type { PrismaClient } from "@/generated/prisma/client";
import {
  acumularGerado,
  acumularSelecao,
  deveRegistrarProgresso,
  mensagemProgresso,
  novoResumo,
  selecionarBeneficiario,
  type ResumoLote,
  type Selecao,
} from "@/domain/calculo/lote";
import { calcular, competenciaDaData, type ResultadoCalculo } from "@/domain/calculo/motor";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Caso de uso del lote mensual (BATCHPGT, FR-LOT-01..04). Orquesta dominio +
// Prisma sin lógica de negocio propia: la selección está en
// `domain/calculo/lote.ts` y los valores en `domain/calculo/motor.ts`.
// BATCHPGT no registra auditoría (aunque la cabecera diga "INC AUDITORIA").

export const MSG_LOTE_EM_EXECUCAO = "Lote já em execução.";
/** Usuario de inclusión de los pagos generados por el lote. */
export const USR_LOTE = "BATCH";
/** Status del pago recién generado (D15: dominio del código G/P/C/D/E). */
const SIT_GERADO = "G";
/** Reintentos si otro escritor tomó el mismo `numPagamento` (unique) entre la lectura y el insert. */
const TENTATIVAS_NUMERACAO = 5;

/** Resultado da transação de um beneficiário. */
type Passo =
  | { tipo: "sem-pagamento"; selecao: Exclude<Selecao, { acao: "calcular" }> }
  | { tipo: "gerado"; calc: ResultadoCalculo; numPagamento: number };

export type ResultadoLote = { ok: true; resumo: ResumoLote } | { ok: false; mensagem: string };

export interface OpcoesLote {
  /** Fecha de ejecución AAAAMMDD (`*DATN`); default = `hoje().data`. Define la competencia. */
  dtHoje?: number;
  /** Momento de la ejecución (para `hrGeracao`); default = ahora. */
  agora?: Date;
  db?: PrismaClient;
  /** Destino del registro de progreso (sin datos personales completos); default = consola. */
  log?: (linha: string) => void;
}

// Candado en memoria: impide dos lotes simultáneos en el mismo proceso. Se guarda
// en globalThis para sobrevivir a recargas del módulo en `next dev`.
const estado = globalThis as unknown as { __sifapLoteEmExecucao?: boolean };

export function loteEmExecucao(): boolean {
  return estado.__sifapLoteEmExecucao === true;
}

function ehUnicoViolado(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

async function maiorNumPagamento(db: PrismaClient): Promise<number> {
  const ultimo = await db.pagamento.aggregate({ _max: { numPagamento: true } });
  return ultimo._max.numPagamento ?? 0;
}

/**
 * FR-LOT — genera los pagos de la competencia de `dtHoje` para todos los
 * beneficiarios activos, en orden de CPF. Una transacción por beneficiario.
 * Devuelve `{ ok: false, mensagem: "Lote já em execução." }` si ya hay un lote
 * corriendo en este proceso. Errores inesperados se propagan.
 */
export async function ejecutarLotePagamentos(opcoes: OpcoesLote = {}): Promise<ResultadoLote> {
  // Verificación y toma del candado sin `await` en medio: atómicas en el event loop.
  if (loteEmExecucao()) return { ok: false, mensagem: MSG_LOTE_EM_EXECUCAO };
  estado.__sifapLoteEmExecucao = true;
  try {
    return { ok: true, resumo: await processar(opcoes) };
  } finally {
    estado.__sifapLoteEmExecucao = false;
  }
}

async function processar({ dtHoje, agora = new Date(), db = prisma, log = (l) => console.log(l) }: OpcoesLote): Promise<ResumoLote> {
  const momento = hoje(agora);
  const dataExecucao = dtHoje ?? momento.data;
  // FR-LOT-01 — RK-275ebe83e773 / RK-af5872bb5b6c / RK-8b46847de08b (BATCHPGT:108-110, en motor.ts).
  const competencia = competenciaDaData(dataExecucao);
  const resumo = novoResumo(competencia);

  // BATCHPGT:171-174 — mayor NUM-PAGTO existente; se incrementa en memoria por pago grabado.
  let seqPgto = await maiorNumPagamento(db);

  // FR-LOT-02 — READ BENEFICIARIO-V BY CPF (los sistemas downstream dependen de este orden).
  const beneficiarios = await db.beneficiario.findMany({
    orderBy: { numCpf: "asc" },
    select: {
      numCpf: true,
      sitBeneficiario: true,
      codPrograma: true,
      numDependentes: true,
      codRegiao: true,
      vlrRendaFamiliar: true,
      dtNascimento: true,
    },
  });

  let cpfAnterior: string | null = null;
  // LEGACY-QUIRK(D17): #FATOR-RND no se reinicia por beneficiario. Si la renta supera
  // 9.999,99 el factor queda con el del último beneficiario CALCULADO (los ignorados
  // escapan antes y no lo tocan); el primero del lote arrastra 0 (`undefined`).
  // TODO(review): probablemente es un bug del legado; confirmar con negocio (PRD D17).
  let fatorRendaAnterior: string | undefined;

  for (const b of beneficiarios) {
    resumo.processados += 1; // BATCHPGT:184
    const anterior = cpfAnterior;
    cpfAnterior = b.numCpf; // BATCHPGT:192 (solo tras pasar el control de duplicados; mismo efecto)

    for (let tentativa = 1; ; tentativa++) {
      try {
        const r = await db.$transaction(async (tx): Promise<Passo> => {
          const jaGerado =
            (await tx.pagamento.findFirst({ where: { numCpf: b.numCpf, anoMesRef: competencia }, select: { id: true } })) !== null;
          const programa = await tx.programaSocial.findUnique({
            where: { codPrograma: b.codPrograma },
            select: { codPrograma: true, sitPrograma: true, vlrBaseIndividual: true, fatorReajuste: true, tipoPrograma: true },
          });
          const selecao = selecionarBeneficiario({
            numCpf: b.numCpf,
            cpfAnterior: anterior,
            sitBeneficiario: b.sitBeneficiario,
            codPrograma: b.codPrograma,
            jaGerado,
            programa,
          });
          if (selecao.acao !== "calcular") return { tipo: "sem-pagamento", selecao };
          if (!programa) throw new Error("seleção inconsistente");

          // FR-LOT-03 — el mismo motor del cálculo individual (edad sobre el año de la competencia).
          const calc = calcular({
            vlrBase: programa.vlrBaseIndividual,
            fatorReajuste: programa.fatorReajuste,
            tipoPrograma: programa.tipoPrograma,
            codRegiao: b.codRegiao,
            numDependentes: b.numDependentes,
            renda: b.vlrRendaFamiliar,
            dtNascimento: b.dtNascimento,
            competencia,
            fatorRendaAnterior,
          });

          const numPagamento = seqPgto + 1; // BATCHPGT:323 — ADD 1 TO #SEQ-PGTO
          // BATCHPGT:324-336 — STORE PAGAMENTO-V ; END TRANSACTION.
          await tx.pagamento.create({
            data: {
              numPagamento,
              numCpf: b.numCpf,
              codPrograma: programa.codPrograma,
              anoMesRef: competencia,
              vlrBruto: calc.vlrBruto,
              vlrDescontoTotal: calc.vlrDesc,
              vlrLiquido: calc.vlrLiq,
              vlrAbono: calc.vlrAbono,
              tipoPgto: calc.tipoPgto,
              sitPagamento: SIT_GERADO,
              dtGeracao: dataExecucao,
              hrGeracao: momento.hora,
              dtInclusao: dataExecucao,
              hrInclusao: momento.hora,
              usrInclusao: USR_LOTE,
            },
          });
          return { tipo: "gerado", calc, numPagamento };
        });

        if (r.tipo === "sem-pagamento") {
          acumularSelecao(resumo, r.selecao);
          if (r.selecao.acao === "erro") log(r.selecao.mensagem);
        } else {
          seqPgto = r.numPagamento;
          fatorRendaAnterior = r.calc.fatorRenda; // D17: arrastre al siguiente calculado
          acumularGerado(resumo, r.calc);
          if (deveRegistrarProgresso(resumo.gerados)) log(mensagemProgresso(resumo.gerados, b.numCpf));
        }
        break;
      } catch (e) {
        // Otro escritor (cálculo individual, otro proceso) tomó el número: relee el máximo y reintenta.
        if (ehUnicoViolado(e) && tentativa < TENTATIVAS_NUMERACAO) {
          seqPgto = Math.max(seqPgto, await maiorNumPagamento(db));
          continue;
        }
        throw e;
      }
    }
  }

  return resumo;
}

/** Datos de la pantalla /lote: competencia actual y cuántos pagos ya existen en ella. */
export async function situacaoLote(db: PrismaClient = prisma, agora: Date = new Date()): Promise<{ competencia: number; pagamentosExistentes: number; emExecucao: boolean }> {
  const competencia = competenciaDaData(hoje(agora).data);
  const pagamentosExistentes = await db.pagamento.count({ where: { anoMesRef: competencia } });
  return { competencia, pagamentosExistentes, emExecucao: loteEmExecucao() };
}
