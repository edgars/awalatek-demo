import { describe, expect, it } from "vitest";
import { calculaDv1, calculaDv2, completaDv, MSG_CPF_INVALIDO, validaModulo11 } from "./cpf";

const d = (s: string) => Array.from(s, Number);

describe("cpf — módulo 11 (FR-BEN-03)", () => {
  it("RK-bc7d67f3dad4 (CADBENEF:113): mensagem literal", () => {
    expect(MSG_CPF_INVALIDO).toBe("CPF INVALIDO - DIGITO VERIFICADOR INCORRETO");
  });

  it("CPF válido com zero à esquerda", () => {
    expect(validaModulo11("01234567890")).toBe(true);
  });

  it("oráculos independentes de CPF conhecidos", () => {
    expect(validaModulo11("11144477735")).toBe(true);
    expect(validaModulo11("52998224725")).toBe(true);
    expect(validaModulo11("11144477736")).toBe(false);
  });

  it("CPF mal formado → false sem lançar", () => {
    for (const v of ["123", "abc45678901", "", "012345678900", "012.345.678-90", " 01234567890"]) {
      expect(validaModulo11(v)).toBe(false);
    }
  });

  it("RK-99ffed6e1d57 (CADBENEF:237): soma dígitos 1–9 × pesos 10..2", () => {
    // Soma = 156 → resto 2 → DV1 9. Só o 9º dígito (peso 2): soma 2 → DV1 9.
    expect(calculaDv1(d("012345678"))).toBe(9);
    expect(calculaDv1(d("000000001"))).toBe(9);
    // Peso 10 no 1º dígito: soma 10 → resto 10 → DV1 1.
    expect(calculaDv1(d("100000000"))).toBe(1);
  });

  it("RK-ab368e4ef3e2 (CADBENEF:240): resto por divisão inteira", () => {
    // Soma 22 (10+10+2) → resto 0 → DV1 0; soma 23 → resto 1 → DV1 0; soma 24 → 11−2 = 9.
    expect(calculaDv1(d("200000001"))).toBe(0); // 20+2 = 22
    expect(calculaDv1(d("200000010"))).toBe(0); // 20+3 = 23
    expect(calculaDv1(d("200000002"))).toBe(9); // 20+4 = 24
  });

  it("RK-a04fb0c62d98 (CADBENEF:241): resto < 2 → DV1 = 0", () => {
    expect(calculaDv1(d("010000001"))).toBe(0); // soma 11, resto 0
    expect(calculaDv1(d("100000001"))).toBe(0); // soma 12, resto 1
  });

  it("RK-02b5279daf63 (CADBENEF:244): DV1 = 11 − resto", () => {
    expect(calculaDv1(d("000000010"))).toBe(8); // soma 3
  });

  it("RK-476620ed64ce (CADBENEF:247): DV1 ≠ dígito 10 → inválido", () => {
    expect(validaModulo11("01234567800")).toBe(false);
  });

  it("RK-98472f98558e (CADBENEF:256): soma dígitos 1–10 × pesos 11..2", () => {
    expect(calculaDv2(d("0000000001"))).toBe(9); // soma 2
    expect(calculaDv2(d("1000000000"))).toBe(0); // soma 11
  });

  it("RK-d05375bd9555 (CADBENEF:259): resto por divisão inteira", () => {
    // 01234567 89 → soma 210 = 19×11 + 1 → resto 1 → DV2 0.
    expect(calculaDv2(d("0123456789"))).toBe(0);
    expect(calculaDv2(d("2000000002"))).toBe(7); // soma 22+4 = 26 → resto 4 → DV2 7
  });

  it("RK-8178f6bfb367 (CADBENEF:260): resto < 2 → DV2 = 0", () => {
    expect(calculaDv2(d("1000000000"))).toBe(0); // soma 11, resto 0
    expect(calculaDv2(d("0123456789"))).toBe(0); // resto 1
  });

  it("RK-a4491331af7d (CADBENEF:263): DV2 = 11 − resto", () => {
    expect(calculaDv2(d("0000000010"))).toBe(8); // soma 3
  });

  it("RK-9e739b6b003d (CADBENEF:266): DV2 ≠ dígito 11 → inválido", () => {
    expect(validaModulo11("01234567891")).toBe(false);
  });

  it("completaDv gera CPFs que validaModulo11 aceita", () => {
    expect(completaDv("012345678")).toBe("01234567890");
    for (const base of ["123456780", "234567891", "345678902", "456789013", "000000000", "999999999"]) {
      const cpf = completaDv(base);
      expect(cpf).toMatch(/^\d{11}$/);
      expect(validaModulo11(cpf)).toBe(true);
    }
    expect(() => completaDv("12345")).toThrow();
  });
});
