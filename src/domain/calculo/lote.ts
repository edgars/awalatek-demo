// Lote mensual de pagos (BATCHPGT, FR-LOT-01/02/04). Dominio puro: reglas de
// selección de beneficiarios, mensajes y acumuladores del resumen. El cálculo
// (FR-LOT-03, BATCHPGT:236-320) es el MISMO motor del individual
// (`motor.calcular`); la competencia (BATCHPGT:108-110) es `competenciaDaData`.
// La orquestación y la grabación están en `src/server/lotePagamentos.ts`.

import { mascaraCpfLista } from "../cpf";
import type { ResultadoCalculo } from "./motor";

/** Motivo por el que un beneficiario no genera pago (cuenta como ignorado). */
export type MotivoIgnorado = "CPF_REPETIDO" | "NAO_ATIVO" | "JA_GERADO" | "PROGRAMA_INATIVO";

export type Selecao =
  | { acao: "calcular" }
  | { acao: "ignorar"; motivo: MotivoIgnorado }
  | { acao: "erro"; mensagem: string };

export interface EntradaSelecao {
  /** CPF del registro leído (orden ascendente de CPF, FR-LOT-02). */
  numCpf: string;
  /** CPF del registro anterior (`#CPF-ANT`); `null` en el primero. */
  cpfAnterior: string | null;
  /** STATUS del beneficiario. */
  sitBeneficiario: string;
  /** COD-PROGRAMA del beneficiario. */
  codPrograma: string;
  /** Existe algún pago del CPF con COMPETENCIA = competencia del lote. */
  jaGerado: boolean;
  /** Programa del beneficiario, o `null` si no existe. */
  programa: { sitPrograma: string } | null;
}

/**
 * "ERRO: PROG NAO ENCONTRADO CPF=<cpf> PROG=<cod>". El legado usa COMPRESS con el
 * CPF completo; aquí el CPF va enmascarado (NFR-04: sin datos personales en el log).
 */
export function mensagemProgramaNaoEncontrado(numCpf: string, codPrograma: string): string {
  return `ERRO: PROG NAO ENCONTRADO CPF=${mascaraCpfLista(numCpf)} PROG=${codPrograma}`;
}

/**
 * FR-LOT-02 — decide, en el orden del legado, qué hacer con un beneficiario leído.
 * El llamador cuenta el registro como procesado antes de llamar (BATCHPGT:184).
 */
export function selecionarBeneficiario(e: EntradaSelecao): Selecao {
  // RK-7d3e373f4754 (BATCHPGT:188) — IF BENEFICIARIO-V.CPF = #CPF-ANT → ignorado (evita duplicatas)
  if (e.cpfAnterior !== null && e.numCpf === e.cpfAnterior) return { acao: "ignorar", motivo: "CPF_REPETIDO" };
  // RK-bf3826b5e614 (BATCHPGT:195) — IF BENEFICIARIO-V.STATUS NE 'A' → ignorado
  if (e.sitBeneficiario !== "A") return { acao: "ignorar", motivo: "NAO_ATIVO" };
  // RK-644073d95848 (BATCHPGT:203) — pago del CPF con COMPETENCIA = #COMPETENCIA → #JA-GERADO
  // RK-684b2581729a (BATCHPGT:207) — IF #JA-GERADO → ignorado (re-ejecutar no duplica pagos)
  if (e.jaGerado) return { acao: "ignorar", motivo: "JA_GERADO" };
  // RK-7f911d03a299 (BATCHPGT:220) — programa no encontrado → WRITE del error, ADD 1 TO #QTD-ERROS
  // y ESCAPE TOP (el lote sigue).
  if (!e.programa) return { acao: "erro", mensagem: mensagemProgramaNaoEncontrado(e.numCpf, e.codPrograma) };
  // RK-4f462c2048b7 (BATCHPGT:227) — IF PROGRAMA-V.STATUS-PROG NE 'A' → ignorado
  if (e.programa.sitPrograma !== "A") return { acao: "ignorar", motivo: "PROGRAMA_INATIVO" };
  return { acao: "calcular" };
}

