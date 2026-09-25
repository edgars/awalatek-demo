import { describe, expect, it } from "vitest";
import { valorEnviadoMoeda, VALOR_INVALIDO } from "./conversao";

describe("valorEnviadoMoeda", () => {
  it("padrão: vazio → 0; válido → centavos; inválido → VALOR_INVALIDO", () => {
    expect(valorEnviadoMoeda("")).toBe("0");
    expect(valorEnviadoMoeda("R$ ")).toBe("0");
    expect(valorEnviadoMoeda("1.234,56")).toBe("123456");
    expect(valorEnviadoMoeda("1,234")).toBe(VALOR_INVALIDO);
  });

  it("vazioComoVazio: vazio ou só R$ → \"\"; 0 informado → 0; inválido → VALOR_INVALIDO", () => {
    expect(valorEnviadoMoeda("", true)).toBe("");
    expect(valorEnviadoMoeda("   ", true)).toBe("");
    expect(valorEnviadoMoeda("R$", true)).toBe("");
    expect(valorEnviadoMoeda("R$ ", true)).toBe("");
    expect(valorEnviadoMoeda("0,00", true)).toBe("0");
    expect(valorEnviadoMoeda("R$ 200,00", true)).toBe("20000");
    expect(valorEnviadoMoeda("abc", true)).toBe(VALOR_INVALIDO);
  });
});
