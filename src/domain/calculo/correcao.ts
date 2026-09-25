import { aCentavos, dec, deCentavos, fator, truncar, truncarCasas, type Dinheiro } from "@/domain/money";
import { TAB_IPCA } from "./tabelas";

// Corrección retroactiva por IPCA (CALCCORR, FR-COR-01..04). Lógica pura: el
// caso de uso `src/server/correcao.ts` solo lee/graba los pagos.
// Dinero en centavos enteros en la frontera; cálculo intermedio en `Dinheiro`.
// CALCCORR no escribe auditoría. El bloque comentado "Plano Verão"
// (CALCCORR:98-111, marca 'V') queda fuera de alcance: no se implementa.

export const MSG_PERIODO_INVALIDO = "PERIODO INVALIDO - COMP INICIAL > FINAL";
/** Texto literal del WRITE de CALCCORR:170. */
export const MSG_CORRECAO_FINALIZADA = "CORRECAO RETROATIVA FINALIZADA";

/** Valor de `IND-CORRIGIDO` de un pago ya corregido. */
export const IND_CORRIGIDO = "S";

/** `#IND-ACUM (N5.6)`: índice acumulado con 6 decimales. */
const CASAS_INDICE = 6;

/**
 * FR-COR-01 — RK-5416be5ab4a9 (CALCCORR:119): competencia inicial > final →
 * "PERIODO INVALIDO - COMP INICIAL > FINAL" y no se procesa nada.
 * Devuelve el mensaje de error o `null` si el período es válido.
 */
export function validarPeriodo(compIni: number, compFim: number): string | null {
  if (compIni > compFim) return MSG_PERIODO_INVALIDO;
  return null;
}

/** Campos del pago que usa el recorrido de CALCCORR. */
export type PagamentoCorrecao = {
  numCpf: string;
  anoMesRef: number;
  indCorrigido: string | null;
};

/**
 * FR-COR-01/02 — replica `READ PAGAMENTO-V BY CPF-BENEF = #CPF` (CALCCORR:128-142)
 * sobre los pagos ya ordenados por competencia ascendente (el caso de uso los
 * ordena por `anoMesRef`, `numPagamento`, para que la parada sea equivalente).
 * Devuelve los pagos a evaluar, en orden.
 */
export function selecionarPagamentos<P extends PagamentoCorrecao>(
  pagamentos: readonly P[],
  numCpf: string,
  compIni: number,
  compFim: number,
): P[] {
  const selecionados: P[] = [];
  for (const p of pagamentos) {
    // RK-fadeb6de594c (CALCCORR:129): otro CPF → fin del recorrido (ESCAPE BOTTOM).
    if (p.numCpf !== numCpf) break;
    // RK-21f4cc982e48 (CALCCORR:133): competencia anterior a la inicial → siguiente (ESCAPE TOP).
    if (p.anoMesRef < compIni) continue;
    // RK-fa50ce8fa3e7 (CALCCORR:136): competencia posterior a la final → fin (ESCAPE BOTTOM).
    if (p.anoMesRef > compFim) break;
    // RK-d24d71f27db8 (CALCCORR:140): FR-COR-02 — pago ya corregido ('S') → se salta.
    if (p.indCorrigido === IND_CORRIGIDO) continue;
    selecionados.push(p);
  }
  return selecionados;
}

/**
 * FR-COR-03 — subrutina CALC-INDICE-ACUM (CALCCORR:176-189). Parte de 1.000000.
 * LEGACY-QUIRK(D9): solo hay IPCA de 2010–2012; cualquier otro año deja el
 * índice en 1 (sin corrección).
 */
export function indiceIpca(competencia: number): Dinheiro {
  if (!Number.isSafeInteger(competencia) || competencia < 0) throw new Error(`competência inválida: ${competencia}`);
  let indAcum = dec("1.000000");
  // RK-d87bc4bc2bc4 (CALCCORR:180): año = competencia / 100 (división entera).
  const ano = Math.trunc(competencia / 100);
  // RK-d7af59c5343d (CALCCORR:181): mes = competencia − año × 100.
  const mes = competencia - ano * 100;
  // RK-012f5e03ef37 (CALCCORR:184): busca el año en #ANO-TAB; si no está, índice 1.
  const linha = TAB_IPCA.find((t) => t.ano === ano);
  if (linha) {
    const ipca = linha.meses[mes - 1];
    // En el legado un mes fuera de 1–12 indexa fuera de #IPCA-ANO (error de ejecución).
    if (ipca === undefined) throw new Error(`mês inválido na competência: ${competencia}`);
    // RK-2a52231a524c (CALCCORR:185): índice = índice × (1 + IPCA[año][mes]) → N5.6.
    indAcum = truncarCasas(indAcum.times(dec(1).plus(fator(ipca))), CASAS_INDICE);
  }
  return indAcum;
}

export type CorrecaoPagamento = {
  /** `#VLR-ORIG` en centavos. */
  vlrOriginal: number;
  /** `#VLR-CORR` truncado, en centavos. */
  vlrCorrigido: number;
  /** `#VLR-DIFF` = corregido − original, en centavos. */
  vlrDiferenca: number;
  /** RK-b5eb9d994cd9: `true` solo si la diferencia es > 0 (se graba y se cuenta). */
  corrigir: boolean;
};

/**
 * FR-COR-04 — aplica el índice al bruto de un pago (CALCCORR:145-158).
 * `vlrBruto` en centavos; resultado en centavos.
 */
export function calcularCorrecao(vlrBruto: number, competencia: number): CorrecaoPagamento {
  const orig = deCentavos(vlrBruto);
  const indice = indiceIpca(competencia);
  // RK-7ac41f6abbe2 (CALCCORR:152): corr = original × índice.
  const bruto = orig.times(indice);
  // RK-26314a2e669a (CALCCORR:154): temp = entero(corr × 100) …
  // RK-ef8db09fc095 (CALCCORR:155): … corr = temp / 100 → truncado a centavos.
  const corr = truncar(bruto);
  // RK-146fee57d2a4 (CALCCORR:156): diferencia = corregido − original.
  const diff = corr.minus(orig);
  const vlrCorrigido = aCentavos(corr);
  return {
    vlrOriginal: vlrBruto,
    vlrCorrigido,
    vlrDiferenca: vlrCorrigido - vlrBruto,
    // RK-b5eb9d994cd9 (CALCCORR:158): solo si la diferencia > 0 se graba
    // VLR-CORRECAO = corregido (valor completo), DT-CORRECAO = hoy, IND-CORRIGIDO = 'S'.
    // Diferencia 0 → el pago no se marca y vuelve a evaluarse en la próxima ejecución.
    corrigir: diff.greaterThan(0),
  };
}

/** Resumen de CALCCORR:170-173: registros corregidos y total (suma de las diferencias). */
export type TotaisCorrecao = { qtdRegistros: number; vlrTotal: number };

/** `ADD #VLR-DIFF TO #VLR-TOTAL-CORR` / `ADD 1 TO #QTD-REG` (CALCCORR:164-165), solo de los corregidos. */
export function totalizar(corrigidos: readonly Pick<CorrecaoPagamento, "vlrDiferenca">[]): TotaisCorrecao {
  return {
    qtdRegistros: corrigidos.length,
    vlrTotal: corrigidos.reduce((s, c) => s + c.vlrDiferenca, 0),
  };
}
