import { describe, expect, it } from "vitest";
import { lerQuirks, QUIRKS_PADRAO } from "../quirks";
import { calcularCorrecao, mensagemSemIndiceIpca, selecionarPagamentos, temIndiceIpca } from "./correcao";
import { calcular, calcularLiquido, fatorRenda, type EntradaCalculo } from "./motor";

// Correcciones configurables del grupo B (cálculo y pagos): D8, D9, D13, D17, D22.
// Cada quirk en los dos modos: legado (default / lista vacía) y corregido.

const LEGADO = QUIRKS_PADRAO;
const q = (lista: string) => lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: lista });

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

describe("D8 — reajuste reaplicado pelo motor", () => {
  it("legado: VLR-BASE × (1 + FATOR-REAJ) de novo (1.000,00 × 1,10 = 1.100,00)", () => {
    const r = calcular({ ...base, fatorReajuste: "0.1000" }, LEGADO);
    expect(r).toMatchObject({ vlrBenf: 110000, vlrBruto: 110000, vlrDesc: 3300, vlrLiq: 106700 });
    // default do parâmetro = legado
    expect(calcular({ ...base, fatorReajuste: "0.1000" })).toEqual(r);
  });

  it("corrigido: não reaplica o reajuste (1.000,00; desc 3 % = 30,00; líquido 970,00)", () => {
    const r = calcular({ ...base, fatorReajuste: "0.1000" }, q("D8"));
    expect(r).toMatchObject({ vlrBenf: 100000, vlrBruto: 100000, vlrDesc: 3000, vlrLiq: 97000 });
  });

  it("corrigido: um único truncado (333,33 × 1,05 = 349,9965 → 349,99; legado 363,11)", () => {
    const e = { ...base, vlrBase: 33333, numDependentes: 1, fatorReajuste: "0.0375" };
    expect(calcular(e, LEGADO).vlrBenf).toBe(36311);
    expect(calcular(e, q("D8"))).toMatchObject({ vlrBenf: 34999, vlrBruto: 34999, vlrDesc: 0, vlrLiq: 34999 });
  });

  it("corrigido em dezembro (programa A): abono sobre o mensal sem reajuste reaplicado", () => {
    const e = { ...base, competencia: 202612, tipoPrograma: "A", fatorReajuste: "0.1000" };
    // legado: benf 1.100,00 + 13.º 1.000,00 + abono 165,00 = 2.265,00; desc 67,95
    expect(calcular(e, LEGADO)).toMatchObject({ vlrBenf: 110000, vlr13: 100000, vlrAbono: 16500, vlrBruto: 226500, vlrDesc: 6795, vlrLiq: 219705 });
    // corrigido: benf 1.000,00 + 13.º 1.000,00 + abono 150,00 = 2.150,00; desc 64,50
    expect(calcular(e, q("D8"))).toMatchObject({ vlrBenf: 100000, vlr13: 100000, vlrAbono: 15000, vlrBruto: 215000, vlrDesc: 6450, vlrLiq: 208550 });
  });

  it("FATOR-REAJ 0 → mesmo resultado nos dois modos", () => {
    expect(calcular(base, q("D8"))).toEqual(calcular(base, LEGADO));
  });

  it("outra correção na lista não ativa D8", () => {
    expect(calcular({ ...base, fatorReajuste: "0.1000" }, q("D17")).vlrBenf).toBe(110000);
  });
});

describe("D17 — renda > 9.999,99 (sem faixa)", () => {
  it("legado: individual (sem anterior) → 0; lote arrasta o anterior", () => {
    expect(fatorRenda(1000000, undefined, LEGADO)).toBe("0.0000");
    expect(fatorRenda(1000000, "0.8500", LEGADO)).toBe("0.8500");
  });

  it("corrigido: nunca arrasta → 0, como o individual", () => {
    expect(fatorRenda(1000000, "0.8500", q("D17"))).toBe("0.0000");
    expect(fatorRenda(1000000, undefined, q("D17"))).toBe("0.0000");
  });

  it("limite: 9.999,99 encaixa na última faixa nos dois modos; 10.000,00 não", () => {
    expect(fatorRenda(999999, "0.8500", LEGADO)).toBe("0.4000");
    expect(fatorRenda(999999, "0.8500", q("D17"))).toBe("0.4000");
    expect(fatorRenda(1000000, "0.8500", q("D17"))).toBe("0.0000");
  });

  it("motor: renda 10.000,00 com anterior 0.8500 → legado 850,00; corrigido 0,00", () => {
    const e = { ...base, renda: 1000000, fatorRendaAnterior: "0.8500" };
    expect(calcular(e, LEGADO)).toMatchObject({ vlrBenf: 85000, vlrLiq: 82450, fatorRenda: "0.8500" });
    expect(calcular(e, q("D17"))).toMatchObject({ vlrBenf: 0, vlrBruto: 0, vlrDesc: 0, vlrLiq: 0, fatorRenda: "0.0000" });
  });

  it("individual (sem anterior) igual nos dois modos", () => {
    const e = { ...base, renda: 1000000 };
    expect(calcular(e, q("D17"))).toEqual(calcular(e, LEGADO));
  });
});

