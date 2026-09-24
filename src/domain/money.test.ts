import { describe, expect, it } from "vitest";
import { aCentavos, dec, deCentavos, fator, redondear, truncar } from "./money";

describe("money", () => {
  it("trunca positivos a 2 decimais", () => {
    expect(truncar("12.3456").toString()).toBe("12.34");
    expect(truncar("12.349999").toString()).toBe("12.34");
  });

  it("trunca negativos em direção a zero", () => {
    expect(truncar("-12.3456").toString()).toBe("-12.34");
  });

  it("redondear soma 0,005 e trunca (D11)", () => {
    expect(redondear("12.345").toString()).toBe("12.35");
    expect(redondear("12.344").toString()).toBe("12.34");
  });

  it("redondear aplica +0,005 também a negativos, como o legado", () => {
    expect(redondear("-12.345").toString()).toBe("-12.34");
    expect(redondear("-12.346").toString()).toBe("-12.34");
    expect(redondear("-12.3551").toString()).toBe("-12.35");
  });

  it("converte reais ↔ centavos", () => {
    expect(aCentavos("1234.567")).toBe(123456);
    expect(aCentavos("-0.019")).toBe(-1);
    expect(deCentavos(123456).toString()).toBe("1234.56");
    expect(deCentavos(5).toFixed(2)).toBe("0.05");
  });

  it("fator converte strings N3.4/N3.2/N5.6", () => {
    expect(fator("1.3500").toFixed(4)).toBe("1.3500");
    expect(fator("0.05").times(deCentavos(100000)).toFixed(2)).toBe("50.00");
    expect(fator("1.050000").toString()).toBe("1.05");
  });

  it("rejeita float e entradas inválidas", () => {
    expect(() => dec(0.1)).toThrow();
    expect(() => deCentavos(1.5)).toThrow();
    expect(() => dec("abc")).toThrow();
    expect(() => fator("1,35")).toThrow();
    expect(dec(150).toString()).toBe("150");
  });

  it("aritmética decimal sem erro binário", () => {
    expect(dec("0.1").plus("0.2").toString()).toBe("0.3");
  });
});
