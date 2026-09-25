// Recálculo de descuentos de un pago — FR-DSC-02..06 (CALCDSCT:96-176).
// Dominio puro: recibe el bruto del pago, los descuentos REGISTRADOS del
// beneficiario (D14: `BeneficiarioDesconto`) y la fecha de hoy; devuelve el
// total y el detalle por descuento procesado (→ `PagamentoDesconto`).
//
// Unidades: dinero en centavos enteros; porcentajes string N3.2 (`"10.00"` = 10 %);
// fechas AAAAMMDD entero (0 = sin fecha fin).
//
// LEGACY-QUIRK(D13): este algoritmo (progresivo + registrados + tope) es
// distinto del 3 % plano del motor, y CALCDSCT NO recalcula el líquido: el
// llamador solo actualiza el descuento del pago.

import { aCentavos, dec, deCentavos, fator, truncar, type Dinheiro } from "../money";
import { FAIXAS_CONTRIBUICAO } from "./tabelas";

/** Descuento registrado del beneficiario (PE DESCONTOS de CALCDSCT). */
export interface DescontoCadastrado {
  /** Posición en el PE (el legado los recorre en este orden). */
  occurrence: number;
  /** TIPO-DSCT (A1). D15: dominio del código C/I/J/S/P/A; se compara literal. */
  tipoDesconto: string;
  /** VLR-DSCT en centavos (valor fijo; 0 = usar porcentaje). */
  vlrDesconto: number;
  /** PCT-DSCT N3.2 como string (porcentaje, `"10.00"` = 10 %). */
  pctDesconto: string;
  /** DT-INICIO-DSCT AAAAMMDD. */
  dtInicioDsct: number;
  /** DT-FIM-DSCT AAAAMMDD; 0 = indefinido. */
  dtFimDsct: number;
  numProcesso?: string | null;
}

/** Descuento registrado que pasó el filtro de vigencia y entró al loop. */
export interface DescontoProcessado extends DescontoCadastrado {
  /** #VLR-DSCT-ITEM sumado al total, en centavos (0 si el tipo es desconocido). */
  vlrItem: number;
  /** false si el tipo no es J/P/A/I/S (NONE → IGNORE): no suma, pero sí dispara el tope. */
  aplicado: boolean;
  /** #VLR-TOTAL-DSCT después de este descuento (y del tope, si corrió), en centavos. */
  vlrTotalApos: number;
  /** true si el tope del 30 % recortó el total tras este descuento (D2). */
  tetoAplicado: boolean;
}

export interface EntradaDescontos {
  /** VLR-BRUTO del pago, en centavos. */
  vlrBruto: number;
  /** Descuentos registrados del beneficiario (cualquier orden; se procesan por `occurrence`). */
  descontos: readonly DescontoCadastrado[];
  /** Fecha de hoy AAAAMMDD (`hoje().data`). */
  dtHoje: number;
}

export interface ResultadoDescontos {
  /** Bruto recibido, en centavos. */
  vlrBruto: number;
  /** Contribución social progresiva, en centavos (0 si bruto > 9.999,99). */
  vlrContribuicao: number;
  /** Tope del 30 % (#VLR-MAX-DSCT), en centavos. */
  vlrTeto: number;
  /** Total final truncado (#VLR-TOTAL-DSCT → PAGAMENTO.VLR-DESCONTO), en centavos. */
  vlrTotal: number;
  /** Descuentos registrados vigentes, en el orden procesado (uno por fila `PagamentoDesconto`). */
  itens: DescontoProcessado[];
  /** `occurrence` de los descuentos saltados por vigencia (no entran al loop ni al tope). */
  foraDeVigencia: number[];
}

/** FR-DSC-02 — contribución social progresiva sobre el bruto (en `Dinheiro`). */
export function contribuicaoSocial(vlrBruto: Dinheiro): Dinheiro {
  for (const faixa of FAIXAS_CONTRIBUICAO) {
    // RK-83b28551c287 (CALCDSCT:195) — primer tramo con #VLR-BRUTO <= #FAIXA-CONTRIB(#K)
    if (vlrBruto.lessThanOrEqualTo(deCentavos(faixa.teto))) {
      // RK-70cdacb35c1a (CALCDSCT:196) — #VLR-DSCT-ITEM = BRUTO × ALIQ (trunca N9.2)
      return truncar(vlrBruto.times(fator(faixa.aliquota)));
    }
  }
  // LEGACY-QUIRK(D1): bruto > 9.999,99 no encaja en ningún tramo → sin contribución.
  return dec(0);
}

/**
 * FR-DSC-04 — vigencia: se ignora si la fecha fin ≠ 0 y < hoy, o si la fecha
 * inicio > hoy.
 */
export function descontoVigente(d: Pick<DescontoCadastrado, "dtInicioDsct" | "dtFimDsct">, dtHoje: number): boolean {
  // RK-e3256815c49a (CALCDSCT:112) — DT-FIM ≠ 0 AND DT-FIM < hoy → ESCAPE TOP
  if (d.dtFimDsct !== 0 && d.dtFimDsct < dtHoje) return false;
  // RK-873a78f8fdfb (CALCDSCT:116) — DT-INICIO > hoy → ESCAPE TOP
  if (d.dtInicioDsct > dtHoje) return false;
  return true;
}

/**
 * FR-DSC-05 — valor de un descuento registrado según su tipo (LEGACY-QUIRK D14/D15).
 * Devuelve `null` para tipos desconocidos (DECIDE … NONE IGNORE), incluido 'C'.
 */
