import { describe, expect, it } from "vitest";
import { FAIXAS_CONTRIBUICAO, FAIXAS_RENDA, FATOR_REGIONAL_PADRAO, TAB_REG } from "./tabelas";

describe("tabelas fixas (LEGACY-QUIRK D1)", () => {
  it("#TAB-REG tem 27 posições 1-based, 26–27 reserva", () => {
    expect(TAB_REG).toHaveLength(27);
    TAB_REG.forEach((r, i) => expect(r.codRegiao).toBe(i + 1));
    expect(TAB_REG[25]).toEqual({ codRegiao: 26, uf: "RESERVA", fator: "1.0000" });
    expect(TAB_REG[26]).toEqual({ codRegiao: 27, uf: "RESERVA", fator: "1.0000" });
    expect(FATOR_REGIONAL_PADRAO).toBe("1.0000");
  });

  it("fatores regionais idênticos a CALCBENF:91-115", () => {
    const esperado =
      "AC 1.3500 AM 1.3200 AP 1.3000 PA 1.2800 RO 1.3100 MA 1.4000 PI 1.3800 CE 1.3500 BA 1.3200 PE 1.3600 " +
      "SP 1.1000 RJ 1.1200 MG 1.0800 ES 1.0500 REF 1.0000 PR 1.0500 SC 1.0700 RS 1.0300 MS 1.1500 MT 1.2000 " +
      "GO 1.1800 TO 1.2500 DF 1.1000 RR 1.2200 SE 1.3300";
    expect(TAB_REG.slice(0, 25).map((r) => `${r.uf} ${r.fator}`).join(" ")).toBe(esperado);
  });

  it("faixas de renda (CALCBENF:120-129) e contribuição (CALCDSCT:58-65)", () => {
    expect(FAIXAS_RENDA).toEqual([
      { teto: 30000, fator: "1.0000" },
      { teto: 60000, fator: "0.8500" },
      { teto: 100000, fator: "0.7000" },
      { teto: 150000, fator: "0.5500" },
      { teto: 999999, fator: "0.4000" },
    ]);
    expect(FAIXAS_CONTRIBUICAO.map((f) => [f.teto, f.aliquota])).toEqual([
      [50000, "0.03"],
      [100000, "0.05"],
      [200000, "0.07"],
      [999999, "0.09"],
    ]);
  });
});
