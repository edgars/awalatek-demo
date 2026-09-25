// FR-BEN-03 — CPF válido por módulo 11. Implementado una sola vez (E0) y
// reutilizado en FR-VAL-02 (VALBENEF, con dígitos repetidos D4b) y FR-DOC-01 (E2).
// VALBENEF (190–236) repite el mismo cálculo que CADBENEF (237–266): se citan ambas fuentes.

// RK-bc7d67f3dad4 (CADBENEF:113) — mensaje literal cuando el CPF no es válido.
export const MSG_CPF_INVALIDO = "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO";

/** DV1 sobre los dígitos 1..9. */
export function calculaDv1(dig: readonly number[]): number {
  let soma = 0;
  for (const [i, n] of dig.slice(0, 9).entries()) {
    // RK-99ffed6e1d57 (CADBENEF:237) — Σ dígitos 1..9 × pesos 10..2.
    // RK-2dd4cb3c18cd (VALBENEF:209) — COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO).
    soma = soma + n * (10 - i);
  }
  // RK-ab368e4ef3e2 (CADBENEF:240) — resto = soma − ((soma / 11) × 11).
  // RK-9f7df44b6ca1 (VALBENEF:212) — mismo cálculo del resto en VALBENEF.
  const resto = soma - Math.trunc(soma / 11) * 11;
  // RK-a04fb0c62d98 (CADBENEF:241) — resto < 2 → DV1 = 0.
  // RK-ccc5388150f7 (VALBENEF:213) — IF #RESTO < 2 THEN MOVE 0 TO #DV1.
  if (resto < 2) return 0;
  // RK-02b5279daf63 (CADBENEF:244) — si no, DV1 = 11 − resto.
  // RK-9985fab5aca5 (VALBENEF:216) — COMPUTE #DV1 = 11 - #RESTO.
  return 11 - resto;
}

/** DV2 sobre los dígitos 1..10. */
export function calculaDv2(dig: readonly number[]): number {
  let soma = 0;
  for (const [i, n] of dig.slice(0, 10).entries()) {
    // RK-98472f98558e (CADBENEF:256) — Σ dígitos 1..10 × pesos 11..2.
    // RK-cb78ba074b4e (VALBENEF:227) — COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO).
    soma = soma + n * (11 - i);
  }
  // RK-d05375bd9555 (CADBENEF:259) — resto = soma − ((soma / 11) × 11).
  // RK-23cb286f5641 (VALBENEF:230) — mismo cálculo del resto en VALBENEF.
  const resto = soma - Math.trunc(soma / 11) * 11;
  // RK-8178f6bfb367 (CADBENEF:260) — resto < 2 → DV2 = 0.
  // RK-6381e8b050e1 (VALBENEF:231) — IF #RESTO < 2 THEN MOVE 0 TO #DV2.
  if (resto < 2) return 0;
  // RK-a4491331af7d (CADBENEF:263) — si no, DV2 = 11 − resto.
  // RK-03e29441143e (VALBENEF:234) — COMPUTE #DV2 = 11 - #RESTO.
  return 11 - resto;
}

/**
 * Valida los dos dígitos verificadores. Exige string de exactamente 11 dígitos
 * (ceros a la izquierda incluidos); cualquier otra entrada → `false`, sin lanzar.
 */
export function validaModulo11(cpf: string): boolean {
  if (typeof cpf !== "string" || !/^\d{11}$/.test(cpf)) return false;
  const dig = Array.from(cpf, Number);
  // RK-476620ed64ce (CADBENEF:247) — DV1 ≠ dígito 10 → inválido (escape routine).
  if (calculaDv1(dig) !== dig[9]) return false;
  // RK-9e739b6b003d (CADBENEF:266) — DV2 ≠ dígito 11 → inválido.
  if (calculaDv2(dig) !== dig[10]) return false;
  return true;
}

/**
 * CPF completo de VALBENEF (FR-VAL-02): dígitos repetidos + módulo 11.
 * Exige string de exactamente 11 dígitos; cualquier otra entrada → `false`.
 */
export function validaCpfCompleto(cpf: string): boolean {
  if (typeof cpf !== "string" || !/^\d{11}$/.test(cpf)) return false;
  const dig = Array.from(cpf, Number);
  let todosIguais = true;
  for (let i = 1; i < 11; i++) {
    // RK-b48d9743345d (VALBENEF:190) — IF #DIG(#I) NE #DIG(1) → #TODOS-IGUAIS = FALSE / ESCAPE BOTTOM.
    if (dig[i] !== dig[0]) {
      todosIguais = false;
      break;
    }
  }
  if (todosIguais) {
    // RK-e67e790f872a (VALBENEF:197) — IF #DIG(1) = 0 AND #DIG(2) = 0 AND #DIG(3) = 0 → válido ("teste governo").
    // LEGACY-QUIRK(D4b): 11 dígitos iguales empezando por 000 (es decir, 00000000000) se acepta como válido.
    if (dig[0] === 0 && dig[1] === 0 && dig[2] === 0) return true;
    // RK-605e59b1fe7d (VALBENEF:195) — IF #TODOS-IGUAIS → #CPF-VALIDO = FALSE / ESCAPE ROUTINE.
    return false;
  }
  // RK-f19b73dfd406 (VALBENEF:218) — IF #DV1 NE #DIG(10) → inválido / ESCAPE ROUTINE.
  if (calculaDv1(dig) !== dig[9]) return false;
  // RK-07ded10a38a1 (VALBENEF:236) — IF #DV2 NE #DIG(11) → inválido.
  if (calculaDv2(dig) !== dig[10]) return false;
  return true;
}

/**
 * CPF numérico N11 del legado: solo dígitos, con ceros a la izquierda.
 * En blanco → `"00000000000"` (N11 = 0). Más de 11 dígitos → se devuelven tal cual
 * (no caben en N11 y no pasan ninguna validación de formato).
 */
export function normalizaCpfNumerico(texto: string): string {
  const d = String(texto ?? "").replace(/\D/g, "");
  return d.length <= 11 ? d.padStart(11, "0") : d;
}

/** Completa una base de 9 dígitos con sus dos dígitos verificadores. */
export function completaDv(base9: string): string {
  if (typeof base9 !== "string" || !/^\d{9}$/.test(base9)) {
    throw new Error("base de CPF deve ter 9 dígitos");
  }
  const dig = Array.from(base9, Number);
  const dv1 = calculaDv1(dig);
  const dv2 = calculaDv2([...dig, dv1]);
  return `${base9}${dv1}${dv2}`;
}

/**
 * Máscara de CPF para listas (LGPD, NFR-04): `***.***.XXX-XX` — muestra solo los
 * dígitos 7–11. Sin RK: la máscara legada con el quirk D7 (CONSBENF) llega en 2.6.
 */
export function mascaraCpfLista(cpf: string): string {
  const d = String(cpf ?? "").replace(/\D/g, "").padStart(11, "0").slice(-11);
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}
