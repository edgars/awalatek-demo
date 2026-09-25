import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anoDe,
  competenciaParaInt,
  dataParaInt,
  formatarCompetencia,
  hoje,
  idadePorAno,
  intParaCompetencia,
  intParaData,
} from "./legacyDate";

describe("legacyDate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ISO ↔ AAAAMMDD, 0 ↔ null", () => {
    expect(dataParaInt("2026-09-24")).toBe(20260924);
    expect(dataParaInt("")).toBe(0);
    expect(dataParaInt(null)).toBe(0);
    expect(intParaData(20260924)).toBe("2026-09-24");
    expect(intParaData(0)).toBeNull();
  });

  it("entrada de data inválida lança erro", () => {
    expect(() => dataParaInt("24/09/2026")).toThrow();
    expect(() => dataParaInt("2026-9-24")).toThrow();
    expect(() => intParaData(2026092)).toThrow();
    expect(() => intParaData(-1)).toThrow();
  });

  it("rejeita mês fora de 01–12 e dia fora de 01–31 (só formato, sem D16)", () => {
    for (const v of ["2026-13-45", "2026-00-10", "2026-12-32", "2026-01-00"]) {
      expect(() => dataParaInt(v)).toThrow();
    }
    for (const v of [20261399, 20260010, 20261232, 20260100]) expect(() => intParaData(v)).toThrow();
    expect(() => competenciaParaInt("2026-00")).toThrow();
    expect(() => competenciaParaInt("2026-13")).toThrow();
    expect(() => intParaCompetencia(202600)).toThrow();
    expect(() => intParaCompetencia(202613)).toThrow();
    // Sem validação de calendário: 31/02 e 29/02 passam no formato (validados em E2).
    expect(dataParaInt("2025-02-31")).toBe(20250231);
    expect(intParaData(20250229)).toBe("2025-02-29");
    expect(intParaCompetencia(202612)).toBe("2026-12");
  });

  it("competência AAAA-MM ↔ AAAAMM", () => {
    expect(competenciaParaInt("2026-09")).toBe(202609);
    expect(competenciaParaInt("")).toBe(0);
    expect(intParaCompetencia(202609)).toBe("2026-09");
    expect(intParaCompetencia(0)).toBeNull();
    expect(() => competenciaParaInt("2026/09")).toThrow();
    expect(() => intParaCompetencia(20260)).toThrow();
  });

  it("idade = ano de referência − ano de nascimento (sem mês/dia)", () => {
    expect(anoDe(19850412)).toBe(1985);
    expect(idadePorAno(19850412, 2026)).toBe(41);
    expect(idadePorAno(19851231, 2026)).toBe(41);
  });

  it("hoje() respeita TZ=America/Sao_Paulo", () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    expect(hoje(new Date("2026-09-25T02:30:00Z"))).toEqual({ data: 20260924, hora: 233000 });
  });

  it("hoje() usa America/Sao_Paulo por padrão e aceita outra zona", () => {
    vi.stubEnv("TZ", "");
    expect(hoje(new Date("2026-09-25T02:30:00Z"))).toEqual({ data: 20260924, hora: 233000 });
    expect(hoje(new Date("2026-09-25T02:30:00Z"), "UTC")).toEqual({ data: 20260925, hora: 23000 });
  });

  it("formatarCompetencia: AAAAMM → MM/AAAA; 0 → null; inválida → erro", () => {
    expect(formatarCompetencia(199401)).toBe("01/1994");
    expect(formatarCompetencia(202612)).toBe("12/2026");
    expect(formatarCompetencia(0)).toBeNull();
    expect(() => formatarCompetencia(202613)).toThrow();
  });
});
