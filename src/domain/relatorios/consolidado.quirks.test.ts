import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lerQuirks, QUIRKS_PADRAO } from "@/domain/quirks";
import { consolidar, INDICE_NAO_CLASSIFICADA, indiceRegiao, NOME_NAO_CLASSIFICADA, NOMES_REGIAO, type PagamentoConsolidado } from "./consolidado";

// Correcciones configurables del grupo C (informe consolidado): D10 (región) y D11 (bruto sin redondeo).

const LEGADO = QUIRKS_PADRAO;
const D10 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D10" });
const D11 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D11" });
const TODOS = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "ALL" });

const pg = (over: Partial<PagamentoConsolidado> = {}): PagamentoConsolidado => ({
  anoMesRef: 201101,
  codRegiao: 1,
  vlrBruto: 10000,
  vlrDescontoTotal: 500,
  vlrLiquido: 9500,
  sitPagamento: "G",
  ...over,
});

const nome = (i: number) => (i === INDICE_NAO_CLASSIFICADA ? NOME_NAO_CLASSIFICADA : NOMES_REGIAO[i]);

describe("D10 — agrupamento por região", () => {
  it("legado (default e explícito): 21–25, 0, 99, >25 e inexistente → CENTRO-OESTE", () => {
    for (const cod of [21, 25, 0, 26, 99, -1, null]) {
      expect(nome(indiceRegiao(cod))).toBe("CENTRO-OESTE");
      expect(nome(indiceRegiao(cod, LEGADO))).toBe("CENTRO-OESTE");
    }
  });

  it("corrigido: 1–20 inalterado; 21–25 → CENTRO-OESTE", () => {
    expect([1, 5, 6, 10, 11, 15, 16, 20].map((c) => nome(indiceRegiao(c, D10)))).toEqual([
      "NORTE",
      "NORTE",
      "NORDESTE",
      "NORDESTE",
      "SUDESTE",
      "SUDESTE",
      "SUL",
      "SUL",
    ]);
    expect([21, 22, 25].map((c) => nome(indiceRegiao(c, D10)))).toEqual(Array(3).fill("CENTRO-OESTE"));
  });

  it("corrigido: 0, 99, >25, negativo e inexistente → NAO CLASSIFICADA", () => {
    expect(NOME_NAO_CLASSIFICADA).toBe("NAO CLASSIFICADA");
    expect([0, 26, 99, 100, -1, null].map((c) => nome(indiceRegiao(c, D10)))).toEqual(Array(6).fill("NAO CLASSIFICADA"));
    expect(nome(indiceRegiao(99, TODOS))).toBe("NAO CLASSIFICADA");
  });

  it("legado: 5 linhas de região; corrigido: 6 linhas (a sexta em zero se vazia)", () => {
    expect(consolidar(201101, [], LEGADO).regioes.map((r) => r.nome)).toEqual([...NOMES_REGIAO]);
    const r = consolidar(201101, [], D10);
    expect(r.regioes).toEqual([...NOMES_REGIAO, "NAO CLASSIFICADA"].map((nome) => ({ nome, qtd: 0, bruto: 0, desconto: 0, liquido: 0 })));
  });

  it("corrigido: consolida 3, 7, 12, 18, 22, 99 e inexistente; totais iguais ao legado", () => {
    const pagos = [3, 7, 12, 18, 22, 99, null].map((codRegiao, i) =>
      pg({ codRegiao, vlrBruto: 10000 * (i + 1), vlrDescontoTotal: 100 * (i + 1), vlrLiquido: 9900 * (i + 1), sitPagamento: "GPCDEXG"[i] }),
    );
    const c = consolidar(201101, pagos, D10);
    expect(c.regioes.map((x) => [x.nome, x.qtd, x.bruto, x.desconto, x.liquido])).toEqual([
      ["NORTE", 1, 10000, 100, 9900],
      ["NORDESTE", 1, 20000, 200, 19800],
      ["SUDESTE", 1, 30000, 300, 29700],
      ["SUL", 1, 40000, 400, 39600],
      ["CENTRO-OESTE", 1, 50000, 500, 49500],
      ["NAO CLASSIFICADA", 2, 60000 + 70000, 600 + 700, (6 + 7) * 9900],
    ]);
    const l = consolidar(201101, pagos, LEGADO);
    expect(c.total).toEqual(l.total);
    expect(c.status).toEqual(l.status);
    // A soma das linhas de região fecha com o total geral.
    expect(c.regioes.reduce((s, x) => s + x.bruto, 0)).toBe(c.total.bruto);
    expect(c.regioes.reduce((s, x) => s + x.qtd, 0)).toBe(c.total.qtd);
  });

  it("D11 sozinho não cria a sexta linha", () => {
    expect(consolidar(201101, [pg({ codRegiao: 99 })], D11).regioes).toHaveLength(5);
  });
});

describe("D11 — bruto sem arredondamento em região/geral", () => {
  // O bruto persiste em centavos inteiros: o arredondamento legado (+0,005 e trunca) é a
  // identidade sobre dados persistidos, então os dois modos coincidem nos valores.
  const pagos = [pg({ vlrBruto: 1 }), pg({ vlrBruto: 99999 }), pg({ vlrBruto: 0 }), pg({ codRegiao: 7, vlrBruto: 12345 })];

  it("corrigido: região e total somam o bruto cru (igual ao do cálculo e ao do status)", () => {
    const c = consolidar(201101, pagos, D11);
    expect(c.total.bruto).toBe(pagos.reduce((s, p) => s + p.vlrBruto, 0));
    expect(c.regioes[0]?.bruto).toBe(1 + 99999 + 0);
    expect(c.regioes[1]?.bruto).toBe(12345);
    expect(c.status.reduce((s, x) => s + x.bruto, 0)).toBe(c.total.bruto);
  });

  it("legado e corrigido coincidem sobre centavos inteiros", () => {
    expect(consolidar(201101, pagos, D11)).toEqual(consolidar(201101, pagos, LEGADO));
    expect(consolidar(201101, pagos)).toEqual(consolidar(201101, pagos, LEGADO));
  });
});

describe("rastreabilidade das correções", () => {
  const fonte = readFileSync(fileURLToPath(new URL("./consolidado.ts", import.meta.url)), "utf8");
  it.each(["LEGACY-QUIRK(D10)", "CORRECAO(D10)", "LEGACY-QUIRK(D11)", "CORRECAO(D11)"])("%s citado em consolidado.ts", (marca) => {
    expect(fonte).toContain(marca);
  });
});
