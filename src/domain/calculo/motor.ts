// Motor único de cálculo de beneficio — FR-CAL-03..10 (CALCBENF) y FR-LOT-03
// (BATCHPGT:236-320, idéntico). Lo usan el cálculo individual (4.1) y el lote
// mensual (4.2). Dominio puro: sin Prisma, sin Next, sin I/O.
//
// Unidades de la API pública (mismas que la persistencia, ADR-005):
//   - dinero: centavos enteros (`number`, entero seguro), entrada y salida;
//   - factores: string decimal N3.4 (`"1.3500"`), entrada y salida;
//   - fechas: AAAAMMDD entero; competencia: AAAAMM entero.
// Internamente todo se calcula con `Dinheiro` exacto.
//
// Semántica Natural: un COMPUTE/MOVE sin ROUNDED trunca al asignar según el
// campo destino. Por eso se trunca en CADA asignación del fuente, no solo al
// final: destino N9.2 (#VLR-*) → `truncar` (2 dec.); destino N3.4 (#FATOR-*)
// → `truncarCasas(…, 4)`; el par `#VLR-TEMP (N11) = x * 100` / `x = #VLR-TEMP / 100`
// es un truncado explícito a 2 decimales.

import { anoDe, idadePorAno } from "../legacyDate";
import { aCentavos, dec, deCentavos, fator, fatorParaString, truncar, truncarCasas, type Dinheiro } from "../money";
import { corrige, QUIRKS_PADRAO, type Quirks } from "../quirks";
import { FAIXAS_RENDA, FATOR_REGIONAL_PADRAO, TAB_REG } from "./tabelas";

export const MSG_COMPETENCIA_INVALIDA = "COMPETENCIA INVALIDA";

/**
 * Correcciones de quirks que afectan al motor (D8, D17). Default = legado (paridad).
 * El cálculo individual y el lote pasan LA MISMA configuración (leída una vez por
 * solicitud/corrida en la capa de servidor).
 */
export type QuirksMotor = Pick<Quirks, "corrigidos">;

/** Tipo de pago generado por el motor (D15: dominio del código N/D/T; el motor solo produce N y D). */
export type TipoPgto = "N" | "D";

export type ResultadoCompetencia =
  | { ok: true; ano: number; mes: number }
  | { ok: false; mensagem: typeof MSG_COMPETENCIA_INVALIDA };

/**
 * FR-CAL-01 — separa y valida la competencia AAAAMM como el legado.
 * Solo se valida el mes (1–12); el año no se valida (el legado tampoco).
 */
export function validarCompetencia(competencia: number): ResultadoCompetencia {
  // #COMPETENCIA es N6: fuera de 0..999999 o no entero no es representable.
  if (!Number.isSafeInteger(competencia) || competencia < 0 || competencia > 999999) {
    return { ok: false, mensagem: MSG_COMPETENCIA_INVALIDA };
  }
  // RK-7116b6a5174c (CALCBENF:138) — #ANO = #COMPETENCIA / 100 (N4, trunca)
  const ano = Math.trunc(competencia / 100);
  // RK-140d297f9d0c (CALCBENF:139) — #MES = #COMPETENCIA - (#ANO * 100)
  const mes = competencia - ano * 100;
  // RK-886f1116333c (CALCBENF:141) — mes fuera de 1–12 → "COMPETENCIA INVALIDA"
  if (mes < 1 || mes > 12) return { ok: false, mensagem: MSG_COMPETENCIA_INVALIDA };
  return { ok: true, ano, mes };
}

/**
 * FR-LOT-01 — competencia del lote = año/mes de la fecha de ejecución AAAAMMDD.
 * `competenciaDaData(20261201)` → 202612.
 */
export function competenciaDaData(dtHoje: number): number {
  if (!Number.isSafeInteger(dtHoje) || dtHoje < 0) throw new Error(`data legada inválida: ${dtHoje}`);
  // RK-275ebe83e773 (BATCHPGT:108) — #ANO = #DT-HOJE / 10000 (N4, trunca)
  const ano = Math.trunc(dtHoje / 10000);
  // RK-af5872bb5b6c (BATCHPGT:109) — #MES = (#DT-HOJE - (#ANO * 10000)) / 100 (N2, trunca)
  const mes = Math.trunc((dtHoje - ano * 10000) / 100);
  // RK-8b46847de08b (BATCHPGT:110) — #COMPETENCIA = (#ANO * 100) + #MES
  return ano * 100 + mes;
}

