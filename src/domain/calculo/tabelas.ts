// Tablas fijas del cálculo de beneficio (CALCBENF / BATCHPGT / CALCDSCT).
//
// LEGACY-QUIRK(D1): el legado carga estas tablas con MOVEs fijos en el código,
// aunque el DDM de PROGRAMA-SOCIAL tiene GRP-PARAM-REGIONAL / GRP-FAIXA-CALCULO.
// Se replican tal cual: los grupos del programa se persisten y editan, pero el
// motor NO los usa.
//
// Unidades: factores y alícuotas como string decimal (se leen con `fator()`);
// topes de tramo en centavos enteros (como el resto del dinero persistido).

/** Una posición de `#TAB-REG (N3.4/27)`. */
export interface FatorRegional {
  /** Código de región (índice 1-based del legado). */
  readonly codRegiao: number;
  /** Etiqueta del comentario del legado (UF, REF o RESERVA). */
  readonly uf: string;
  /** Factor N3.4 como string. */
  readonly fator: string;
}

/**
 * LEGACY-QUIRK(D1): `#TAB-REG` — CALCBENF:91-117 (idéntica en BATCHPGT:124-150).
 * "REGIOES: 01-05=NORTE 06-10=NORDESTE 11-15=SUDESTE 16-20=SUL 21-25=C.OESTE 99=ESPEC".
 * Las posiciones 26–27 (RESERVA) existen pero nunca se leen: el motor solo
 * indexa la tabla para regiones 1–25 (CALCBENF:180).
 */
export const TAB_REG: readonly FatorRegional[] = [
  { codRegiao: 1, uf: "AC", fator: "1.3500" },
  { codRegiao: 2, uf: "AM", fator: "1.3200" },
  { codRegiao: 3, uf: "AP", fator: "1.3000" },
  { codRegiao: 4, uf: "PA", fator: "1.2800" },
  { codRegiao: 5, uf: "RO", fator: "1.3100" },
  { codRegiao: 6, uf: "MA", fator: "1.4000" },
  { codRegiao: 7, uf: "PI", fator: "1.3800" },
  { codRegiao: 8, uf: "CE", fator: "1.3500" },
  { codRegiao: 9, uf: "BA", fator: "1.3200" },
  { codRegiao: 10, uf: "PE", fator: "1.3600" },
  { codRegiao: 11, uf: "SP", fator: "1.1000" },
  { codRegiao: 12, uf: "RJ", fator: "1.1200" },
  { codRegiao: 13, uf: "MG", fator: "1.0800" },
  { codRegiao: 14, uf: "ES", fator: "1.0500" },
  { codRegiao: 15, uf: "REF", fator: "1.0000" },
  { codRegiao: 16, uf: "PR", fator: "1.0500" },
  { codRegiao: 17, uf: "SC", fator: "1.0700" },
  { codRegiao: 18, uf: "RS", fator: "1.0300" },
  { codRegiao: 19, uf: "MS", fator: "1.1500" },
  { codRegiao: 20, uf: "MT", fator: "1.2000" },
  { codRegiao: 21, uf: "GO", fator: "1.1800" },
  { codRegiao: 22, uf: "TO", fator: "1.2500" },
  { codRegiao: 23, uf: "DF", fator: "1.1000" },
  { codRegiao: 24, uf: "RR", fator: "1.2200" },
  { codRegiao: 25, uf: "SE", fator: "1.3300" },
  { codRegiao: 26, uf: "RESERVA", fator: "1.0000" },
  { codRegiao: 27, uf: "RESERVA", fator: "1.0000" },
];

/** Factor usado para regiones fuera de 1–25 (incluye 0 y 99) — CALCBENF:183. */
export const FATOR_REGIONAL_PADRAO = "1.0000";

/** Una posición de `#FAIXA-RENDA (N9.2/5)` + `#FATOR-FAIXA (N3.4/5)`. */
export interface FaixaRenda {
  /** Tope del tramo en centavos (comparación `renda <= teto`). */
  readonly teto: number;
  /** Factor N3.4 como string. */
  readonly fator: string;
}

/**
 * LEGACY-QUIRK(D1): tramos de renta — CALCBENF:120-129 (idénticos en BATCHPGT:153-162).
 * Renta > 9.999,99 no encaja en ningún tramo (ver D17 en `motor.ts`).
 */
export const FAIXAS_RENDA: readonly FaixaRenda[] = [
  { teto: 30000, fator: "1.0000" },
  { teto: 60000, fator: "0.8500" },
  { teto: 100000, fator: "0.7000" },
  { teto: 150000, fator: "0.5500" },
  { teto: 999999, fator: "0.4000" },
];

/** Una posición de `#FAIXA-CONTRIB (N9.2/4)` + `#ALIQ-CONTRIB (N3.2/4)`. */
export interface FaixaContribuicao {
  /** Tope del tramo en centavos (comparación `bruto <= teto`). */
  readonly teto: number;
  /** Alícuota N3.2 como string (fracción, no porcentaje). */
  readonly aliquota: string;
}

/**
 * LEGACY-QUIRK(D1): contribución social progresiva — CALCDSCT:58-65.
 * Bruto > 9.999,99 no encaja en ningún tramo y queda sin contribución.
 */
export const FAIXAS_CONTRIBUICAO: readonly FaixaContribuicao[] = [
  { teto: 50000, aliquota: "0.03" },
  { teto: 100000, aliquota: "0.05" },
  { teto: 200000, aliquota: "0.07" },
  { teto: 999999, aliquota: "0.09" },
];
