import { describe, expect, it } from "vitest";
import { centavosParaTexto, dataIntParaIso, fatorParaTexto, isoParaDataInt, textoParaCentavos, textoParaFator } from "./conversao";

describe("conversão dos campos", () => {
  it("Moeda → centavos", () => {
    expect(textoParaCentavos("150,00")).toBe(15000);
    expect(textoParaCentavos("R$ 1.234,56")).toBe(123456);
    expect(textoParaCentavos("150")).toBe(15000);
    expect(textoParaCentavos("150,5")).toBe(15050);
    expect(textoParaCentavos("150.50")).toBe(15050);
    expect(textoParaCentavos("1.234")).toBe(123400);
    expect(textoParaCentavos("")).toBe(0);
    expect(textoParaCentavos("1,234")).toBeNull();
    expect(textoParaCentavos("abc")).toBeNull();
    expect(textoParaCentavos("-5")).toBeNull();
    expect(textoParaCentavos("1.234.567,89")).toBe(123456789);
    expect(textoParaCentavos("1.2345")).toBeNull();
    expect(textoParaCentavos("0.001")).toBeNull();
    expect(textoParaCentavos("1.2.3")).toBeNull();
    expect(textoParaCentavos("1234,5")).toBe(123450);
    expect(textoParaCentavos("12.34,56")).toBeNull();
  });

  it("centavos → texto", () => {
    expect(centavosParaTexto(15234)).toBe("152,34");
    expect(centavosParaTexto(5)).toBe("0,05");
    expect(centavosParaTexto(123456789)).toBe("1.234.567,89");
  });

  it("Fator → string", () => {
    expect(textoParaFator("0,0450", 4)).toBe("0.0450");
    expect(textoParaFator("0.045", 4)).toBe("0.0450");
    expect(textoParaFator("1", 4)).toBe("1.0000");
    expect(textoParaFator("", 4)).toBe("0.0000");
    expect(textoParaFator("12,5", 2)).toBe("12.50");
    expect(textoParaFator("0,04501", 4)).toBeNull();
    expect(textoParaFator("1000", 4)).toBeNull();
    expect(fatorParaTexto("1.2000")).toBe("1,2000");
  });

  it("DataLegada ↔ AAAAMMDD", () => {
    expect(isoParaDataInt("2026-01-31")).toBe(20260131);
    expect(isoParaDataInt("")).toBe(0);
    expect(isoParaDataInt("31/01/2026")).toBeNull();
    expect(dataIntParaIso(20260131)).toBe("2026-01-31");
    expect(dataIntParaIso(0)).toBe("");
  });
});

describe("máscaras de CPF e CEP", async () => {
  const { mascararCpf, mascararCep, somenteDigitos } = await import("./conversao");
  it("CPF progressivo", () => {
    expect(mascararCpf("")).toBe("");
    expect(mascararCpf("0123")).toBe("012.3");
    expect(mascararCpf("0123456")).toBe("012.345.6");
    expect(mascararCpf("01234567890")).toBe("012.345.678-90");
    expect(mascararCpf("012.345.678-901")).toBe("012.345.678-90");
  });
  it("CEP e dígitos", () => {
    expect(mascararCep("01310100")).toBe("01310-100");
    expect(mascararCep("0131")).toBe("0131");
    expect(somenteDigitos("a1b2c3", 2)).toBe("12");
  });
});