/** FR-CAL-03 — factor regional (LEGACY-QUIRK D1: tabla fija). */
export function fatorRegional(codRegiao: number): string {
  exigirInteiro(codRegiao, "codRegiao");
  // RK-f8d9475ad104 (CALCBENF:180) · RK-0dd27e7579c4 (BATCHPGT:240)
  // Región 1–25 → #TAB-REG(#COD-REG); cualquier otra (0, 26, 27, 99…) → 1.0000.
  const pos = codRegiao >= 1 && codRegiao <= 25 ? TAB_REG[codRegiao - 1] : undefined;
  return pos ? pos.fator : FATOR_REGIONAL_PADRAO;
}

/** FR-CAL-04 — factor familiar por número de dependientes (destino N3.4). */
export function fatorFamiliar(numDependentes: number): string {
  exigirInteiro(numDependentes, "numDependentes");
  if (numDependentes < 0) throw new Error(`numDependentes inválido: ${numDependentes}`);
  const n = dec(numDependentes);
  let f: Dinheiro;
  if (numDependentes === 0) {
    // RK-2cced191e62e (CALCBENF:187) · RK-5ea515fab8f3 (BATCHPGT:247) — 0 dep. → 1.0000
    f = dec("1.0000");
  } else if (numDependentes <= 2) {
    // RK-c0d4163cc4d1 (CALCBENF:190) · RK-f5d5302be54b (BATCHPGT:250) — 1–2 dep.
    // RK-3461de4d19c8 (CALCBENF:191) · RK-c22371bd5232 (BATCHPGT:251) — 1.0000 + n × 0.0500
    f = dec("1.0000").plus(n.times("0.0500"));
  } else if (numDependentes <= 4) {
    // RK-b13aff8bf789 (CALCBENF:193) · RK-214450c0f73f (BATCHPGT:253) — 3–4 dep.
    // RK-5aae34cd08cf (CALCBENF:194) · RK-c4f50dc3ca8a (BATCHPGT:254) — 1.1000 + (n − 2) × 0.0300
    f = dec("1.1000").plus(n.minus(2).times("0.0300"));
  } else {
    // RK-7e690c7a89ec (CALCBENF:196) · RK-536175a6629f (BATCHPGT:256) — ≥ 5 dep.: 1.1600 + (n − 4) × 0.0200
    f = dec("1.1600").plus(n.minus(4).times("0.0200"));
  }
  return fatorParaString(f, 4); // COMPUTE a #FATOR-FAM (N3.4)
}

/**
 * FR-CAL-05 — factor de renta: primer tramo con `renda <= teto` (renta en centavos).
 *
 * LEGACY-QUIRK(D17): renta > 9.999,99 no encaja en ningún tramo y el legado no
 * toca #FATOR-RND. En CALCBENF la variable conserva su valor inicial (0); en
 * BATCHPGT arrastra el factor del último beneficiario calculado. Se modela con
 * `fatorRendaAnterior`: el cálculo individual no lo pasa (→ 0) y el lote pasa
 * el `fatorRenda` devuelto por el cálculo anterior (el primero del lote → 0).
 * TODO(review): el arrastre en el lote es probablemente un bug del legado;
 * confirmar con negocio si debe mantenerse (PRD D17).
 */
export function fatorRenda(renda: number, fatorRendaAnterior?: string, quirks: QuirksMotor = QUIRKS_PADRAO): string {
  exigirInteiro(renda, "renda");
  // RK-f69f8dc0b6c9 (CALCBENF:306) · RK-bf29157d9a87 (BATCHPGT:370) — IF #RENDA <= #FAIXA-RENDA(#J)
  for (const faixa of FAIXAS_RENDA) {
    if (renda <= faixa.teto) return faixa.fator; // ESCAPE BOTTOM
  }
  if (corrige(quirks, "D17")) {
    // CORRECAO(D17): sin arrastre — el lote usa lo mismo que el individual (#FATOR-RND = 0).
    return fatorParaString(dec(0), 4);
  }
  // LEGACY-QUIRK(D17): ningún tramo → #FATOR-RND queda con el valor previo.
  // TODO(review): ver comentario de la función (arrastre en el lote).
  return fatorParaString(fator(fatorRendaAnterior ?? "0"), 4);
}

