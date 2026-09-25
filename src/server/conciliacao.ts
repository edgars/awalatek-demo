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
  type QuirksConciliacao,
  type RegistroCnab,
  type ResumoConciliacao,
} from "@/domain/cnab240";
import { hoje } from "@/domain/legacyDate";
import { QUIRKS_PADRAO } from "@/domain/quirks";
import { registrarEvento } from "@/server/auditoria";
import { registrarFalha } from "@/lib/falhas";
import { prisma } from "@/server/db";
import { comLock, LOCK_CONCILIACAO, renovadorPorPassos, type LockAdquirido } from "@/server/processoLock";
import { comRetry, ehColisaoNumAuditoria } from "@/server/unicidade";

// Caso de uso de la conciliación del retorno CNAB 240 (BATCHCON, FR-CNB-01..04).
// Orquesta dominio (`domain/cnab240.ts`) + Prisma sin lógica de negocio propia.
// Una transacción por registro de detalle: update del pago + evento de auditoría
// (el legado hacía dos END TRANSACTION separados; se sigue la arquitectura).
// No toca dtConciliacao / sitConciliacao / vlrConciliado (el legado tampoco).
// TODO(review): re-ejecutar el mismo archivo vuelve a aplicar los updates y graba
// nuevos eventos CO/DV; no se mira el sitPagamento actual (el legado hace lo mismo).

export const MSG_CONCILIACAO_EM_EXECUCAO = "Conciliação já em execução.";
/** El candado se perdió a mitad de la corrida (expiró y otro lo tomó, o se liberó a la fuerza). */
export const MSG_CONCILIACAO_CANDADO_PERDIDO = "CONCILIACAO INTERROMPIDA: CANDADO PERDIDO";
/** Renovación del candado cada N líneas leídas. */
const RENOVAR_LOCK_A_CADA = 100;

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
  /** Correcciones activas (D23), leídas una vez por la acción; default = legado. */
  quirks?: QuirksConciliacao;
  /** Candado: expiración (ms) y renovación cada N líneas; default = entorno / 100. Para tests. */
  lock?: { expiracaoMs?: number; renovarACada?: number };
}

/** Reintentos si otro escritor tomó el mismo `numAuditoria` (unique) dentro de la transacción del registro. */
const TENTATIVAS_NUMERACAO = 5;

/**
 * FR-CNB — concilia el retorno CNAB 240 contra los pagos de la competencia.
 * Devuelve `{ ok: false, mensagem: "Conciliação já em execução." }` si ya hay una
 * corriendo en cualquier proceso (candado ProcessoLock). Un error inesperado al procesar un registro detiene la
 * corrida y devuelve `{ ok: false, mensagem, resumo }` con el resumen parcial.
 */
export async function conciliarRetorno(entrada: EntradaConciliacao, opcoes: OpcoesConciliacao = {}): Promise<ResultadoConciliacao> {
  // Candado entre procesos en la base; se libera en `finally` (comLock). Un candado
  // huérfano (proceso caído) expira según SIFAP_LOCK_EXPIRACAO_MIN.
  // Se renueva cada RENOVAR_LOCK_A_CADA líneas; si se perdió, se detiene.
  return comLock<ResultadoConciliacao>(
    opcoes.db ?? prisma,
    LOCK_CONCILIACAO,
    () => ({ ok: false, mensagem: MSG_CONCILIACAO_EM_EXECUCAO }),
    (lock) => processar(entrada, opcoes, lock),
    { agora: opcoes.agora, expiracaoMs: opcoes.lock?.expiracaoMs },
  );
}

async function processar(
  { competencia, conteudo }: EntradaConciliacao,
  { db = prisma, agora = new Date(), quirks = QUIRKS_PADRAO, lock: cfgLock }: OpcoesConciliacao,
  lock: LockAdquirido,
): Promise<ResultadoConciliacao> {
  const manterLock = renovadorPorPassos(lock, cfgLock?.renovarACada ?? RENOVAR_LOCK_A_CADA, "conciliacao");
  // BATCHCON:79-80 — *DATN / *TIMN una sola vez: todos los eventos con el mismo momento.
  const momento = hoje(agora);
  const resumo = novoResumo(competencia);

  for (const linha of linhasArquivo(conteudo)) {
    // Renovación periódica del candado: si se perdió, otra conciliación puede estar corriendo.
    if (!(await manterLock(resumo.lidos))) return { ok: false, mensagem: MSG_CONCILIACAO_CANDADO_PERDIDO, resumo };
    resumo.lidos += 1; // BATCHCON:108 — antes del filtro de tipo (cuenta header y trailer)
    const reg = parseLinhaCnab(linha);
    if (!reg) continue; // RK-7747831dca9a (en el dominio)
    resumo.detalhes += 1;

    let decisao: DecisaoConciliacao;
    try {
      // P2002 sobre numAuditoria: la transacción del registro ya se revirtió entera; se repite (relee el máximo).
      decisao = await comRetry(
        () => db.$transaction((tx) => conciliarRegistro(tx, reg, competencia, momento, quirks)),
        ehColisaoNumAuditoria,
        TENTATIVAS_NUMERACAO,
      );
    } catch (e) {
      // El legado abendaría: se detiene sin perder el resumen de lo ya grabado.
      registrarFalha("conciliacao", "erro inesperado", e);
      return { ok: false, mensagem: MSG_CONCILIACAO_INTERROMPIDA, resumo };
    }
    acumularDecisao(resumo, reg, decisao);
  }

  return { ok: true, resumo };
}

/** Un registro de detalle dentro de su transacción: búsqueda, decisión, update y auditoría. */
async function conciliarRegistro(
  tx: Prisma.TransactionClient,
  reg: RegistroCnab,
  competencia: number,
  momento: { data: number; hora: number },
  quirks: QuirksConciliacao,
): Promise<DecisaoConciliacao> {
  const p = numPgtoPesquisavel(reg.numPgto)
    ? await tx.pagamento.findUnique({
        where: { numPagamento: reg.numPgto },
        select: { numPagamento: true, numCpf: true, anoMesRef: true, vlrLiquido: true },
      })
    : null;
  const d = decidirConciliacao(reg, p, competencia, quirks);
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
