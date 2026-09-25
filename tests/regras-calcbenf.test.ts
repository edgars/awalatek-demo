import { describe, expect, it } from "vitest";
import { calcular, fatorFamiliar, fatorIdade, type EntradaCalculo } from "@/domain/calculo/motor";

// Regras de CALCBENF (FR-CAL-04/06/08) sem teste nominal: fator familiar, fator de
// idade, 13.º e abono natalino. Cada teste isola o ramo/cômputo da regra no motor
// do cálculo individual e confere os centavos exatos (truncado, sem ROUNDED).

/** Entrada neutra: todos os fatores = 1, sem reajuste, programa tipo P, março/2026. */
const base: EntradaCalculo = {
  vlrBase: 100000, // 1.000,00
  fatorReajuste: "0.0000",
  tipoPrograma: "P",
  codRegiao: 15, // REF 1,0000
  numDependentes: 0,
  renda: 10000, // 100,00 → 1,0000
  dtNascimento: 19960510, // 30 anos em 2026
  competencia: 202603,
};

const DEZ = 202612;

describe("CALCBENF — fator familiar (FR-CAL-04)", () => {
  it("RK-c0d4163cc4d1 (CALCBENF:190): IF #NUM-DEP <= 2 — 1 e 2 dependentes no ramo 1,0000 + n × 0,05; 3 não", () => {
    expect(fatorFamiliar(1)).toBe("1.0500");
    expect(fatorFamiliar(2)).toBe("1.1000");
    expect(fatorFamiliar(3)).toBe("1.1300"); // ramo seguinte
    expect(calcular({ ...base, numDependentes: 2 }).vlrBenf).toBe(110000);
  });

  it("RK-3461de4d19c8 (CALCBENF:191): #FATOR-FAM = 1,0000 + (#NUM-DEP × 0,0500)", () => {
    expect(calcular({ ...base, numDependentes: 1 })).toMatchObject({ vlrBenf: 105000, vlrBruto: 105000, vlrDesc: 3150, vlrLiq: 101850 });
  });

  it("RK-b13aff8bf789 (CALCBENF:193): IF #NUM-DEP <= 4 — 3 e 4 no ramo 1,1000 + (n − 2) × 0,03; 5 não", () => {
    expect(fatorFamiliar(4)).toBe("1.1600");
    expect(fatorFamiliar(5)).toBe("1.1800"); // ramo ≥ 5
    expect(calcular({ ...base, numDependentes: 4 }).vlrBenf).toBe(116000);
  });

  it("RK-5aae34cd08cf (CALCBENF:194): #FATOR-FAM = 1,1000 + ((#NUM-DEP − 2) × 0,0300)", () => {
    expect(calcular({ ...base, numDependentes: 3 })).toMatchObject({ vlrBenf: 113000, vlrDesc: 3390, vlrLiq: 109610 });
  });
});

describe("CALCBENF — fator de idade (FR-CAL-06)", () => {
  it("RK-7b2181c12f19 (CALCBENF:206): #IDADE = #ANO − #ANO-NASC, só pelo ano da competência", () => {
    // Nascido em 31/12/1966: 59 anos reais em 03/2026, 60 pelo ano → 1,1000.
    expect(fatorIdade(19661231, 2026)).toBe("1.1000");
    expect(calcular({ ...base, dtNascimento: 19661231 }).vlrBenf).toBe(110000);
    expect(calcular({ ...base, dtNascimento: 19670101 }).vlrBenf).toBe(100000);
  });

  it("RK-2f190186d76b (CALCBENF:207): IF #IDADE >= 65 → 1,1500", () => {
    expect(calcular({ ...base, dtNascimento: 19610101 }).vlrBenf).toBe(115000); // 65
    expect(calcular({ ...base, dtNascimento: 19620101 }).vlrBenf).toBe(110000); // 64 → ramo ≥ 60
  });

  it("RK-511b65011b73 (CALCBENF:210): IF #IDADE >= 60 → 1,1000", () => {
    expect(calcular({ ...base, dtNascimento: 19660101 }).vlrBenf).toBe(110000); // 60
    expect(calcular({ ...base, dtNascimento: 19670101 }).vlrBenf).toBe(100000); // 59 → 1,0000
  });
});

