// NFR-03 — regresión de cálculo al centavo. Cada caso fue calculado a mano a
// partir del fuente legado (CALCBENF:180-273, BATCHPGT:236-320, CALCDSCT:96-176),
// truncando en cada asignación como hace Natural (destino N9.2 → 2 decimales).
// Dinero en centavos; la aritmética se muestra en reales en los comentarios.
import { describe, expect, it } from "vitest";
import { calcularDescontos, type DescontoCadastrado } from "@/domain/calculo/descontos";
import { calcular, type EntradaCalculo } from "@/domain/calculo/motor";

describe("regressão CALCBENF/BATCHPGT — motor.calcular", () => {
  it("R1 — SP, 0 dep, renda ≤ 300, 30 anos, reajuste 5 %", () => {
    // F: reg 1.1000 · fam 1.0000 · rnd 1.0000 · idade 1.0000
    // benf = 600,00 × 1,10 = 660,00 ; × 1,05 = 693,00
    // desc = 693,00 × 0,03 = 20,79 ; líq = 672,21
    expect(
      calcular({
        vlrBase: 60000,
        fatorReajuste: "0.0500",
        tipoPrograma: "B",
        codRegiao: 11,
        numDependentes: 0,
        renda: 25000,
        dtNascimento: 19960510,
        competencia: 202603,
      }),
    ).toEqual({
      vlrBenf: 69300,
      vlr13: 0,
      vlrAbono: 0,
      vlrBruto: 69300,
      vlrDesc: 2079,
      vlrLiq: 67221,
      tipoPgto: "N",
      fatorRenda: "1.0000",
    });
  });

  it("R2 — MA, 3 dep, renda 450, 66 anos: truncado duplo do VLR-BENF (programa A fora de dezembro)", () => {
    // F: reg 1.4000 · fam 1.1000 + 1×0.0300 = 1.1300 · rnd 0.8500 · idade (2026−1960=66) 1.1500
    // 333,33 × 1,40 = 466,662 ; × 1,13 = 527,32806 ; × 0,85 = 448,228851 ; × 1,15 = 515,46317865 → 515,46
    // 515,46 × 1,0375 = 534,78975 → 534,78   (truncado único daria 534,79)
    // desc = 534,78 × 0,03 = 16,0434 → 16,04 ; líq = 518,74 ; sem abono (mês 7)
    expect(
      calcular({
        vlrBase: 33333,
        fatorReajuste: "0.0375",
        tipoPrograma: "A",
        codRegiao: 6,
        numDependentes: 3,
        renda: 45000,
        dtNascimento: 19600815,
        competencia: 202607,
      }),
    ).toEqual({
      vlrBenf: 53478,
      vlr13: 0,
      vlrAbono: 0,
      vlrBruto: 53478,
      vlrDesc: 1604,
      vlrLiq: 51874,
      tipoPgto: "N",
      fatorRenda: "0.8500",
    });
  });

  const dezembro: EntradaCalculo = {
    vlrBase: 50000,
    fatorReajuste: "0.0200",
    tipoPrograma: "A",
    codRegiao: 1, // AC 1.3500
    numDependentes: 1, // 1.0500
    renda: 80000, // 0.7000
    dtNascimento: 19650301, // 61 anos → 1.1000
    competencia: 202612,
  };

  it("R3 — dezembro, programa A: 13.º (D3) + abono sobre VLR-BENF", () => {
    // benf = 500,00 × 1,35 = 675,00 ; × 1,05 = 708,75 ; × 0,70 = 496,125 ; × 1,10 = 545,7375 → 545,73
    //        545,73 × 1,02 = 556,6446 → 556,64
    // 13.º = 500,00 × 1,35 × 1,10 = 742,50            (sem "meses ativos/12" — D3)
    // bruto = 556,64 + 742,50 = 1299,14
    // abono = 556,64 × 0,15 = 83,496 → 83,49 ; bruto = 1382,63
    // desc = 1382,63 × 0,03 = 41,4789 → 41,47 ; líq = 1341,16
    expect(calcular(dezembro)).toEqual({
      vlrBenf: 55664,
      vlr13: 74250,
      vlrAbono: 8349,
      vlrBruto: 138263,
      vlrDesc: 4147,
      vlrLiq: 134116,
      tipoPgto: "D",
      fatorRenda: "0.7000",
    });
  });

  it("R4 — dezembro, programa não A: 13.º sem abono", () => {
    // bruto = 556,64 + 742,50 = 1299,14 ; desc = 38,9742 → 38,97 ; líq = 1260,17
    expect(calcular({ ...dezembro, tipoPrograma: "B" })).toEqual({
      vlrBenf: 55664,
      vlr13: 74250,
      vlrAbono: 0,
      vlrBruto: 129914,
      vlrDesc: 3897,
      vlrLiq: 126017,
      tipoPgto: "D",
      fatorRenda: "0.7000",
    });
  });

  const neutro: EntradaCalculo = {
    vlrBase: 50000,
    fatorReajuste: "0.0000",
    tipoPrograma: "B",
    codRegiao: 15, // REF 1.0000
    numDependentes: 0,
    renda: 10000,
    dtNascimento: 19960510,
    competencia: 202605,
  };

  it("R5 — desconto: bruto 500,00 (≤ 500) sem desconto; 500,01 (> 500) com 3 %", () => {
    // 500,00: não > 500 → desc 0 ; líq 500,00
    expect(calcular(neutro)).toMatchObject({ vlrBruto: 50000, vlrDesc: 0, vlrLiq: 50000 });
    // 500,01 × 0,03 = 15,0003 → 15,00 ; líq 485,01
    expect(calcular({ ...neutro, vlrBase: 50001 })).toMatchObject({ vlrBruto: 50001, vlrDesc: 1500, vlrLiq: 48501 });
  });

  it("R6 — líquido negativo → 0 (só com FATOR-REAJ < −1)", () => {
    // benf = 100,00 ; × (1 − 1,5) = −50,00 ; bruto −50,00 não > 500 → desc 0 ; líq −50,00 → 0
    expect(calcular({ ...neutro, vlrBase: 10000, fatorReajuste: "-1.5000" })).toMatchObject({
      vlrBruto: -5000,
      vlrDesc: 0,
      vlrLiq: 0,
    });
  });

  it("R7 — região 99 (fora de 1–25), 5 dep, renda 1.200, 17 anos", () => {
    // F: reg 1.0000 · fam 1.1600 + 1×0.0200 = 1.1800 · rnd 0.5500 · idade (2026−2009=17) 1.0500
    // 1000,00 × 1,18 = 1180,00 ; × 0,55 = 649,00 ; × 1,05 = 681,45 ; reaj 0 → 681,45
    // desc = 20,4435 → 20,44 ; líq = 661,01
    expect(
      calcular({ ...neutro, vlrBase: 100000, codRegiao: 99, numDependentes: 5, renda: 120000, dtNascimento: 20090101, competencia: 202601 }),
    ).toMatchObject({ vlrBenf: 68145, vlrBruto: 68145, vlrDesc: 2044, vlrLiq: 66101, fatorRenda: "0.5500" });
  });

  it("R8 — MT, 2 dep, renda 5.000, 60 anos, reajuste 10 %", () => {
    // F: reg 1.2000 · fam 1.0000 + 2×0.0500 = 1.1000 · rnd 0.4000 · idade (2026−1966=60) 1.1000
    // 1234,56 × 1,20 = 1481,472 ; × 1,10 = 1629,6192 ; × 0,40 = 651,84768 ; × 1,10 = 717,032448 → 717,03
    // 717,03 × 1,10 = 788,733 → 788,73 ; desc = 23,6619 → 23,66 ; líq = 765,07
    expect(
      calcular({
        ...neutro,
        vlrBase: 123456,
        fatorReajuste: "0.1000",
        codRegiao: 20,
        numDependentes: 2,
        renda: 500000,
        dtNascimento: 19661231,
        competencia: 202611,
      }),
    ).toMatchObject({ vlrBenf: 78873, vlrBruto: 78873, vlrDesc: 2366, vlrLiq: 76507, fatorRenda: "0.4000" });
  });

  it("R9 — PE, 4 dep, renda 300,01, 65 anos: fronteiras de fam/renda/idade", () => {
    // F: reg 1.3600 · fam 1.1000 + 2×0.0300 = 1.1600 · rnd (300,01 > 300) 0.8500 · idade (2026−1961=65) 1.1500
    // 400,00 × 1,36 = 544,00 ; × 1,16 = 631,04 ; × 0,85 = 536,384 ; × 1,15 = 616,8416 → 616,84 ; reaj 0
    // desc = 18,5052 → 18,50 ; líq = 598,34
    expect(
      calcular({ ...neutro, vlrBase: 40000, codRegiao: 10, numDependentes: 4, renda: 30001, dtNascimento: 19611231, competencia: 202608 }),
    ).toMatchObject({ vlrBenf: 61684, vlrDesc: 1850, vlrLiq: 59834, fatorRenda: "0.8500" });
  });

  describe("D17 — renda > 9.999,99", () => {
    const rico: EntradaCalculo = { ...neutro, vlrBase: 80000, fatorReajuste: "0.0500", renda: 1500000, competencia: 202604 };

    it("individual: fator 0 → benefício mensal 0", () => {
      // benf = 800,00 × 1 × 1 × 0 × 1 = 0 ; bruto 0 ; desc 0 ; líq 0
      expect(calcular(rico)).toEqual({
        vlrBenf: 0,
        vlr13: 0,
        vlrAbono: 0,
        vlrBruto: 0,
        vlrDesc: 0,
        vlrLiq: 0,
        tipoPgto: "N",
        fatorRenda: "0.0000",
      });
    });

    it("individual em dezembro: bruto = só o 13.º (não depende do fator de renda)", () => {
      // benf 0 ; 13.º = 800,00 × 1 × 1 = 800,00 ; abono = 0 × 0,15 = 0 ; bruto 800,00
      // desc = 24,00 ; líq = 776,00
      expect(calcular({ ...rico, competencia: 202612, tipoPrograma: "A" })).toMatchObject({
        vlrBenf: 0,
        vlr13: 80000,
        vlrAbono: 0,
        vlrBruto: 80000,
        vlrDesc: 2400,
        vlrLiq: 77600,
        tipoPgto: "D",
      });
    });

    it("lote: arrasta o fator do beneficiário calculado antes, encadeando", () => {
      // 1.º do lote (renda 450,00 → 0.8500): benf = 800,00 × 0,85 = 680,00 ; × 1,05 = 714,00
      const primeiro = calcular({ ...rico, renda: 45000 });
      expect(primeiro).toMatchObject({ vlrBenf: 71400, fatorRenda: "0.8500" });
      // 2.º (renda 15.000,00): usa 0.8500 → mesmos valores ; desc = 21,42 ; líq = 692,58
      const segundo = calcular({ ...rico, fatorRendaAnterior: primeiro.fatorRenda });
      expect(segundo).toMatchObject({ vlrBenf: 71400, vlrDesc: 2142, vlrLiq: 69258, fatorRenda: "0.8500" });
      // 3.º também > 9.999,99: encadeia o 0.8500
      expect(calcular({ ...rico, fatorRendaAnterior: segundo.fatorRenda }).vlrBenf).toBe(71400);
    });
  });
});

