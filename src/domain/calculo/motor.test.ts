import { describe, expect, it } from "vitest";
import {
  calcular,
  competenciaDaData,
  fatorFamiliar,
  fatorIdade,
  fatorRegional,
  fatorRenda,
  MSG_COMPETENCIA_INVALIDA,
  validarCompetencia,
  type EntradaCalculo,
} from "./motor";

/** Entrada neutra: todos os fatores = 1, sem reajuste, mês normal. */
const base: EntradaCalculo = {
  vlrBase: 100000, // 1.000,00
  fatorReajuste: "0.0000",
  tipoPrograma: "B",
  codRegiao: 15, // REF 1.0000
  numDependentes: 0,
  renda: 10000, // 100,00 → 1.0000
  dtNascimento: 19960510, // 30 anos em 2026
  competencia: 202603,
};

describe("FR-CAL-01 — competência (RK-7116b6a5174c, RK-140d297f9d0c, RK-886f1116333c)", () => {
  it("separa ano e mês", () => {
    expect(validarCompetencia(202612)).toEqual({ ok: true, ano: 2026, mes: 12 });
    expect(validarCompetencia(202601)).toEqual({ ok: true, ano: 2026, mes: 1 });
  });

  it("mês fora de 1–12 → COMPETENCIA INVALIDA", () => {
    for (const c of [202600, 202613, 202699, 2026, 0, -1, 1000000, 2026.5]) {
      expect(validarCompetencia(c)).toEqual({ ok: false, mensagem: "COMPETENCIA INVALIDA" });
    }
  });

  it("o ano não é validado (como no legado)", () => {
    expect(validarCompetencia(112)).toEqual({ ok: true, ano: 1, mes: 12 });
  });

  it("calcular lança a mensagem literal", () => {
    expect(() => calcular({ ...base, competencia: 202613 })).toThrow(MSG_COMPETENCIA_INVALIDA);
  });
});

describe("FR-LOT-01 — competência do lote (RK-275ebe83e773, RK-af5872bb5b6c, RK-8b46847de08b)", () => {
  it("ano/mês da data de execução", () => {
    expect(competenciaDaData(20261201)).toBe(202612);
    expect(competenciaDaData(20260131)).toBe(202601);
    expect(competenciaDaData(20260924)).toBe(202609);
  });
  it("rejeita data não inteira", () => {
    expect(() => competenciaDaData(2026.1)).toThrow();
  });
});

describe("FR-CAL-03 — fator regional (RK-f8d9475ad104, RK-0dd27e7579c4)", () => {
  it("regiões 1–25 da tabela", () => {
    expect(fatorRegional(1)).toBe("1.3500");
    expect(fatorRegional(6)).toBe("1.4000");
    expect(fatorRegional(11)).toBe("1.1000");
    expect(fatorRegional(25)).toBe("1.3300");
  });
  it("outras regiões (0, 26, 27, 99) → 1.0000", () => {
    for (const r of [0, 26, 27, 99, -3]) expect(fatorRegional(r)).toBe("1.0000");
  });
});

describe("FR-CAL-04 — fator familiar (RK-2cced191e62e … RK-7e690c7a89ec; BATCHPGT RK-5ea515fab8f3 … RK-536175a6629f)", () => {
  it.each([
    [0, "1.0000"],
    [1, "1.0500"],
    [2, "1.1000"],
    [3, "1.1300"],
    [4, "1.1600"],
    [5, "1.1800"],
    [6, "1.2000"],
    [10, "1.2800"],
    [99, "3.0600"],
  ])("%i dependentes → %s", (n, f) => expect(fatorFamiliar(n)).toBe(f));

  it("rejeita negativo e não inteiro", () => {
    expect(() => fatorFamiliar(-1)).toThrow();
    expect(() => fatorFamiliar(1.5)).toThrow();
  });
});

describe("FR-CAL-05 — fator de renda (RK-f69f8dc0b6c9, RK-bf29157d9a87)", () => {
  it.each([
    [0, "1.0000"],
    [30000, "1.0000"],
    [30001, "0.8500"],
    [60000, "0.8500"],
    [60001, "0.7000"],
    [100000, "0.7000"],
    [150000, "0.5500"],
    [150001, "0.4000"],
    [999999, "0.4000"],
  ])("renda %i centavos → %s", (r, f) => expect(fatorRenda(r)).toBe(f));

  it("LEGACY-QUIRK(D17): renda > 9.999,99 sem anterior → 0 (individual)", () => {
    expect(fatorRenda(1000000)).toBe("0.0000");
  });

  it("LEGACY-QUIRK(D17): renda > 9.999,99 com anterior → arrasta (lote)", () => {
    expect(fatorRenda(1000000, "0.8500")).toBe("0.8500");
    // o anterior não interfere quando a renda encaixa num tramo
    expect(fatorRenda(50000, "0.4000")).toBe("0.8500");
  });
});

describe("FR-CAL-06 — fator de idade (RK-999fc6833a38 … RK-f036e04b0398; BATCHPGT RK-714fd6ddfb82 … RK-783a0059ec74)", () => {
  it.each([
    [19610101, "1.1500"], // 65
    [19401231, "1.1500"], // 86
    [19621231, "1.1000"], // 64
    [19660101, "1.1000"], // 60
    [19670101, "1.0000"], // 59
    [20081231, "1.0000"], // 18
    [20090101, "1.0500"], // 17
    [20260101, "1.0500"], // 0
  ])("nascimento %i em 2026 → %s", (dt, f) => expect(fatorIdade(dt, 2026)).toBe(f));

  it("idade só por ano: nascido em 31/12/1961 tem 65 em qualquer mês de 2026", () => {
    expect(fatorIdade(19611231, 2026)).toBe("1.1500");
  });
});