/** FR-CAL-06 — factor de edad; edad = año de referencia − año de nacimiento. */
export function fatorIdade(dtNascimento: number, ano: number): string {
  // RK-999fc6833a38 (CALCBENF:205) · RK-714fd6ddfb82 (BATCHPGT:236) — #ANO-NASC = DT-NASCIMENTO / 10000 (`anoDe`)
  anoDe(dtNascimento);
  // RK-7b2181c12f19 (CALCBENF:206) · RK-540fc024b18c (BATCHPGT:237) — #IDADE = #ANO - #ANO-NASC
  // (#ANO = año de la competencia, sin mes ni día). Nota: DT-NASCIMENTO = 0
  // da año 0 y edad = #ANO (≥ 65); el legado no lo evita y aquí tampoco.
  const idade = idadePorAno(dtNascimento, ano);
  // RK-2f190186d76b (CALCBENF:207) · RK-809cefb3e473 (BATCHPGT:265) — ≥ 65 → 1.1500
  if (idade >= 65) return "1.1500";
  // RK-511b65011b73 (CALCBENF:210) · RK-b9c96b4d502e (BATCHPGT:268) — ≥ 60 → 1.1000
  if (idade >= 60) return "1.1000";
  // RK-f036e04b0398 (CALCBENF:213) · RK-783a0059ec74 (BATCHPGT:271) — < 18 → 1.0500
  if (idade < 18) return "1.0500";
  return "1.0000";
}

export interface EntradaCalculo {
  /** VLR-BASE del programa en centavos (ya ajustado por FATOR-K en CADPROG — D8). */
  vlrBase: number;
  /** FATOR-REAJUSTE del programa, string N3.4 (p. ej. `"0.0500"`). */
  fatorReajuste: string;
  /** TIPO del programa (A1). Solo `'A'` genera abono natalino. */
  tipoPrograma: string;
  /** COD-REGIAO del beneficiario (N2). */
  codRegiao: number;
  /** NUM-DEPENDENTES del beneficiario (N2). */
  numDependentes: number;
  /** RENDA-FAMILIAR del beneficiario en centavos. */
  renda: number;
  /** DT-NASCIMENTO AAAAMMDD. */
  dtNascimento: number;
  /** Competencia AAAAMM. Mes fuera de 1–12 → error "COMPETENCIA INVALIDA". */
  competencia: number;
  /** D17: factor de renta del beneficiario calculado anteriormente (solo lote). */
  fatorRendaAnterior?: string;
}

export interface ResultadoCalculo {
  /** Valor mensual (#VLR-BENF) en centavos. */
  vlrBenf: number;
  /** 13.º (#VLR-13) en centavos; 0 fuera de diciembre. */
  vlr13: number;
  /** Abono natalino (#VLR-ABONO) en centavos; 0 salvo diciembre + programa 'A'. */
  vlrAbono: number;
  /** Bruto (#VLR-BRUTO) en centavos = benf (+ 13.º + abono en diciembre). */
  vlrBruto: number;
  /** Descuento simplificado del 3 % (#VLR-DESC) en centavos (D13). */
  vlrDesc: number;
  /** Líquido (#VLR-LIQ) en centavos, nunca negativo. */
  vlrLiq: number;
  /** 'N' normal; 'D' diciembre (el resumen muestra 13.º y abono). */
  tipoPgto: TipoPgto;
  /** Factor de renta efectivo N3.4 — el lote lo pasa como `fatorRendaAnterior` al siguiente (D17). */
  fatorRenda: string;
}

/**
 * FR-CAL-03..10 — cálculo del pago de un beneficiario en una competencia.
 * Lanza `Error("COMPETENCIA INVALIDA")` si el mes no está en 1–12 (el llamador
 * debería validar antes con `validarCompetencia` para mostrar el mensaje).
 */
