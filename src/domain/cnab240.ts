// Conciliación del retorno CNAB 240 del Banco do Brasil (BATCHCON, FR-CNB-01..04).
// Dominio puro: parse posicional de una línea, decisión de conciliación, mensajes
// literales del legado y acumuladores del resumen. La orquestación (búsqueda del
// pago, update y auditoría en una transacción por registro) está en
// `src/server/conciliacao.ts`. El bloque comentado del Banco Real (BATCHCON:206-224,
// banco 356) está descontinuado y NO se porta.

import { normalizaCpfNumerico } from "./cpf";
import { deCentavos } from "./money";

/** Largo del registro CNAB 240 (`#REG-CNAB (A240)`). */
export const LARGO_REGISTRO = 240;

/** Mayor `Int` que acepta Prisma: un nº de documento mayor no puede existir en `numPagamento`. */
const MAX_INT32 = 2_147_483_647;

/** Campos de un registro de detalle (tipo 3), ya convertidos como en el legado. */
export interface RegistroCnab {
  /** `#CNAB-CPF (A11)` tal cual viene en el archivo (para los mensajes). */
  cnabCpf: string;
  /** `#CNAB-NUM-DOC (A10)` tal cual viene en el archivo (para los mensajes). */
  cnabNumDoc: string;
  /** `#CPF-NUM (N11)` como String(11) con ceros a la izquierda. */
  cpfNum: string;
  /** `#NUM-PGTO (N10)`. */
  numPgto: number;
  /** `#VLR-RETORNO` en centavos (valor del archivo ÷ 100, en reales). */
  vlrRetorno: number;
  /** `#DT-PGTO (N8)`, sin conversión. */
  dtPgto: number;
  /** `#COD-RET (A2)`. */
  codRet: string;
}

/** `SUBSTR(#REG-CNAB, inicio, largo)` 1-based sobre la línea rellenada con blancos. */
function substr(reg: string, inicio: number, largo: number): string {
  return reg.slice(inicio - 1, inicio - 1 + largo);
}

/**
 * MOVE de un campo alfanumérico a uno numérico (N): blancos → 0.
 * TODO(review): con contenido no numérico el legado abortaría el programa (error de
 * conversión de Natural); aquí se toma como 0 para no interrumpir la corrida (el
 * registro termina como "NAO ENCONTRADO" o divergente, según el campo).
 */
function numerico(campo: string): number {
  const s = campo.trim();
  if (s === "") return 0;
  if (!/^\d+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : 0;
}

/**
 * Divide el contenido del archivo en registros, como `READ WORK FILE ... TYPE 'ASCII'`.
 * Las líneas vacías del final (salto de línea al final del archivo) no son registros;
 * las intermedias sí (se leen y se descartan por tipo).
 */
export function linhasArquivo(conteudo: string): string[] {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/);
  while (linhas.length > 0 && (linhas.at(-1) ?? "").trim() === "") linhas.pop();
  return linhas;
}

/**
 * FR-CNB-01 — parsea una línea del retorno. Devuelve `null` si no es un registro de
 * detalle (header/trailer). Una línea de largo ≠ 240 se procesa igual: los `SUBSTR`
 * operan sobre la línea rellenada con blancos (o cortada) a 240 posiciones.
 */
export function parseLinhaCnab(linha: string): RegistroCnab | null {
  const reg = linha.padEnd(LARGO_REGISTRO, " ").slice(0, LARGO_REGISTRO);
  // RK-7747831dca9a (BATCHCON:116) — IF #CNAB-TIPO-REG NE '3' → ESCAPE TOP (solo detalle).
  if (substr(reg, 8, 1) !== "3") return null;

  const cnabCpf = substr(reg, 44, 11);
  const cnabVlr = substr(reg, 120, 15);
  const cnabDtPgto = substr(reg, 140, 8);
  const cnabCodRet = substr(reg, 231, 2);
  const cnabNumDoc = substr(reg, 74, 10);

  // RK-1121c69fbbdb (BATCHCON:132) — COMPUTE #VLR-RETORNO = #VLR-RETORNO / 100: el campo
  // viene en centavos. ÷100 da exactamente 2 decimales, así que el valor en centavos es
  // el entero del campo (sin float); `valorN92` lo muestra en reales (÷100).
  const vlrRetorno = numerico(cnabVlr);

  return {
    cnabCpf,
    cnabNumDoc,
    cpfNum: String(numerico(cnabCpf)).padStart(11, "0"), // MOVE #CNAB-CPF TO #CPF-NUM (N11)
    numPgto: numerico(cnabNumDoc),
    vlrRetorno,
    // TODO(review): la fecha se graba tal cual viene (el BB puede enviarla DDMMAAAA y
    // DT-PAGAMENTO es AAAAMMDD); el legado no valida ni reordena (BATCHCON:134, 175).
    dtPgto: numerico(cnabDtPgto),
    codRet: cnabCodRet,
  };
}

