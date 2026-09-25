import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  acumularDecisao,
  chaveAuditoria,
  decidirConciliacao,
  descricaoConciliado,
  DESCRICAO_DIVERGENCIA,
  linhasArquivo,
  MSG_CONCILIACAO_INTERROMPIDA,
  novoResumo,
  numPgtoPesquisavel,
  parseLinhaCnab,
  TABELA_PAGAMENTO,
  USUARIO_BATCH,
  valorN92,
  type DecisaoConciliacao,
  type RegistroCnab,
  type ResumoConciliacao,
} from "@/domain/cnab240";
import { hoje } from "@/domain/legacyDate";
import { registrarEvento } from "@/server/auditoria";
import { prisma } from "@/server/db";

// Caso de uso de la conciliación del retorno CNAB 240 (BATCHCON, FR-CNB-01..04).
// Orquesta dominio (`domain/cnab240.ts`) + Prisma sin lógica de negocio propia.
// Una transacción por registro de detalle: update del pago + evento de auditoría
// (el legado hacía dos END TRANSACTION separados; se sigue la arquitectura).
// No toca dtConciliacao / sitConciliacao / vlrConciliado (el legado tampoco).
// TODO(review): re-ejecutar el mismo archivo vuelve a aplicar los updates y graba
// nuevos eventos CO/DV; no se mira el sitPagamento actual (el legado hace lo mismo).

export const MSG_CONCILIACAO_EM_EXECUCAO = "Conciliação já em execução.";

/**
 * `ok: false` sin `resumo`: no corrió (ya había una en ejecución).
 * `ok: false` con `resumo`: interrumpida por un error inesperado; `resumo` es parcial
 * (los registros anteriores al error quedan grabados).
 */
export type ResultadoConciliacao =
  | { ok: true; resumo: ResumoConciliacao }
  | { ok: false; mensagem: string; resumo?: ResumoConciliacao };

export interface EntradaConciliacao {
  /** Competencia AAAAMM (`#COMPETENCIA`). */
  competencia: number;
  /** Contenido del archivo de retorno (texto, líneas de 240 posiciones). */
  conteudo: string;
}

export interface OpcoesConciliacao {
  db?: PrismaClient;
  /** Momento de la ejecución (`*DATN`/`*TIMN`, tomado una sola vez); default = ahora. */
  agora?: Date;
}

// Candado en memoria: impide dos conciliaciones simultáneas en el mismo proceso. Se
// guarda en globalThis para sobrevivir a recargas del módulo en `next dev`.
const estado = globalThis as unknown as { __sifapConciliacaoEmExecucao?: boolean };

export function conciliacaoEmExecucao(): boolean {
  return estado.__sifapConciliacaoEmExecucao === true;
}

function registrarFalha(e: unknown): void {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[conciliacao] erro inesperado:", nome, typeof codigo === "string" ? codigo : "");
}

/**
 * FR-CNB — concilia el retorno CNAB 240 contra los pagos de la competencia.
 * Devuelve `{ ok: false, mensagem: "Conciliação já em execução." }` si ya hay una
 * corriendo en este proceso. Un error inesperado al procesar un registro detiene la
 * corrida y devuelve `{ ok: false, mensagem, resumo }` con el resumen parcial.
 */
export async function conciliarRetorno(entrada: EntradaConciliacao, opcoes: OpcoesConciliacao = {}): Promise<ResultadoConciliacao> {
  // Verificación y toma del candado sin `await` en medio: atómicas en el event loop.
  if (conciliacaoEmExecucao()) return { ok: false, mensagem: MSG_CONCILIACAO_EM_EXECUCAO };
  estado.__sifapConciliacaoEmExecucao = true;
  try {
    return await processar(entrada, opcoes);
  } finally {
    estado.__sifapConciliacaoEmExecucao = false;
  }
}

async function processar({ competencia, conteudo }: EntradaConciliacao, { db = prisma, agora = new Date() }: OpcoesConciliacao): Promise<ResultadoConciliacao> {
  // BATCHCON:79-80 — *DATN / *TIMN una sola vez: todos los eventos con el mismo momento.
  const momento = hoje(agora);
  const resumo = novoResumo(competencia);

  for (const linha of linhasArquivo(conteudo)) {
    resumo.lidos += 1; // BATCHCON:108 — antes del filtro de tipo (cuenta header y trailer)
    const reg = parseLinhaCnab(linha);
    if (!reg) continue; // RK-7747831dca9a (en el dominio)
    resumo.detalhes += 1;

    let decisao: DecisaoConciliacao;
    try {
      decisao = await db.$transaction((tx) => conciliarRegistro(tx, reg, competencia, momento));
    } catch (e) {
      // El legado abendaría: se detiene sin perder el resumen de lo ya grabado.
      registrarFalha(e);
      return { ok: false, mensagem: MSG_CONCILIACAO_INTERROMPIDA, resumo };
    }
    acumularDecisao(resumo, reg, decisao);
  }

  return { ok: true, resumo };
}


/** Un registro de detalle dentro de su transacción: búsqueda, decisión, update y auditoría. */
async function conciliarRegistro(tx: Prisma.TransactionClient, reg: RegistroCnab, competencia: number, momento: { data: number; hora: number }): Promise<DecisaoConciliacao> {
  const p = numPgtoPesquisavel(reg.numPgto)
    ? await tx.pagamento.findUnique({
        where: { numPagamento: reg.numPgto },
        select: { numPagamento: true, numCpf: true, anoMesRef: true, vlrLiquido: true },
      })
    : null;
  const d = decidirConciliacao(reg, p, competencia);
  if (d.tipo === "nao-encontrado") return d; // sin auditoría

  const chave = chaveAuditoria(d.numPagamento);
  if (d.tipo === "divergente") {
    // GRAVA-AUDITORIA-DIVERG (BATCHCON:253-270): el pago NO se actualiza.
    await registrarEvento(
      {
        acao: "DV",
        tabela: TABELA_PAGAMENTO,
        chave,
        usuario: USUARIO_BATCH,
        descricao: DESCRICAO_DIVERGENCIA,
        // TODO(review): formato N9.2 → A60 no fijado (2 decimales con punto).
        valorAnterior: valorN92(d.vlrLiquido),
        valorPosterior: valorN92(d.vlrRetorno),
        momento,
      },
      tx,
    );
    return d;
  }

  if (d.atualizacao) {
    await tx.pagamento.update({ where: { numPagamento: d.numPagamento }, data: d.atualizacao });
  }
  // GRAVA-AUDITORIA-CONC (BATCHCON:238-251), también con código desconocido.
  await registrarEvento(
    {
      acao: "CO",
      tabela: TABELA_PAGAMENTO,
      chave,
      usuario: USUARIO_BATCH,
      descricao: descricaoConciliado(reg.codRet),
      // TODO(review): el legado no limpia VLR-ANTERIOR/VLR-NOVO en CO y podría
      // arrastrar los del DV anterior; no se replica: se graban nulos.
      valorAnterior: null,
      valorPosterior: null,
      momento,
    },
    tx,
  );
  return d;
}
