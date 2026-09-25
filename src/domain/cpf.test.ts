import { describe, expect, it } from "vitest";
import { calculaDv1, calculaDv2, completaDv, mascaraCpfRelatorio, MSG_CPF_INVALIDO, normalizaCpfNumerico, validaCpfCompleto, validaModulo11 } from "./cpf";

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

describe("mascaraCpfLista", () => {
  it("mostra só os dígitos 7–11", async () => {
    const { mascaraCpfLista } = await import("./cpf");
    expect(mascaraCpfLista("01234567890")).toBe("***.***.678-90");
    expect(mascaraCpfLista("52998224725")).toBe("***.***.247-25");
  });
});

describe("mascaraCpfConsulta — CONSBENF (FR-CON-04, D7)", () => {
  it("RK-cfd080c8d910 (CONSBENF:177): CPF < 10000000000 (zero à esquerda) → 3 primeiros dígitos (LEGACY-QUIRK D7)", async () => {
    const { mascaraCpfConsulta } = await import("./cpf");
    expect(mascaraCpfConsulta("01234567890")).toBe("012.***.***-**");
    expect(mascaraCpfConsulta("00012345678")).toBe("000.***.***-**");
  });

  it("RK-cfd080c8d910 (CONSBENF:177): CPF ≥ 10000000000 → ***.***.XXX-XX (dígitos 7–9 e 10–11)", async () => {
    const { mascaraCpfConsulta } = await import("./cpf");
    expect(mascaraCpfConsulta("12345678909")).toBe("***.***.789-09");
    expect(mascaraCpfConsulta("10000000000")).toBe("***.***.000-00");
  });

  it("aceita CPF sem zeros à esquerda (N11) e com máscara", async () => {
    const { mascaraCpfConsulta } = await import("./cpf");
    expect(mascaraCpfConsulta("1234567890")).toBe("012.***.***-**");
    expect(mascaraCpfConsulta("123.456.789-09")).toBe("***.***.789-09");
  });
});

describe("cpf — CPF completo de VALBENEF (FR-VAL-02, D4b)", () => {
  it("CPF válido por módulo 11 (com e sem zero à esquerda)", () => {
    expect(validaCpfCompleto("11144477735")).toBe(true);
    expect(validaCpfCompleto("52998224725")).toBe(true);
    expect(validaCpfCompleto("01234567890")).toBe(true);
  });

  it("RK-b48d9743345d (VALBENEF:190) / RK-605e59b1fe7d (VALBENEF:195): 11 dígitos iguais → inválido", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(validaCpfCompleto(String(n).repeat(11))).toBe(false);
    }
  });

  it("RK-605e59b1fe7d (VALBENEF:195): repetidos são rejeitados mesmo quando o módulo 11 os aceitaria", () => {
    // 111.111.111-11 passa no módulo 11 (DV1 1, DV2 1); VALBENEF o rejeita por repetição.
    expect(validaModulo11("11111111111")).toBe(true);
    expect(validaCpfCompleto("11111111111")).toBe(false);
  });

  it("RK-b48d9743345d (VALBENEF:190): um dígito diferente → segue ao módulo 11", () => {
    expect(validaCpfCompleto("11111111112")).toBe(false); // DV2 incorreto
  });

  it("RK-e67e790f872a (VALBENEF:197): LEGACY-QUIRK(D4b) — 00000000000 é válido", () => {
    expect(validaCpfCompleto("00000000000")).toBe(true);
  });

  it("prefixo 000 sem dígitos todos iguais passa pelo módulo 11 (sem bypass)", () => {
    expect(validaCpfCompleto("00000000191")).toBe(true);
    expect(validaCpfCompleto("00000000192")).toBe(false);
    expect(validaCpfCompleto("00012345678")).toBe(validaModulo11("00012345678"));
  });

  it("RK-2dd4cb3c18cd (VALBENEF:209) / RK-9f7df44b6ca1 (VALBENEF:212): soma × pesos e resto do DV1", () => {
    // 012345678: soma 156 → resto 2 → DV1 9.
    expect(calculaDv1(d("012345678"))).toBe(9);
  });

  it("RK-ccc5388150f7 (VALBENEF:213): resto < 2 → DV1 0", () => {
    // 000000006: soma 12 → resto 1 → DV1 0; 000000000: resto 0 → 0.
    expect(calculaDv1(d("000000006"))).toBe(0);
    expect(calculaDv1(d("000000000"))).toBe(0);
  });

  it("RK-9985fab5aca5 (VALBENEF:216): DV1 = 11 − resto", () => {
    // 100000000: soma 10 → resto 10 → DV1 1.
    expect(calculaDv1(d("100000000"))).toBe(1);
  });

  it("RK-f19b73dfd406 (VALBENEF:218): DV1 diferente do 10º dígito → inválido", () => {
    expect(validaCpfCompleto("11144477725")).toBe(false);
  });

  it("RK-cb78ba074b4e (VALBENEF:227) / RK-23cb286f5641 (VALBENEF:230): soma × pesos e resto do DV2", () => {
    // 0000000019: 1×3 + 9×2 = 21 → resto 10 → DV2 1.
    expect(calculaDv2(d("0000000019"))).toBe(1);
  });

  it("RK-6381e8b050e1 (VALBENEF:231): resto < 2 → DV2 0", () => {
    // 0000000006: 6×2 = 12 → resto 1 → DV2 0.
    expect(calculaDv2(d("0000000006"))).toBe(0);
  });

  it("RK-03e29441143e (VALBENEF:234): DV2 = 11 − resto", () => {
    // 0000000001: 1×2 = 2 → resto 2 → DV2 9.
    expect(calculaDv2(d("0000000001"))).toBe(9);
  });

  it("RK-07ded10a38a1 (VALBENEF:236): DV2 diferente do 11º dígito → inválido", () => {
    expect(validaCpfCompleto("11144477736")).toBe(false);
  });

  it("CPF mal formado → false sem lançar", () => {
    for (const v of ["", "123", "0000000000", "000000000000", "111.444.777-35", "abcdefghijk"]) {
      expect(validaCpfCompleto(v)).toBe(false);
    }
  });
});

describe("cpf — normalizaCpfNumerico (N11)", () => {
  it("só dígitos, zeros à esquerda; vazio = 0; mais de 11 dígitos intactos", () => {
    expect(normalizaCpfNumerico("012.345.678-90")).toBe("01234567890");
    expect(normalizaCpfNumerico("123")).toBe("00000000123");
    expect(normalizaCpfNumerico("")).toBe("00000000000");
    expect(normalizaCpfNumerico("123456789012")).toBe("123456789012");
  });
});

describe("mascaraCpfRelatorio (RELPGT:110–113)", () => {
  it("***.XXX.XXX-XX com os dígitos 4–6, 7–9 e 10–11", () => {
    expect(mascaraCpfRelatorio("01234567890")).toBe("***.345.678-90");
    expect(mascaraCpfRelatorio("12345678062")).toBe("***.456.780-62");
  });

  it("CPF curto é completado com zeros à esquerda (N11 → A11)", () => {
    expect(mascaraCpfRelatorio("1234567890")).toBe("***.345.678-90");
    expect(mascaraCpfRelatorio("")).toBe("***.000.000-00");
  });
});