/** Datos del pago leídos por `FIND PAGAMENTO-V WITH NUM-PAGTO = #NUM-PGTO`. */
export interface PagamentoConciliacao {
  numPagamento: number;
  numCpf: string;
  anoMesRef: number;
  /** Centavos. */
  vlrLiquido: number;
}

/** El nº de documento puede buscarse en `numPagamento` (Int de 32 bits). */
export function numPgtoPesquisavel(numPgto: number): boolean {
  return numPgto > 0 && numPgto <= MAX_INT32;
}

/**
 * FR-CNB-02 — correspondencia: el pago encontrado por número debe tener el mismo CPF y
 * la misma competencia (comparación numérica).
 */
export function pagamentoCorresponde(p: PagamentoConciliacao | null, reg: RegistroCnab, competencia: number): boolean {
  if (!p) return false;
  // RK-3d6fe48b2bba (BATCHCON:140) — IF CPF-BENEF = #CPF-NUM AND COMPETENCIA = #COMPETENCIA → #FOUND.
  return normalizaCpfNumerico(p.numCpf) === reg.cpfNum && p.anoMesRef === competencia;
}

/** Diferencia absoluta en centavos entre el líquido SIFAP y el valor del banco. */
export function diferencaCentavos(vlrLiquido: number, vlrRetorno: number): number {
  // RK-8649d421b7d9 (BATCHCON:155) — COMPUTE #DIFF = VLR-LIQUIDO - #VLR-RETORNO.
  let diff = vlrLiquido - vlrRetorno;
  // RK-25bb549502ed (BATCHCON:156) — IF #DIFF < 0
  if (diff < 0) {
    // RK-46ead0f200b6 (BATCHCON:157) — COMPUTE #DIFF = #DIFF * -1 (valor absoluto).
    diff = diff * -1;
  }
  return diff;
}

/** Umbral de divergencia: 0,01 (1 centavo). */
export const LIMITE_DIVERGENCIA_CENTAVOS = 1;

/** Divergencia de valor entre SIFAP y el banco. */
export function ehDivergente(diffCentavos: number): boolean {
  // RK-8c11d37225a3 (BATCHCON:160) — IF #DIFF > 0.01 → divergente (estricto: 0,01 exacto concilia).
  return diffCentavos > LIMITE_DIVERGENCIA_CENTAVOS;
}

/** Actualización del pago por código de retorno (sin divergencia). */
export type AtualizacaoPagamento =
  | { sitPagamento: "P"; dtPagamento: number; codBanco: "1"; codRetornoBanco: string }
  | { sitPagamento: "D" | "E"; codRetornoBanco: string };

/** Status del pago según el código de retorno; `null` = código desconocido (sin update). */
export function atualizacaoPorCodigo(codRet: string, dtPgto: number): AtualizacaoPagamento | null {
  // RK-9af86fb5374c (BATCHCON:171) — DECIDE ON FIRST VALUE OF #COD-RET:
  switch (codRet) {
    case "00": // pago: status P + fecha de pago + banco 1 + código
      return { sitPagamento: "P", dtPagamento: dtPgto, codBanco: "1", codRetornoBanco: codRet };
    case "01": // devuelto: sin fecha ni banco
      return { sitPagamento: "D", codRetornoBanco: codRet };
    case "02": // estornado: sin fecha ni banco
      return { sitPagamento: "E", codRetornoBanco: codRet };
    default: // NONE → "COD RETORNO DESCONHECIDO: …", sin update (igual cuenta como conciliado)
      return null;
  }
}