describe("FR-CAL-07 — valor mensal com truncado duplo (RK-92d4dfd5101f, RK-4bef7758397d, RK-bb591a41dbf3, RK-9ca5d0466ba9)", () => {
  it("trunca após o produto dos fatores e de novo após o reajuste", () => {
    // BASE 333,33 × 1.0500 (1 dep) = 349,9965 → 349,99 ; × 1.0375 = 363,114625 → 363,11
    // (truncado único daria 349,9965 × 1.0375 = 363,1213… → 363,12)
    const r = calcular({ ...base, vlrBase: 33333, numDependentes: 1, fatorReajuste: "0.0375" });
    expect(r.vlrBenf).toBe(36311);
    expect(r.tipoPgto).toBe("N");
  });

  it("LEGACY-QUIRK(D8): reaplica (1 + FATOR-REAJ) sobre o VLR-BASE recebido", () => {
    const r = calcular({ ...base, fatorReajuste: "0.1000" });
    expect(r.vlrBenf).toBe(110000);
  });

  it("FATOR-REAJ é truncado a 4 casas ao ser movido (N3.4)", () => {
    // 1000,00 × (1 + 0.1234) = 1123,40 (0.12349 → 0.1234)
    expect(calcular({ ...base, fatorReajuste: "0.12349" }).vlrBenf).toBe(112340);
  });
});

describe("FR-CAL-08 — 13.º e abono (RK-be875b52514d … RK-e8d3c677f5bc, RK-46191b29bce5)", () => {
  it("fora de dezembro: tipo N, sem 13.º nem abono mesmo para programa A", () => {
    const r = calcular({ ...base, tipoPrograma: "A" });
    expect(r).toMatchObject({ tipoPgto: "N", vlr13: 0, vlrAbono: 0, vlrBruto: 100000 });
  });

  it("dezembro, programa não A: tipo D, 13.º = BASE × F.REG × F.IDADE (D3), sem abono", () => {
    // 1000,00 × 1.3500 (AC) × 1.0500 (1 dep: não entra no 13.º) × 1.1500 (65+) ...
    // benf = 1000 × 1.35 × 1.05 × 1 × 1.15 = 1630,125 → 1630,12
    // 13.º = 1000 × 1.35 × 1.15 = 1552,50 ; bruto = 3182,62
    const r = calcular({ ...base, competencia: 202612, codRegiao: 1, numDependentes: 1, dtNascimento: 19500101 });
    expect(r).toMatchObject({ tipoPgto: "D", vlrBenf: 163012, vlr13: 155250, vlrAbono: 0, vlrBruto: 318262 });
  });

  it("dezembro, programa A: abono = VLR-BENF × 0.15 (não o bruto), somado ao bruto", () => {
    // benf 1630,12 ; abono = 244,518 → 244,51 ; bruto = 1630,12 + 1552,50 + 244,51 = 3427,13
    const r = calcular({
      ...base,
      competencia: 202612,
      tipoPrograma: "A",
      codRegiao: 1,
      numDependentes: 1,
      dtNascimento: 19500101,
    });
    expect(r).toMatchObject({ tipoPgto: "D", vlrAbono: 24451, vlrBruto: 342713 });
  });

  it("tipo de programa comparado literalmente ('a' minúsculo não gera abono)", () => {
    expect(calcular({ ...base, competencia: 202612, tipoPrograma: "a" }).vlrAbono).toBe(0);
  });
});

describe("FR-CAL-09 — desconto simplificado 3 % (RK-4bee01aa2d9d, RK-d190c0ee61bb, RK-f673b82833b9, RK-65e0ed4d5b18)", () => {
  it("bruto 500,00 → sem desconto", () => {
    expect(calcular({ ...base, vlrBase: 50000 }).vlrDesc).toBe(0);
  });
  it("bruto 500,01 → 15,0003 truncado a 15,00", () => {
    const r = calcular({ ...base, vlrBase: 50001 });
    expect(r.vlrDesc).toBe(1500);
    expect(r.vlrLiq).toBe(48501);
  });
});

describe("FR-CAL-10 — líquido (RK-8d025b23228f, RK-45fca1f354da, RK-d8033ba178e5, RK-c28ec6795433)", () => {
  it("líquido = bruto − desconto", () => {
    // 1000,00: desc 30,00 ; líq 970,00
    expect(calcular(base)).toMatchObject({ vlrBruto: 100000, vlrDesc: 3000, vlrLiq: 97000 });
  });
  it("líquido negativo → 0", () => {
    const r = calcular({ ...base, fatorReajuste: "-1.5000" });
    expect(r.vlrBruto).toBe(-50000);
    expect(r.vlrLiq).toBe(0);
  });
});

describe("calcular — factor de renda efectivo e validação de entrada", () => {
  it("devolve o fator de renda usado (para o lote passar adiante — D17)", () => {
    expect(calcular({ ...base, renda: 45000 }).fatorRenda).toBe("0.8500");
    expect(calcular({ ...base, renda: 1000000 }).fatorRenda).toBe("0.0000");
    expect(calcular({ ...base, renda: 1000000, fatorRendaAnterior: "0.5500" }).fatorRenda).toBe("0.5500");
  });
  it("rejeita dinheiro não inteiro (centavos)", () => {
    expect(() => calcular({ ...base, vlrBase: 100.5 })).toThrow();
    expect(() => calcular({ ...base, renda: 1.5 })).toThrow();
  });
});