export function valorDoDesconto(d: DescontoCadastrado, vlrBruto: Dinheiro): Dinheiro | null {
  if (!Number.isSafeInteger(d.vlrDesconto)) throw new Error(`vlrDesconto deve ser inteiro: ${d.vlrDesconto}`);
  const vlrFixo = deCentavos(d.vlrDesconto);
  // #VLR-BRUTO × (PCT-DSCT / 100), truncado al asignarse a #VLR-DSCT-ITEM (N9.2).
  const porPercentual = (): Dinheiro => truncar(vlrBruto.times(fator(d.pctDesconto).dividedBy(100)));
  // RK-5d6c495417bb (CALCDSCT:122) — DECIDE ON FIRST VALUE OF #TIPO-DSCT
  switch (d.tipoDesconto) {
    case "J":
      // RK-5ebca43330fa (CALCDSCT:125) — judicial: VLR-DSCT > 0 → valor fijo
      // RK-7ae0930278f4 (CALCDSCT:128) — si no, bruto × pct/100
      return vlrFixo.greaterThan(0) ? vlrFixo : porPercentual();
    case "P":
      // RK-813b10f0a6b2 (CALCDSCT:135) — pensión: VLR-DSCT > 0 → valor fijo
      // RK-eb8f0ba106d7 (CALCDSCT:138) — si no, bruto × pct/100
      return vlrFixo.greaterThan(0) ? vlrFixo : porPercentual();
    case "I":
      // RK-88bafd73a684 (CALCDSCT:144) — impuesto retenido: bruto × pct/100
      return porPercentual();
    case "S":
      // RK-a6687439e293 (CALCDSCT:149) — sindical: bruto × 0.01
      return truncar(vlrBruto.times("0.01"));
    case "A":
      // RK-43bd100339a0 (CALCDSCT:153) — administrativo: VLR-DSCT > 0 → valor fijo
      // RK-62ff9a96f5f9 (CALCDSCT:156) — si no, bruto × pct/100
      return vlrFixo.greaterThan(0) ? vlrFixo : porPercentual();
    default:
      // NONE → IGNORE: tipo desconocido (incluye 'C' registrado) no suma.
      return null;
  }
}

/** FR-DSC-02..06 — recálculo completo de descuentos de un pago (CALCDSCT). */
export function calcularDescontos(e: EntradaDescontos): ResultadoDescontos {
  if (!Number.isSafeInteger(e.vlrBruto)) throw new Error(`vlrBruto deve ser inteiro: ${e.vlrBruto}`);
  const vlrBruto = deCentavos(e.vlrBruto);

  // MOVE 0 TO #VLR-TOTAL-DSCT; PERFORM CALC-CONTRIB-SOCIAL (ADD al total)
  const vlrContribuicao = contribuicaoSocial(vlrBruto);
  let total = vlrContribuicao;

  // RK-746a7b5738cf (CALCDSCT:102) — #VLR-MAX-DSCT = #VLR-BRUTO × 0.30
  // RK-3cde6c2d52e2 (CALCDSCT:104) — #VLR-TEMP = #VLR-MAX-DSCT × 100 (N11)
  // RK-636a3924f593 (CALCDSCT:105) — #VLR-MAX-DSCT = #VLR-TEMP / 100
  const vlrTeto = truncar(truncar(vlrBruto.times("0.30")));

  const itens: DescontoProcessado[] = [];
  const foraDeVigencia: number[] = [];
  // FOR #IDX = 1 TO C*DESCONTOS — orden del PE (occurrence).
  const ordenados = [...e.descontos].sort((a, b) => a.occurrence - b.occurrence);
  for (const d of ordenados) {
    if (!descontoVigente(d, e.dtHoje)) {
      // ESCAPE TOP antes del DECIDE: tampoco corre la verificación del tope.
      foraDeVigencia.push(d.occurrence);
      continue;
    }
    const item = valorDoDesconto(d, vlrBruto);
    if (item !== null) total = total.plus(item); // ADD #VLR-DSCT-ITEM TO #VLR-TOTAL-DSCT

    // LEGACY-QUIRK(D2): tope del 30 % DENTRO del loop, sobre el total acumulado,
    // tras cada descuento no judicial (también tras un tipo desconocido). Un no
    // judicial posterior puede recortar lo judicial ya sumado.
    let tetoAplicado = false;
    // RK-07b224be3337 (CALCDSCT:165) — IF #TIPO-DSCT NE 'J'
    if (d.tipoDesconto !== "J") {
      // RK-f27df0e84c50 (CALCDSCT:166) — IF #VLR-TOTAL-DSCT > #VLR-MAX-DSCT → total = tope
      if (total.greaterThan(vlrTeto)) {
        total = vlrTeto;
        tetoAplicado = true;
      }
    }
    itens.push({
      ...d,
      vlrItem: item === null ? 0 : aCentavos(item),
      aplicado: item !== null,
      vlrTotalApos: aCentavos(total),
      tetoAplicado,
    });
  }

  // FR-DSC-06 — RK-ed72fdc907a3 (CALCDSCT:175) — #VLR-TEMP = #VLR-TOTAL-DSCT × 100
  // RK-462a16645319 (CALCDSCT:176) — #VLR-TOTAL-DSCT = #VLR-TEMP / 100
  const vlrTotal = truncar(total);

  return {
    vlrBruto: e.vlrBruto,
    vlrContribuicao: aCentavos(vlrContribuicao),
    vlrTeto: aCentavos(vlrTeto),
    vlrTotal: aCentavos(vlrTotal),
    itens,
    foraDeVigencia,
  };
}
