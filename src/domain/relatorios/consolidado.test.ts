import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  brutoRelatorio,
  brutoRelatorioCentavos,
  CABECALHO_CONSOLIDADO,
  consolidar,
  indiceRegiao,
  indiceStatus,
  lerFiltroConsolidado,
  NOMES_REGIAO,
  NOMES_STATUS,
  pertenceACompetencia,
  type PagamentoConsolidado,
} from "./consolidado";

const pg = (over: Partial<PagamentoConsolidado> = {}): PagamentoConsolidado => ({
  anoMesRef: 201101,
  codRegiao: 1,
  vlrBruto: 10000,
  vlrDescontoTotal: 500,
  vlrLiquido: 9500,
  sitPagamento: "G",
  ...over,
});

const regiao = (cod: number | null) => NOMES_REGIAO[indiceRegiao(cod)];

describe("região (LEGACY-QUIRK D10)", () => {
  it("RK-d8b1ac2e14eb (BATCHREL:117) — 1..5 → NORTE", () => {
    expect([1, 3, 5].map(regiao)).toEqual(["NORTE", "NORTE", "NORTE"]);
  });
  it("RK-0cdc90e2bd81 (BATCHREL:120) — 6..10 → NORDESTE", () => {
    expect([6, 7, 10].map(regiao)).toEqual(["NORDESTE", "NORDESTE", "NORDESTE"]);
  });
  it("RK-8b828d08f033 (BATCHREL:123) — 11..15 → SUDESTE", () => {
    expect([11, 12, 15].map(regiao)).toEqual(["SUDESTE", "SUDESTE", "SUDESTE"]);
  });
  it("RK-893670f64c20 (BATCHREL:126) — 16..20 → SUL; resto → CENTRO-OESTE", () => {
    expect([16, 18, 20].map(regiao)).toEqual(["SUL", "SUL", "SUL"]);
    // 21–25, 99, 0 e beneficiário inexistente → CENTRO-OESTE.
    expect([21, 22, 25, 99, 0, -1, null].map(regiao)).toEqual(Array(7).fill("CENTRO-OESTE"));
  });
});

describe("status", () => {
  it("RK-95081b4796b9 (BATCHREL:146) — G/P/C/D/E; desconhecido → GERADO", () => {
    expect(["G", "P", "C", "D", "E"].map((s) => NOMES_STATUS[indiceStatus(s)])).toEqual([
      "GERADO",
      "PAGO",
      "CANCELADO",
      "DEVOLVIDO",
      "ESTORNADO",
    ]);
    expect(["X", "", "g", "toString"].map((s) => NOMES_STATUS[indiceStatus(s)])).toEqual(Array(4).fill("GERADO"));
  });
});

describe("bruto arredondado (LEGACY-QUIRK D11)", () => {
  it("RK-35bd4d675058 (BATCHREL:137) — soma 0,005 antes de truncar", () => {
    expect(brutoRelatorio("100.005").toFixed(2)).toBe("100.01");
    expect(brutoRelatorio("99.995").toFixed(2)).toBe("100.00");
  });
  it("RK-aeeeeeec3fcd (BATCHREL:138) — ×100 em campo inteiro trunca a fração", () => {
    expect(brutoRelatorio("100.004").toFixed(2)).toBe("100.00");
    expect(brutoRelatorio("12.3449").toFixed(2)).toBe("12.34");
  });
  it("RK-1a7fe69dd6d1 (BATCHREL:139) — /100 volta a 2 decimais", () => {
    expect(brutoRelatorio("100").toFixed(2)).toBe("100.00");
    expect(brutoRelatorio("0.0049").toFixed(2)).toBe("0.00");
    // Centavos inteiros: o arredondamento não altera o valor.
    expect(brutoRelatorioCentavos(10000)).toBe(10000);
    expect(brutoRelatorioCentavos(1)).toBe(1);
  });
});