describe("CALCBENF — 13.º e abono natalino (FR-CAL-08)", () => {
  it("RK-3ac3d33b1b42 (CALCBENF:244): #VLR-13 = #VLR-BASE × #FATOR-REG × #FATOR-IDADE (sem fam., renda nem reajuste)", () => {
    const r = calcular({
      ...base,
      fatorReajuste: "0.0450",
      codRegiao: 1, // 1,35
      numDependentes: 2, // 1,10 (ignorado no 13.º)
      renda: 50000, // 0,85 (ignorado no 13.º)
      dtNascimento: 19560101, // 70 anos → 1,15
      competencia: DEZ,
    });
    // 1.000 × 1,35 × 1,15 = 1.552,50
    expect(r.vlr13).toBe(155250);
    // benefício: 1.451,5875 → 1.451,58 × 1,045 = 1.516,9011 → 1.516,90
    expect(r).toMatchObject({ vlrBenf: 151690, tipoPgto: "D" });
  });

  it("RK-0f5eb2af85a0 (CALCBENF:246): #VLR-TEMP = #VLR-13 × 100 — o 13.º é cortado em centavos inteiros", () => {
    // 333,33 × 1,32 = 439,9956 → 439,99
    expect(calcular({ ...base, vlrBase: 33333, codRegiao: 2, competencia: DEZ }).vlr13).toBe(43999);
  });

  it("RK-f53c75ffb923 (CALCBENF:247): #VLR-13 = #VLR-TEMP / 100 — trunca (arredondado seria 440,00)", () => {
    const r = calcular({ ...base, vlrBase: 33333, codRegiao: 2, competencia: DEZ });
    expect(r.vlr13).not.toBe(44000);
    expect(r).toMatchObject({ vlr13: 43999, vlrBruto: 87998, vlrDesc: 2639, vlrLiq: 85359 });
  });

  it("RK-5add7ccbf625 (CALCBENF:248): #VLR-BRUTO = #VLR-BENF + #VLR-13", () => {
    expect(calcular({ ...base, competencia: DEZ })).toMatchObject({ vlrBenf: 100000, vlr13: 100000, vlrAbono: 0, vlrBruto: 200000 });
    expect(calcular({ ...base, competencia: 202611 })).toMatchObject({ vlr13: 0, vlrBruto: 100000, tipoPgto: "N" });
  });

  it("RK-f81e5c8b9a62 (CALCBENF:251): IF #TIPO-PROG = 'A' — só programa tipo A tem abono", () => {
    expect(calcular({ ...base, tipoPrograma: "A", competencia: DEZ }).vlrAbono).toBe(15000);
    for (const tipo of ["P", "T"]) expect(calcular({ ...base, tipoPrograma: tipo, competencia: DEZ }).vlrAbono).toBe(0);
    expect(calcular({ ...base, tipoPrograma: "A", competencia: 202611 }).vlrAbono).toBe(0);
  });

  it("RK-602168305a78 (CALCBENF:252): #VLR-ABONO = #VLR-BENF × 0,15 (base = benefício, não o bruto)", () => {
    // 15 % de 1.000,00 = 150,00 (sobre o bruto 2.000,00 seria 300,00)
    expect(calcular({ ...base, tipoPrograma: "A", competencia: DEZ })).toMatchObject({
      vlrAbono: 15000,
      vlrBruto: 215000,
      vlrDesc: 6450,
      vlrLiq: 208550,
    });
  });

  it("RK-2aeddfcfa687 (CALCBENF:254): #VLR-TEMP = #VLR-ABONO × 100 — o abono é cortado em centavos inteiros", () => {
    // 333,33 × 0,15 = 49,9995 → 49,99
    expect(calcular({ ...base, vlrBase: 33333, tipoPrograma: "A", competencia: DEZ }).vlrAbono).toBe(4999);
  });

  it("RK-66a219e18a6a (CALCBENF:255): #VLR-ABONO = #VLR-TEMP / 100 — trunca (arredondado seria 50,00)", () => {
    // bruto 333,33 + 333,33 + 49,99 = 716,65; desconto 21,4995 → 21,49; líquido 695,16
    expect(calcular({ ...base, vlrBase: 33333, tipoPrograma: "A", competencia: DEZ })).toMatchObject({
      vlrAbono: 4999,
      vlrBruto: 71665,
      vlrDesc: 2149,
      vlrLiq: 69516,
    });
  });
});