export type DecisaoConciliacao =
  | { tipo: "nao-encontrado"; mensagem: string }
  | { tipo: "divergente"; mensagem: string; numPagamento: number; vlrLiquido: number; vlrRetorno: number }
  | {
      tipo: "conciliado";
      numPagamento: number;
      atualizacao: AtualizacaoPagamento | null;
      /** Mensaje de código desconocido (solo cuando `atualizacao` es `null`). */
      mensagem: string | null;
    };

/** FR-CNB-02..04 — decide qué hacer con un registro de detalle. */
export function decidirConciliacao(reg: RegistroCnab, p: PagamentoConciliacao | null, competencia: number): DecisaoConciliacao {
  // RK-31d94b6dc065 (BATCHCON:146) — IF NOT #FOUND → ADD 1 NAO-ENCONTRADOS, mensaje, ESCAPE TOP.
  if (!p || !pagamentoCorresponde(p, reg, competencia)) {
    return { tipo: "nao-encontrado", mensagem: mensagemNaoEncontrado(reg.cnabCpf, reg.cnabNumDoc) };
  }
  if (ehDivergente(diferencaCentavos(p.vlrLiquido, reg.vlrRetorno))) {
    return {
      tipo: "divergente",
      mensagem: mensagemDivergencia(reg.cnabCpf, p.vlrLiquido, reg.vlrRetorno),
      numPagamento: p.numPagamento,
      vlrLiquido: p.vlrLiquido,
      vlrRetorno: reg.vlrRetorno,
    };
  }
  const atualizacao = atualizacaoPorCodigo(reg.codRet, reg.dtPgto);
  return {
    tipo: "conciliado",
    numPagamento: p.numPagamento,
    atualizacao,
    mensagem: atualizacao ? null : mensagemCodigoDesconhecido(reg.codRet, reg.cnabCpf),
  };
}

// ---------------------------------------------------------------------------
// Mensajes literales. El legado los arma con COMPRESS (un blanco entre operandos,
// sin blancos finales de los alfanuméricos ni ceros a la izquierda de los numéricos).
// TODO(review): la separación exacta del COMPRESS (blanco tras "CPF=", doble blanco
// antes de " DOC=") no está fijada por el PRD; se usa la forma del PRD
// ("CPF=… DOC=…"). Los prefijos literales no se tocan.

/** Texto de un campo alfanumérico en un COMPRESS: sin blancos finales. */
const alfa = (s: string) => s.trimEnd();

/**
 * Valor N9.2 en los mensajes y en la auditoría: 2 decimales con punto, sin ceros a la
 * izquierda (`10000` centavos → "100.00"). TODO(review): formato N→A no fijado.
 */
export function valorN92(centavos: number): string {
  return deCentavos(centavos).toFixed(2);
}

/** "NAO ENCONTRADO: CPF=<cpf> DOC=<doc>" (BATCHCON:148). */
export function mensagemNaoEncontrado(cnabCpf: string, cnabNumDoc: string): string {
  return `NAO ENCONTRADO: CPF=${alfa(cnabCpf)} DOC=${alfa(cnabNumDoc)}`;
}

/** "DIVERGENCIA: CPF=<cpf> SIFAP=<liquido> BANCO=<retorno>" (BATCHCON:162-164). */
export function mensagemDivergencia(cnabCpf: string, vlrLiquido: number, vlrRetorno: number): string {
  return `DIVERGENCIA: CPF=${alfa(cnabCpf)} SIFAP=${valorN92(vlrLiquido)} BANCO=${valorN92(vlrRetorno)}`;
}

/** "COD RETORNO DESCONHECIDO: <cod> CPF=<cpf>" (BATCHCON:196-197). */
export function mensagemCodigoDesconhecido(codRet: string, cnabCpf: string): string {
  const cod = alfa(codRet);
  return `COD RETORNO DESCONHECIDO:${cod ? ` ${cod}` : ""} CPF=${alfa(cnabCpf)}`;
}

