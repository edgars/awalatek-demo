import { describe, expect, it } from "vitest";
import { lerQuirks } from "./quirks";

describe("quirks — LEGACY_DOC_ESPECIAL_ENABLED (D4)", () => {
  it("ausente → false", () => {
    expect(lerQuirks({})).toEqual({ docEspecialHabilitado: false });
    expect(lerQuirks({ LEGACY_DOC_ESPECIAL_ENABLED: "" })).toEqual({ docEspecialHabilitado: false });
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
