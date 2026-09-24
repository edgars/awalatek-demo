// FR-BEN-03 — CPF válido por módulo 11. Implementado una sola vez (E0) y
// reutilizado en FR-VAL-02 y FR-DOC-01 (E2). Dígitos repetidos (D4b) y
// máscaras (D7) se añaden en E2.

// RK-bc7d67f3dad4 (CADBENEF:113) — mensaje literal cuando el CPF no es válido.
export const MSG_CPF_INVALIDO = "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO";

/** DV1 sobre los dígitos 1..9. */
export function calculaDv1(dig: readonly number[]): number {
  let soma = 0;
  for (const [i, n] of dig.slice(0, 9).entries()) {
    // RK-99ffed6e1d57 (CADBENEF:237) — Σ dígitos 1..9 × pesos 10..2.
    soma = soma + n * (10 - i);
  }
  // RK-ab368e4ef3e2 (CADBENEF:240) — resto = soma − ((soma / 11) × 11).
  const resto = soma - Math.trunc(soma / 11) * 11;
  // RK-a04fb0c62d98 (CADBENEF:241) — resto < 2 → DV1 = 0.
  if (resto < 2) return 0;
  // RK-02b5279daf63 (CADBENEF:244) — si no, DV1 = 11 − resto.
  return 11 - resto;
}

/** DV2 sobre los dígitos 1..10. */
export function calculaDv2(dig: readonly number[]): number {
  let soma = 0;
  for (const [i, n] of dig.slice(0, 10).entries()) {
    // RK-98472f98558e (CADBENEF:256) — Σ dígitos 1..10 × pesos 11..2.
    soma = soma + n * (11 - i);
  }
  // RK-d05375bd9555 (CADBENEF:259) — resto = soma − ((soma / 11) × 11).
  const resto = soma - Math.trunc(soma / 11) * 11;
  // RK-8178f6bfb367 (CADBENEF:260) — resto < 2 → DV2 = 0.
  if (resto < 2) return 0;
  // RK-a4491331af7d (CADBENEF:263) — si no, DV2 = 11 − resto.
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
