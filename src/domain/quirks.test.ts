import { describe, expect, it } from "vitest";
import { corrige, detalheErroQuirks, lerQuirks, QUIRKS_CORRIGIVEIS, QUIRKS_PADRAO } from "./quirks";

describe("quirks — LEGACY_DOC_ESPECIAL_ENABLED (D4)", () => {
  it("ausente → false", () => {
    expect(lerQuirks({}).docEspecialHabilitado).toBe(false);
    expect(lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: "" }).docEspecialHabilitado).toBe(false);
  });

  it('"true" → true, "false" → false', () => {
    expect(lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: "true" }).docEspecialHabilitado).toBe(true);
    expect(lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: "false" }).docEspecialHabilitado).toBe(false);
  });

  it("outro valor → erro de configuração", () => {
    for (const v of ["TRUE", "1", "yes", "sim"]) {
      expect(() => lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: v })).toThrow(/LEGACY_DOC_ESPECIAL_ENABLED/);
    }
  });
});

describe("quirks — LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED (D18)", () => {
  it("ausente → false (segue o PRD); 'true' → réplica do legado", () => {
    expect(lerQuirks({}).statusBrancoAlteracao).toBe(false);
    expect(lerQuirks({ LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED: "true" }).statusBrancoAlteracao).toBe(true);
    expect(() => lerQuirks({ LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED: "sim" })).toThrow(
      /LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED/,
    );
  });
});

describe("quirks — SIFAP_QUIRKS_CORRIGIDOS", () => {
  it("ausente ou vazia → nenhuma correção (paridade com o legado)", () => {
    expect(lerQuirks({}).corrigidos.size).toBe(0);
    expect(lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "  " }).corrigidos.size).toBe(0);
    expect(QUIRKS_PADRAO.corrigidos.size).toBe(0);
  });

  it("lista separada por vírgulas, sem diferenciar maiúsculas, com espaços", () => {
    const q = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "d5, D17 ,D23,d4b" });
    expect([...q.corrigidos].sort()).toEqual(["D17", "D23", "D4b", "D5"]);
    expect(corrige(q, "D17")).toBe(true);
    expect(corrige(q, "D6")).toBe(false);
  });

  it("ALL → todas as correções exceto D7 (exige aprovação da auditoria: listar explicitamente)", () => {
    const todos = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "all" }).corrigidos;
    expect(todos.size).toBe(QUIRKS_CORRIGIVEIS.length - 1);
    expect(todos.has("D7")).toBe(false);
    const comD7 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "ALL,D7" }).corrigidos;
    expect(comD7.size).toBe(QUIRKS_CORRIGIVEIS.length);
  });

  it("detalheErroQuirks nomeia a variável inválida", () => {
    let erro: unknown;
    try {
      lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: "sim" });
    } catch (e) {
      erro = e;
    }
    expect(detalheErroQuirks(erro)).toMatch(/LEGACY_DOC_ESPECIAL_ENABLED/);
    expect(detalheErroQuirks(new Error("outro 12345678909"))).toBe("configuração LEGACY-QUIRK inválida");
  });

  it("id desconhecido, D4/D18 (flags próprias) ou D14/D15 (modelo) → erro de configuração", () => {
    for (const v of ["D99", "D4", "D18", "D14", "D15", "D5,XX"]) {
      expect(() => lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: v })).toThrow(/SIFAP_QUIRKS_CORRIGIDOS/);
    }
  });
});