/** Intervalo del registro de progreso (BATCHPGT:345). */
export const INTERVALO_PROGRESSO = 1000;

/** RK-69bb52067a2a (BATCHPGT:345) — IF #QTD-GERADOS MOD 1000 = 0 → registra el progreso. */
export function deveRegistrarProgresso(qtdGerados: number): boolean {
  return qtdGerados > 0 && qtdGerados % INTERVALO_PROGRESSO === 0;
}

/** "PROCESSADOS: n ULTIMO CPF: …" (BATCHPGT:346), con el CPF enmascarado (NFR-04). */
export function mensagemProgresso(qtdGerados: number, numCpf: string): string {
  return `PROCESSADOS: ${qtdGerados} ULTIMO CPF: ${mascaraCpfLista(numCpf)}`;
}

/** Contadores y totales del lote (BATCHPGT:113-121, 338-342). Dinero en centavos. */
export interface ResumoLote {
  competencia: number;
  processados: number;
  gerados: number;
  ignorados: number;
  erros: number;
  vlrTotalBruto: number;
  vlrTotalDesconto: number;
  vlrTotalLiquido: number;
  vlrTotalAbono: number;
  /** Mensajes "ERRO: PROG NAO ENCONTRADO …" en el orden en que ocurrieron. */
  mensagensErro: string[];
}

/** Inicializa contadores y totales en 0 (BATCHPGT:113-121). */
export function novoResumo(competencia: number): ResumoLote {
  return {
    competencia,
    processados: 0,
    gerados: 0,
    ignorados: 0,
    erros: 0,
    vlrTotalBruto: 0,
    vlrTotalDesconto: 0,
    vlrTotalLiquido: 0,
    vlrTotalAbono: 0,
    mensagensErro: [],
  };
}

/** Suma un pago generado a los contadores/totales (BATCHPGT:338-342). Muta y devuelve `r`. */
export function acumularGerado(r: ResumoLote, calc: Pick<ResultadoCalculo, "vlrBruto" | "vlrDesc" | "vlrLiq" | "vlrAbono">): ResumoLote {
  r.gerados += 1;
  r.vlrTotalBruto += calc.vlrBruto;
  r.vlrTotalDesconto += calc.vlrDesc;
  r.vlrTotalLiquido += calc.vlrLiq;
  r.vlrTotalAbono += calc.vlrAbono;
  return r;
}

/** Aplica al resumen una decisión que no genera pago (ignorado o error). Muta y devuelve `r`. */
export function acumularSelecao(r: ResumoLote, s: Exclude<Selecao, { acao: "calcular" }>): ResumoLote {
  if (s.acao === "ignorar") r.ignorados += 1;
  else {
    r.erros += 1;
    r.mensagensErro.push(s.mensagem);
  }
  return r;
}

function reais(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Resumen final con los rótulos literales del legado (BATCHPGT:352-364). */
export function linhasResumo(r: ResumoLote): string[] {
  const sep = "=====================================";
  return [
    sep,
    "BATCHPGT - RESUMO PROCESSAMENTO",
    sep,
    `COMPETENCIA......: ${r.competencia}`,
    `TOTAL PROCESSADOS: ${r.processados}`,
    `PAGTOS GERADOS...: ${r.gerados}`,
    `IGNORADOS........: ${r.ignorados}`,
    `ERROS............: ${r.erros}`,
    `VLR TOTAL BRUTO..: ${reais(r.vlrTotalBruto)}`,
    `VLR TOTAL DESC...: ${reais(r.vlrTotalDesconto)}`,
    `VLR TOTAL LIQUIDO: ${reais(r.vlrTotalLiquido)}`,
    `VLR TOTAL ABONO..: ${reais(r.vlrTotalAbono)}`,
    sep,
  ];
}