describe("regressão CALCDSCT — calcularDescontos", () => {
  const HOJE = 20260924;
  const d = (p: Partial<DescontoCadastrado> & Pick<DescontoCadastrado, "occurrence" | "tipoDesconto">): DescontoCadastrado => ({
    vlrDesconto: 0,
    pctDesconto: "0.00",
    dtInicioDsct: 20250101,
    dtFimDsct: 0,
    ...p,
  });

  it("D1 — só contribuição (sem descontos cadastrados)", () => {
    // 1500,00 ≤ 2000,00 → 7 % = 105,00 ; teto = 450,00
    expect(calcularDescontos({ vlrBruto: 150000, descontos: [], dtHoje: HOJE })).toMatchObject({
      vlrContribuicao: 10500,
      vlrTeto: 45000,
      vlrTotal: 10500,
      itens: [],
    });
    // 750,33 ≤ 1000,00 → 5 % = 37,5165 → 37,51
    expect(calcularDescontos({ vlrBruto: 75033, descontos: [], dtHoje: HOJE }).vlrTotal).toBe(3751);
    // 10.000,00 > 9.999,99 → nenhum tramo → 0
    expect(calcularDescontos({ vlrBruto: 1000000, descontos: [], dtHoje: HOJE }).vlrTotal).toBe(0);
  });

  it("D2 — judicial + não judicial que dispara o teto (LEGACY-QUIRK D2)", () => {
    // bruto 1000,00: contrib 5 % = 50,00 ; teto = 300,00
    // J fixo 280,00 → total 330,00 (judicial sem teto)
    // P 10 % = 100,00 → total 430,00 > 300,00 → 300,00 (recorta também o judicial)
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        d({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 28000 }),
        d({ occurrence: 2, tipoDesconto: "P", pctDesconto: "10.00" }),
      ],
      dtHoje: HOJE,
    });
    expect(r.vlrContribuicao).toBe(5000);
    expect(r.vlrTeto).toBe(30000);
    expect(r.itens.map((i) => [i.tipoDesconto, i.vlrItem, i.vlrTotalApos, i.tetoAplicado])).toEqual([
      ["J", 28000, 33000, false],
      ["P", 10000, 30000, true],
    ]);
    expect(r.vlrTotal).toBe(30000);
  });

  it("D3 — descontos fora de vigência são ignorados (e não disparam o teto)", () => {
    // contrib 50,00 ; J 400,00 → 450,00
    // A (fim 23/09/2026 < hoje) → ignorado ; I (início 01/10/2026 > hoje) → ignorado
    // total = 450,00 (acima do teto 300,00, porque nenhum não judicial vigente rodou)
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        d({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 40000 }),
        d({ occurrence: 2, tipoDesconto: "A", vlrDesconto: 5000, dtFimDsct: 20260923 }),
        d({ occurrence: 3, tipoDesconto: "I", pctDesconto: "5.00", dtInicioDsct: 20261001 }),
      ],
      dtHoje: HOJE,
    });
    expect(r.foraDeVigencia).toEqual([2, 3]);
    expect(r.vlrTotal).toBe(45000);
  });

  it("D4 — tipo desconhecido é ignorado (não soma)", () => {
    // bruto 2000,00: contrib 7 % = 140,00 ; 'C' cadastrado 50,00 → IGNORE ; total 140,00
    const r = calcularDescontos({
      vlrBruto: 200000,
      descontos: [d({ occurrence: 1, tipoDesconto: "C", vlrDesconto: 5000 })],
      dtHoje: HOJE,
    });
    expect(r.vlrTotal).toBe(14000);
    expect(r.itens[0]).toMatchObject({ aplicado: false, vlrItem: 0 });
  });

  it("D5 — I percentual com truncado por item", () => {
    // bruto 1234,57: contrib 7 % = 86,4199 → 86,41 ; I 7,50 % = 92,59275 → 92,59
    // total = 179,00 ; teto = 370,371 → 370,37
    expect(
      calcularDescontos({
        vlrBruto: 123457,
        descontos: [d({ occurrence: 1, tipoDesconto: "I", pctDesconto: "7.50" })],
        dtHoje: HOJE,
      }),
    ).toMatchObject({ vlrContribuicao: 8641, vlrTeto: 37037, vlrTotal: 17900 });
  });
});