// ---------------------------------------------------------------------------
// Auditoría (GRAVA-AUDITORIA-CONC / -DIVERG, BATCHCON:238-270).

export const USUARIO_BATCH = "BATCH";
export const TABELA_PAGAMENTO = "PAGAMENTO";
export const DESCRICAO_DIVERGENCIA = "DIVERGENCIA VALOR SIFAP X BANCO";

/** "CONCILIADO COD RET=<cod>" (BATCHCON:248). TODO(review): separación del COMPRESS. */
export function descricaoConciliado(codRet: string): string {
  return `CONCILIADO COD RET=${alfa(codRet)}`;
}

/** CHAVE-REF: `#NUM-PGTO` (N10 → A20). TODO(review): formato N→A (sin ceros a la izquierda). */
export function chaveAuditoria(numPagamento: number): string {
  return String(numPagamento);
}

// ---------------------------------------------------------------------------
// Resumen (BATCHCON:227-235).

export const TITULO_RESUMO = "BATCHCON - RESUMO CONCILIACAO";
export const ROTULOS_RESUMO = {
  lidos: "REGISTROS LIDOS........:",
  conciliados: "CONCILIADOS............:",
  divergentes: "DIVERGENTES............:",
  naoEncontrados: "NAO ENCONTRADOS........:",
  auditoria: "REGISTROS AUDITORIA....:",
} as const;
export const AVISO_SEM_DETALHE = "arquivo sem registros de detalhe";

export interface DivergenciaResumo {
  numPagamento: number;
  cpf: string;
  /** Centavos. */
  vlrSifap: number;
  /** Centavos. */
  vlrBanco: number;
}

export interface NaoEncontradoResumo {
  cpf: string;
  documento: string;
}

export interface CodigoDesconhecidoResumo {
  numPagamento: number;
  cpf: string;
  codRet: string;
}

export interface ResumoConciliacao {
  competencia: number;
  lidos: number;
  conciliados: number;
  divergentes: number;
  naoEncontrados: number;
  auditoria: number;
  /** Registros de detalhe (tipo 3) leídos; 0 → aviso "arquivo sem registros de detalhe". */
  detalhes: number;
  /** Mensajes del legado (WRITE #MSG) en orden, completos (no van al log ni a la UI). */
  mensagens: string[];
  divergencias: DivergenciaResumo[];
  listaNaoEncontrados: NaoEncontradoResumo[];
  codigosDesconhecidos: CodigoDesconhecidoResumo[];
}

export function novoResumo(competencia: number): ResumoConciliacao {
  return {
    competencia,
    lidos: 0,
    conciliados: 0,
    divergentes: 0,
    naoEncontrados: 0,
    auditoria: 0,
    detalhes: 0,
    mensagens: [],
    divergencias: [],
    listaNaoEncontrados: [],
    codigosDesconhecidos: [],
  };
}

/** Acumula la decisión de un registro de detalle ya grabado. */
export function acumularDecisao(r: ResumoConciliacao, reg: RegistroCnab, d: DecisaoConciliacao): void {
  if (d.tipo === "nao-encontrado") {
    r.naoEncontrados += 1;
    r.mensagens.push(d.mensagem);
    r.listaNaoEncontrados.push({ cpf: alfa(reg.cnabCpf), documento: alfa(reg.cnabNumDoc) });
    return;
  }
  r.auditoria += 1; // ADD 1 TO #QTD-AUDIT (BATCHCON:240/255)
  if (d.tipo === "divergente") {
    r.divergentes += 1;
    r.mensagens.push(d.mensagem);
    r.divergencias.push({ numPagamento: d.numPagamento, cpf: alfa(reg.cnabCpf), vlrSifap: d.vlrLiquido, vlrBanco: d.vlrRetorno });
    return;
  }
  r.conciliados += 1;
  if (d.mensagem) {
    r.mensagens.push(d.mensagem);
    r.codigosDesconhecidos.push({ numPagamento: d.numPagamento, cpf: alfa(reg.cnabCpf), codRet: alfa(reg.codRet) });
  }
}
