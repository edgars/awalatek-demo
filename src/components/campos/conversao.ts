// Conversión de lo que teclea el operador a los formatos legados que recibe el
// servidor. Sin la librería decimal (solo aritmética de strings/enteros): este módulo
// también corre en el navegador. El servidor revalida todo con zod.

/** Valor enviado cuando el texto no es convertible: el zod del servidor lo rechaza. */
export const VALOR_INVALIDO = "invalido";

/**
 * `"1.234,56"` / `"1.234"` / `"150"` / `"150,5"` / `"150.50"` → centavos (entero). Vacío → 0.
 * Inválido → `null`. Más de 2 decimales → `null` (no se redondea en silencio).
 */
export function textoParaCentavos(texto: string): number | null {
  let s = texto.replace(/R\$/g, "").replace(/\s/g, "");
  if (s === "") return 0;
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    s = s.replace(/\./g, ""); // puntos solo como miles, en grupos exactos de 3
  } else if (!/^\d+([.,]\d{1,2})?$/.test(s)) {
    return null; // "1.2345", "0.001", "1.2.3": ambiguos → se rechazan
  }
  s = s.replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : null;
}

/** Centavos → `"1.234,56"` (sin prefijo R$). */
export function centavosParaTexto(centavos: number): string {
  const neg = centavos < 0;
  const abs = String(Math.abs(Math.trunc(centavos))).padStart(3, "0");
  const inteiro = abs.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${inteiro},${abs.slice(-2)}`;
}

/**
 * Factor tecleado (`"0,045"`, `"1.2"`) → string decimal con `casas` fijas
 * (`"0.0450"`). Vacío → `"0"` con casas. Más casas que las permitidas o texto
 * inválido → `null`.
 */
export function textoParaFator(texto: string, casas: number): string | null {
  const s = texto.trim().replace(",", ".");
  if (s === "") return `0.${"0".repeat(casas)}`;
  const m = /^(\d{1,3})(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const dec = m[2] ?? "";
  if (dec.length > casas) return null;
  return `${Number(m[1])}.${dec.padEnd(casas, "0")}`;
}

/** Factor string (`"1.2000"`) → texto pt-BR (`"1,2000"`). */
export function fatorParaTexto(fator: string): string {
  return fator.replace(".", ",");
}

/** AAAAMMDD → `AAAA-MM-DD` para `<input type=date>`; 0 → vacío. */
export function dataIntParaIso(dt: number): string {
  if (!dt) return "";
  const s = String(dt).padStart(8, "0");
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** `AAAA-MM-DD` → AAAAMMDD; vacío → 0; inválido → `null`. */
export function isoParaDataInt(iso: string): number | null {
  if (iso === "") return 0;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Number(iso.replaceAll("-", "")) : null;
}

/** Solo dígitos, cortado a `max`. */
export function somenteDigitos(texto: string, max: number): string {
  return texto.replace(/\D/g, "").slice(0, max);
}

/** Dígitos de CPF (parciales o completos) → máscara `000.000.000-00` progresiva. */
export function mascararCpf(texto: string): string {
  const d = somenteDigitos(texto, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Dígitos de CEP → máscara `00000-000` progresiva. */
export function mascararCep(texto: string): string {
  const d = somenteDigitos(texto, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}
