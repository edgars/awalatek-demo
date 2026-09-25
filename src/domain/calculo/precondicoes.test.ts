import { describe, expect, it } from "vitest";
import { MSG_BENEFICIARIO_NAO_ENCONTRADO, MSG_PROGRAMA_NAO_ENCONTRADO, verificarPrecondicoes } from "./precondicoes";

const ATIVO = { sitBeneficiario: "A" };
const PROG = { codPrograma: "PA01" };

describe("FR-CAL-02 — precondições do cálculo individual", () => {
  it("tudo ok → ano e mês da competência", () => {
    expect(verificarPrecondicoes({ competencia: 202609, beneficiario: ATIVO, programa: PROG })).toEqual({ ok: true, ano: 2026, mes: 9 });
  });

  it("competência inválida vem antes de tudo (FR-CAL-01)", () => {
    expect(verificarPrecondicoes({ competencia: 202613, beneficiario: null, programa: null })).toEqual({
      ok: false,
      mensagem: "COMPETENCIA INVALIDA",
    });
    expect(verificarPrecondicoes({ competencia: 202600, beneficiario: ATIVO, programa: PROG }).ok).toBe(false);
  });

  it("RK-a88a2f157187 — beneficiário inexistente", () => {
    expect(verificarPrecondicoes({ competencia: 202609, beneficiario: null, programa: null })).toEqual({
      ok: false,
      mensagem: "BENEFICIARIO NAO ENCONTRADO",
    });
    expect(MSG_BENEFICIARIO_NAO_ENCONTRADO).toBe("BENEFICIARIO NAO ENCONTRADO");
  });

  it("RK-a116de8e94cf — status ≠ A (verificado antes do programa)", () => {
    for (const s of ["S", "C", "I", "D"]) {
      expect(verificarPrecondicoes({ competencia: 202609, beneficiario: { sitBeneficiario: s }, programa: null })).toEqual({
        ok: false,
        mensagem: `BENEFICIARIO NAO ATIVO - STATUS: ${s}`,
      });
    }
  });

  it("RK-b030809a3f7c — programa inexistente", () => {
    expect(verificarPrecondicoes({ competencia: 202609, beneficiario: ATIVO, programa: null })).toEqual({
      ok: false,
      mensagem: "PROGRAMA NAO ENCONTRADO",
    });
    expect(MSG_PROGRAMA_NAO_ENCONTRADO).toBe("PROGRAMA NAO ENCONTRADO");
  });
});