describe("D13 — fórmula do líquido do motor (reutilizada pelo CALCDSCT corrigido)", () => {
  it("líquido = bruto − desconto (centavo exato)", () => {
    expect(calcularLiquido(80000, 2400)).toBe(77600);
    expect(calcularLiquido(80001, 2400)).toBe(77601);
    expect(calcularLiquido(10000, 0)).toBe(10000);
  });

  it("nunca negativo", () => {
    expect(calcularLiquido(10000, 10001)).toBe(0);
    expect(calcularLiquido(0, 0)).toBe(0);
  });

  it("é a mesma fórmula que o motor usa em FR-CAL-10", () => {
    for (const e of [base, { ...base, competencia: 202612, tipoPrograma: "A", fatorReajuste: "0.1000" }]) {
      const r = calcular(e);
      expect(calcularLiquido(r.vlrBruto, r.vlrDesc)).toBe(r.vlrLiq);
    }
  });

  it("rejeita valores não inteiros", () => {
    expect(() => calcularLiquido(1.5, 0)).toThrow();
  });
});

describe("D9 — ano fora da tabela IPCA", () => {
  it("temIndiceIpca: só 2010–2012", () => {
    expect(temIndiceIpca(200912)).toBe(false);
    expect(temIndiceIpca(201001)).toBe(true);
    expect(temIndiceIpca(201212)).toBe(true);
    expect(temIndiceIpca(201301)).toBe(false);
  });

  it("legado: índice 1, diferença 0, sem aviso", () => {
    expect(calcularCorrecao(10000, 202001, LEGADO)).toEqual({ vlrOriginal: 10000, vlrCorrigido: 10000, vlrDiferenca: 0, corrigir: false });
  });

  it("corrigido: marca semIndiceIpca (não processa)", () => {
    expect(calcularCorrecao(10000, 202001, q("D9"))).toEqual({
      vlrOriginal: 10000,
      vlrCorrigido: 10000,
      vlrDiferenca: 0,
      corrigir: false,
      semIndiceIpca: true,
    });
    expect(calcularCorrecao(10000, 200912, q("D9")).semIndiceIpca).toBe(true);
  });

  it("corrigido: ano da tabela segue igual ao legado (100,00 em 201101 → 100,83; jun/2010 0 %)", () => {
    expect(calcularCorrecao(10000, 201101, q("D9"))).toEqual(calcularCorrecao(10000, 201101, LEGADO));
    expect(calcularCorrecao(10000, 201101, q("D9"))).toMatchObject({ vlrCorrigido: 10083, vlrDiferenca: 83, corrigir: true });
    expect(calcularCorrecao(10000, 201006, q("D9"))).toEqual({ vlrOriginal: 10000, vlrCorrigido: 10000, vlrDiferenca: 0, corrigir: false });
  });

  it("mensagem do aviso", () => {
    expect(mensagemSemIndiceIpca(202001, 17)).toBe("SEM INDICE IPCA: COMP=202001 PGTO=17");
  });
});

describe("D22 — recorrido por CPF", () => {
  const CPF = "01234567890";
  const pg = (numPagamento: number, anoMesRef: number, indCorrigido: string | null = null, numCpf = CPF) => ({
    numPagamento,
    numCpf,
    anoMesRef,
    indCorrigido,
  });

  it("legado: competência > final lida antes encerra o recorrido", () => {
    const r = selecionarPagamentos([pg(1, 201205), pg(2, 201101)], CPF, 201101, 201112, LEGADO);
    expect(r).toEqual([]);
  });

  it("corrigido: sem parada antecipada, ordem por competência e nº", () => {
    const r = selecionarPagamentos(
      [pg(1, 201205), pg(2, 201103), pg(3, 201101), pg(4, 201103), pg(5, 200912), pg(6, 201102, null, "99999999999"), pg(7, 201102)],
      CPF,
      201101,
      201112,
      q("D22"),
    );
    expect(r.map((p) => [p.anoMesRef, p.numPagamento])).toEqual([
      [201101, 3],
      [201102, 7],
      [201103, 2],
      [201103, 4],
    ]);
  });

  it("corrigido: pula já corrigidos (S) e respeita limites inclusivos", () => {
    const r = selecionarPagamentos([pg(1, 201112), pg(2, 201101, "S"), pg(3, 201101, "N"), pg(4, 201201)], CPF, 201101, 201112, q("D22"));
    expect(r.map((p) => p.numPagamento)).toEqual([3, 1]);
  });

  it("corrigido: não altera a lista recebida", () => {
    const lista = [pg(1, 201103), pg(2, 201101)];
    selecionarPagamentos(lista, CPF, 201101, 201112, q("D22"));
    expect(lista.map((p) => p.numPagamento)).toEqual([1, 2]);
  });
});