export function calcular(e: EntradaCalculo, quirks: QuirksMotor = QUIRKS_PADRAO): ResultadoCalculo {
  const comp = validarCompetencia(e.competencia);
  if (!comp.ok) throw new Error(comp.mensagem);
  exigirInteiro(e.vlrBase, "vlrBase");

  const vlrBase = deCentavos(e.vlrBase);
  // MOVE PROGRAMA-V.FATOR-REAJUSTE TO #FATOR-REAJ (N3.4)
  const fReaj = truncarCasas(fator(e.fatorReajuste), 4);
  const fReg = fator(fatorRegional(e.codRegiao));
  const fFam = fator(fatorFamiliar(e.numDependentes));
  const fRndStr = fatorRenda(e.renda, e.fatorRendaAnterior, quirks);
  const fRnd = fator(fRndStr);
  const fIdade = fator(fatorIdade(e.dtNascimento, comp.ano));

  // FR-CAL-07 — valor mensual.
  // RK-92d4dfd5101f (CALCBENF:225) · RK-82624e7a43c9 (BATCHPGT:280)
  // #VLR-BENF = BASE × F.REG × F.FAM × F.RND × F.IDADE — 1.er truncado (destino N9.2).
  let vlrBenf = truncar(vlrBase.times(fReg).times(fFam).times(fRnd).times(fIdade));
  // RK-4bef7758397d (CALCBENF:229) · RK-a807625f63e9 (BATCHPGT:282)
  // #VLR-BENF = #VLR-BENF × (1 + FATOR-REAJ) — 2.º truncado (destino N9.2).
  if (!corrige(quirks, "D8")) {
    // LEGACY-QUIRK(D8): VLR-BASE ya viene × FATOR-K (CADPROG) y aquí se vuelve a reajustar.
    vlrBenf = truncar(vlrBenf.times(dec(1).plus(fReaj)));
  }
  // CORRECAO(D8): el reajuste ya está en VLR-BASE (× FATOR-K): no se reaplica (1 + FATOR-REAJ).
  // RK-bb591a41dbf3 (CALCBENF:232) · RK-4cab47bee5b1 (BATCHPGT:284) — #VLR-TEMP = #VLR-BENF × 100 (N11)
  // RK-9ca5d0466ba9 (CALCBENF:233) · RK-00a9411b5321 (BATCHPGT:285) — #VLR-BENF = #VLR-TEMP / 100
  vlrBenf = truncar(vlrBenf);

  let vlrBruto = vlrBenf;
  let vlr13 = dec(0);
  let vlrAbono = dec(0);
  let tipoPgto: TipoPgto = "N";

  // FR-CAL-08 — 13.º y abono natalino.
  // RK-be875b52514d (CALCBENF:242) · RK-d4c02c7ef1e7 (BATCHPGT:292) — IF #MES = 12
  if (comp.mes === 12) {
    // RK-46191b29bce5 (CALCBENF:297) — en diciembre el resumen agrega 13.º y abono;
    // el motor lo señala con tipoPgto 'D' y devuelve vlr13/vlrAbono.
    tipoPgto = "D";
    // RK-3ac3d33b1b42 (CALCBENF:244) · RK-1838f13fae05 (BATCHPGT:294)
    // LEGACY-QUIRK(D3): el comentario dice "× MESES_ATIVOS/12", el código no lo hace.
    vlr13 = truncar(vlrBase.times(fReg).times(fIdade));
    // RK-0f5eb2af85a0 (CALCBENF:246) · RK-7d6f8bc734b4 (BATCHPGT:295) — #VLR-TEMP = #VLR-13 × 100
    // RK-f53c75ffb923 (CALCBENF:247) · RK-7b2fc1482b07 (BATCHPGT:296) — #VLR-13 = #VLR-TEMP / 100
    vlr13 = truncar(vlr13);
    // RK-5add7ccbf625 (CALCBENF:248) · RK-a049d00d5cfc (BATCHPGT:297) — #VLR-BRUTO = #VLR-BENF + #VLR-13
    vlrBruto = truncar(vlrBenf.plus(vlr13));
    // RK-f81e5c8b9a62 (CALCBENF:251) · RK-76c532772e71 (BATCHPGT:298) — solo programa tipo 'A'
    if (e.tipoPrograma === "A") {
      // RK-602168305a78 (CALCBENF:252) · RK-a202ec1224da (BATCHPGT:299) — abono = VLR-BENF × 0.15
      // (base = valor mensual, no el bruto)
      vlrAbono = truncar(vlrBenf.times("0.15"));
      // RK-2aeddfcfa687 (CALCBENF:254) · RK-9ff58ea7fd88 (BATCHPGT:300) — #VLR-TEMP = #VLR-ABONO × 100
      // RK-66a219e18a6a (CALCBENF:255) · RK-76a575ac73c7 (BATCHPGT:301) — #VLR-ABONO = #VLR-TEMP / 100
      vlrAbono = truncar(vlrAbono);
      // RK-e8d3c677f5bc (CALCBENF:256) · RK-6f5f5f139ddf (BATCHPGT:302) — #VLR-BRUTO += #VLR-ABONO
      vlrBruto = truncar(vlrBruto.plus(vlrAbono));
    }
  }

  // FR-CAL-09 — LEGACY-QUIRK(D13): descuento simplificado del 3 % (CALCDSCT usa otro algoritmo).
  let vlrDesc = dec(0);
  // RK-4bee01aa2d9d (CALCBENF:318) · RK-75ff56906ba0 (BATCHPGT:308) — IF #VLR-BRUTO > 500.00
  if (vlrBruto.greaterThan("500.00")) {
    // RK-d190c0ee61bb (CALCBENF:319) · RK-1d328e485c60 (BATCHPGT:309) — #VLR-DESC = #VLR-BRUTO × 0.03
    vlrDesc = truncar(vlrBruto.times("0.03"));
    // RK-f673b82833b9 (CALCBENF:320) · RK-2dd8a96d00d2 (BATCHPGT:310) — #VLR-TEMP = #VLR-DESC × 100
    // RK-65e0ed4d5b18 (CALCBENF:321) · RK-f56fad9e4ff6 (BATCHPGT:311) — #VLR-DESC = #VLR-TEMP / 100
    vlrDesc = truncar(vlrDesc);
  }

  const vlrLiq = liquido(vlrBruto, vlrDesc);

  return {
    vlrBenf: aCentavos(vlrBenf),
    vlr13: aCentavos(vlr13),
    vlrAbono: aCentavos(vlrAbono),
    vlrBruto: aCentavos(vlrBruto),
    vlrDesc: aCentavos(vlrDesc),
    vlrLiq: aCentavos(vlrLiq),
    tipoPgto,
    fatorRenda: fRndStr,
  };
}

