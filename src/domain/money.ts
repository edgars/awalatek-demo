import Decimal from "decimal.js";

// Aritmética monetaria única del sistema. `decimal.js` solo se importa aquí:
// el resto del código usa el tipo `Dinheiro` y estas funciones.

/** Instancia de Decimal aislada (no altera la configuración global de decimal.js). */
const D = Decimal.clone({ precision: 40 });

/** Valor monetario/decimal exacto. Nunca `number` flotante. */
export type Dinheiro = Decimal;

/** Entradas aceptadas: string decimal, entero seguro o `Dinheiro`. */
export type ValorDecimal = Dinheiro | string | number;

const RE_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Convierte a `Dinheiro`. Los `number` deben ser enteros seguros (no se
 * aceptan flotantes, para no arrastrar errores binarios); los strings deben
 * ser decimales simples (`"12.34"`, `"-0.5"`).
 */
export function dec(v: ValorDecimal): Dinheiro {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`valor numérico não inteiro: ${v}`);
    return new D(v);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!RE_DECIMAL.test(s)) throw new Error(`valor decimal inválido: "${v}"`);
    return new D(s);
  }
  if (Decimal.isDecimal(v)) return new D(v);
  throw new Error("valor decimal inválido");
}

/**
 * Trunca a 2 decimales hacia cero — padrón mainframe `×100 → entero → /100`.
 * `truncar("12.3456")` → 12.34; `truncar("-12.3456")` → -12.34.
 */
export function truncar(v: ValorDecimal): Dinheiro {
  return dec(v).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/**
 * LEGACY-QUIRK(D11): redondeo del informe consolidado = sumar 0,005 y truncar.
 * Se aplica igual a negativos (el legado suma +0,005 sin mirar el signo), por lo
 * que no es un redondeo simétrico. Solo para el informe consolidado (E7).
 */
export function redondear(v: ValorDecimal): Dinheiro {
  return truncar(dec(v).plus("0.005"));
}

/** Valor en reales → entero de centavos (truncado). `aCentavos("1234.567")` → 123456. */
export function aCentavos(v: ValorDecimal): number {
  const centavos = dec(v).times(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const n = centavos.toNumber();
  if (!Number.isSafeInteger(n)) throw new Error("valor fora do intervalo de centavos");
  return n;
}

/** Entero de centavos → `Dinheiro` en reales. `deCentavos(123456)` → 1234.56. */
export function deCentavos(n: number): Dinheiro {
  if (!Number.isSafeInteger(n)) throw new Error(`centavos devem ser inteiros: ${n}`);
  return new D(n).dividedBy(100);
}

/** Factor/porcentaje guardado como string (N3.4, N3.2, N5.6) → `Dinheiro`. */
export function fator(s: string): Dinheiro {
  if (typeof s !== "string") throw new Error("fator deve ser string decimal");
  return dec(s);
}