describe("consolidar", () => {
  it("RK-4aadc8392e9b (BATCHREL:106) — só a competência pedida", () => {
    expect(pertenceACompetencia({ anoMesRef: 201101 }, 201101)).toBe(true);
    expect(pertenceACompetencia({ anoMesRef: 201102 }, 201101)).toBe(false);
    const r = consolidar(201101, [pg(), pg({ anoMesRef: 201102, vlrBruto: 99999 })]);
    expect(r.total).toEqual({ qtd: 1, bruto: 10000, desconto: 500, liquido: 9500 });
  });

  it("vazio → 5 regiões e 5 status em zero", () => {
    const r = consolidar(201101, []);
    expect(r.regioes).toEqual(NOMES_REGIAO.map((nome) => ({ nome, qtd: 0, bruto: 0, desconto: 0, liquido: 0 })));
    expect(r.status.map((s) => [s.codigo, s.nome, s.qtd, s.bruto])).toEqual([
      ["G", "GERADO", 0, 0],
      ["P", "PAGO", 0, 0],
      ["C", "CANCELADO", 0, 0],
      ["D", "DEVOLVIDO", 0, 0],
      ["E", "ESTORNADO", 0, 0],
    ]);
    expect(r.total).toEqual({ qtd: 0, bruto: 0, desconto: 0, liquido: 0 });
  });

  it("regiões 3, 7, 12, 18, 22, 99 e inexistente; status X soma em GERADO", () => {
    const pagos = [3, 7, 12, 18, 22, 99, null].map((codRegiao, i) =>
      pg({ codRegiao, vlrBruto: 10000 * (i + 1), vlrDescontoTotal: 100 * (i + 1), vlrLiquido: 9900 * (i + 1), sitPagamento: "GPCDEXG"[i] }),
    );
    const r = consolidar(201101, pagos);
    expect(r.regioes.map((x) => [x.nome, x.qtd, x.bruto, x.desconto, x.liquido])).toEqual([
      ["NORTE", 1, 10000, 100, 9900],
      ["NORDESTE", 1, 20000, 200, 19800],
      ["SUDESTE", 1, 30000, 300, 29700],
      ["SUL", 1, 40000, 400, 39600],
      ["CENTRO-OESTE", 3, 50000 + 60000 + 70000, 500 + 600 + 700, (5 + 6 + 7) * 9900],
    ]);
    expect(r.status.map((x) => [x.nome, x.qtd, x.bruto])).toEqual([
      ["GERADO", 3, 10000 + 60000 + 70000],
      ["PAGO", 1, 20000],
      ["CANCELADO", 1, 30000],
      ["DEVOLVIDO", 1, 40000],
      ["ESTORNADO", 1, 50000],
    ]);
    expect(r.total).toEqual({ qtd: 7, bruto: 280000, desconto: 2800, liquido: 28 * 9900 });
  });
});

describe("filtro da tela", () => {
  it("AAAAMM, AAAA-MM; ausente/vazio → 0; presente e inválido → null", () => {
    expect(lerFiltroConsolidado({ competencia: "199401" })).toEqual({ competencia: 199401 });
    expect(lerFiltroConsolidado({ competencia: ["1994-01", "x"] })).toEqual({ competencia: 199401 });
    expect(lerFiltroConsolidado({ competencia: "199413" })).toEqual({ competencia: null });
    expect(lerFiltroConsolidado({ competencia: "invalido" })).toEqual({ competencia: null });
    expect(lerFiltroConsolidado({ competencia: " " })).toEqual({ competencia: 0 });
    expect(lerFiltroConsolidado({})).toEqual({ competencia: 0 });
  });

  it("cabeçalho literal", () => {
    expect(CABECALHO_CONSOLIDADO.titulo).toBe("SIFAP - RELATORIO CONSOLIDADO MENSAL");
    expect(CABECALHO_CONSOLIDADO.competencia).toBe("COMPETENCIA:");
    expect(CABECALHO_CONSOLIDADO.data).toBe("DATA:");
  });
});

describe("rastreabilidade", () => {
  const fonte = readFileSync(fileURLToPath(new URL("./consolidado.ts", import.meta.url)), "utf8");
  it.each([
    "RK-4aadc8392e9b (BATCHREL:106)",
    "RK-d8b1ac2e14eb (BATCHREL:117)",
    "RK-0cdc90e2bd81 (BATCHREL:120)",
    "RK-8b828d08f033 (BATCHREL:123)",
    "RK-893670f64c20 (BATCHREL:126)",
    "RK-35bd4d675058 (BATCHREL:137)",
    "RK-aeeeeeec3fcd (BATCHREL:138)",
    "RK-1a7fe69dd6d1 (BATCHREL:139)",
    "RK-95081b4796b9 (BATCHREL:146)",
    "LEGACY-QUIRK(D10)",
    "LEGACY-QUIRK(D11)",
  ])("%s citado em consolidado.ts", (marca) => {
    expect(fonte).toContain(marca);
  });
});