/**
 * FR-CAL-10 — líquido = bruto − descuento, nunca negativo, truncado a centavos.
 * El bruto ya incluye 13.º y abono (FR-CAL-08): no se suman de nuevo.
 */
function liquido(vlrBruto: Dinheiro, vlrDesc: Dinheiro): Dinheiro {
  // RK-8d025b23228f (CALCBENF:266) · RK-61c33b29d6a8 (BATCHPGT:315) — #VLR-LIQ = #VLR-BRUTO - #VLR-DESC
  let vlrLiq = truncar(vlrBruto.minus(vlrDesc));
  // RK-45fca1f354da (CALCBENF:267) · RK-b5749db3ea0e (BATCHPGT:316) — IF #VLR-LIQ < 0 → 0
  // (solo alcanzable con bruto negativo, p. ej. FATOR-REAJ < −1)
  if (vlrLiq.lessThan(0)) vlrLiq = dec(0);
  // RK-d8033ba178e5 (CALCBENF:272) · RK-8cbfbd730fa5 (BATCHPGT:319) — #VLR-TEMP = #VLR-LIQ × 100
  // RK-c28ec6795433 (CALCBENF:273) · RK-273a402e3fcf (BATCHPGT:320) — #VLR-LIQ = #VLR-TEMP / 100
  return truncar(vlrLiq);
}

/**
 * Fórmula del líquido del motor (FR-CAL-10) sobre valores en centavos. La usa CALCDSCT
 * en modo corregido (D13) para recalcular `vlrLiquido` tras actualizar el descuento.
 */
export function calcularLiquido(vlrBrutoCentavos: number, vlrDescCentavos: number): number {
  exigirInteiro(vlrBrutoCentavos, "vlrBruto");
  exigirInteiro(vlrDescCentavos, "vlrDesc");
  return aCentavos(liquido(deCentavos(vlrBrutoCentavos), deCentavos(vlrDescCentavos)));
}

function exigirInteiro(v: number, nome: string): void {
  if (!Number.isSafeInteger(v)) throw new Error(`${nome} deve ser inteiro: ${v}`);
}
