import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  calcularCorrecao,
  indiceIpca,
  MSG_CORRECAO_FINALIZADA,
  MSG_PERIODO_INVALIDO,
  selecionarPagamentos,
  totalizar,
  validarPeriodo,
} from "./correcao";
import { TAB_IPCA } from "./tabelas";

// Story 5.1 — CALCCORR (FR-COR-01..04).

const CPF = "01234567890";
const pg = (anoMesRef: number, indCorrigido: string | null = null, numCpf = CPF) => ({ numCpf, anoMesRef, indCorrigido });

describe("validarPeriodo — RK-5416be5ab4a9 (CALCCORR:119)", () => {
  it("inicial > final → PERIODO INVALIDO - COMP INICIAL > FINAL", () => {
    expect(validarPeriodo(201205, 201201)).toBe("PERIODO INVALIDO - COMP INICIAL > FINAL");
    expect(MSG_PERIODO_INVALIDO).toBe("PERIODO INVALIDO - COMP INICIAL > FINAL");
  });
  it("inicial = final e inicial < final → válido", () => {
    expect(validarPeriodo(201101, 201101)).toBeNull();
    expect(validarPeriodo(201001, 201212)).toBeNull();
  });
});

describe("selecionarPagamentos — recorrido READ BY CPF-BENEF", () => {
  it("RK-21f4cc982e48 (CALCCORR:133): competências anteriores à inicial são puladas", () => {
    const r = selecionarPagamentos([pg(201012), pg(201101), pg(201102)], CPF, 201101, 201112);
    expect(r.map((p) => p.anoMesRef)).toEqual([201101, 201102]);
  });
  it("RK-fa50ce8fa3e7 (CALCCORR:136): competência posterior à final encerra o recorrido", () => {
    const r = selecionarPagamentos([pg(201101), pg(201201), pg(201102)], CPF, 201101, 201112);
    // Como no legado, a parada é definitiva: por isso o caso de uso ordena por competência.
    expect(r.map((p) => p.anoMesRef)).toEqual([201101]);
  });
  it("RK-fadeb6de594c (CALCCORR:129): outro CPF encerra o recorrido", () => {
    const r = selecionarPagamentos([pg(201101), pg(201102, null, "99999999999"), pg(201103)], CPF, 201101, 201112);
    expect(r.map((p) => p.anoMesRef)).toEqual([201101]);
  });
  it("RK-d24d71f27db8 (CALCCORR:140): pagamento já corrigido (S) é pulado", () => {
    const r = selecionarPagamentos([pg(201101, "S"), pg(201102, "N"), pg(201103)], CPF, 201101, 201112);
    expect(r.map((p) => p.anoMesRef)).toEqual([201102, 201103]);
  });
  it("limites inclusivos", () => {
    const r = selecionarPagamentos([pg(201101), pg(201106)], CPF, 201101, 201106);
    expect(r).toHaveLength(2);
  });
});

describe("indiceIpca — CALC-INDICE-ACUM", () => {
  it("RK-d87bc4bc2bc4 (CALCCORR:180) / RK-d7af59c5343d (CALCCORR:181): ano e mês da competência", () => {
    expect(indiceIpca(201101).toFixed(6)).toBe("1.008300"); // 2011, jan
    expect(indiceIpca(201012).toFixed(6)).toBe("1.006300"); // 2010, dez
    expect(indiceIpca(201211).toFixed(6)).toBe("1.006000"); // 2012, nov
  });
  it("RK-012f5e03ef37 (CALCCORR:184): LEGACY-QUIRK(D9) — ano fora da tabela → índice 1", () => {
    expect(indiceIpca(202001).toFixed(6)).toBe("1.000000");
    expect(indiceIpca(200912).toFixed(6)).toBe("1.000000");
    expect(indiceIpca(201301).toFixed(6)).toBe("1.000000");
  });
  it("RK-2a52231a524c (CALCCORR:185): índice = 1 × (1 + IPCA[ano][mês]) em toda a tabela", () => {
    for (const { ano, meses } of TAB_IPCA) {
      meses.forEach((ipca, i) => {
        const comp = ano * 100 + i + 1;
        expect(indiceIpca(comp).toFixed(6)).toBe((1 + Number(ipca)).toFixed(6));
      });
    }
  });
  it("jun/2010 (IPCA 0,0000) → índice 1", () => {
    expect(indiceIpca(201006).toFixed(6)).toBe("1.000000");
  });
  it("mês fora de 1–12 num ano da tabela → erro (o legado indexaria fora do array)", () => {
    expect(() => indiceIpca(201113)).toThrow();
    expect(() => indiceIpca(201100)).toThrow();
  });
});

describe("tabela IPCA (D9)", () => {
  it("somente 2010–2012, 12 meses cada, valores do legado", () => {
    expect(TAB_IPCA.map((t) => t.ano)).toEqual([2010, 2011, 2012]);
    for (const t of TAB_IPCA) expect(t.meses).toHaveLength(12);
    expect(TAB_IPCA[0]?.meses[10]).toBe("0.0083");
    expect(TAB_IPCA[1]?.meses[0]).toBe("0.0083");
    expect(TAB_IPCA[2]?.meses[11]).toBe("0.0079");
  });
});

describe("calcularCorrecao — aplicação", () => {
  it("RK-7ac41f6abbe2 (CALCCORR:152): 100,00 em 201101 × 1,0083 = 100,83; diferença 0,83", () => {
    expect(calcularCorrecao(10000, 201101)).toEqual({ vlrOriginal: 10000, vlrCorrigido: 10083, vlrDiferenca: 83, corrigir: true });
  });
  it("RK-26314a2e669a (CALCCORR:154) / RK-ef8db09fc095 (CALCCORR:155): trunca, não arredonda", () => {
    // 122,20 × 1,0083 = 123,21426 → 123,21
    expect(calcularCorrecao(12220, 201101).vlrCorrigido).toBe(12321);
    // 199,99 × 1,0079 = 201,569921 → 201,56 (arredondado seria 201,57)
    expect(calcularCorrecao(19999, 201103).vlrCorrigido).toBe(20156);
  });
  it("RK-146fee57d2a4 (CALCCORR:156): diferença = corrigido − original (ao centavo)", () => {
    const c = calcularCorrecao(48500, 201207); // 485,00 × 1,0043 = 487,0855 → 487,08
    expect(c.vlrCorrigido).toBe(48708);
    expect(c.vlrDiferenca).toBe(208);
  });
  it("RK-b5eb9d994cd9 (CALCCORR:158): diferença 0 → não corrige", () => {
    // Fora da tabela (D9).
    expect(calcularCorrecao(10000, 202001)).toEqual({ vlrOriginal: 10000, vlrCorrigido: 10000, vlrDiferenca: 0, corrigir: false });
    // jun/2010 = 0,0000.
    expect(calcularCorrecao(10000, 201006).corrigir).toBe(false);
    // Diferença truncada a 0: 1,00 × 1,0001 = 1,0001 → 1,00.
    expect(calcularCorrecao(100, 201007)).toMatchObject({ vlrCorrigido: 100, vlrDiferenca: 0, corrigir: false });
  });
});

describe("totalizar — resumo", () => {
  it("total = soma das diferenças (não dos corrigidos)", () => {
    const a = calcularCorrecao(10000, 201101); // +0,83
    const b = calcularCorrecao(48500, 201207); // +2,08
    expect(totalizar([a, b])).toEqual({ qtdRegistros: 2, vlrTotal: 291 });
    expect(totalizar([])).toEqual({ qtdRegistros: 0, vlrTotal: 0 });
  });
  it("mensagem literal do legado (CALCCORR:170)", () => {
    expect(MSG_CORRECAO_FINALIZADA).toBe("CORRECAO RETROATIVA FINALIZADA");
  });
});

// Rastreabilidade: as 14 regras da story 5.1 citadas em correcao.ts com PROG:linha.
const REGRAS_5_1 = [
  "RK-5416be5ab4a9 (CALCCORR:119)",
  "RK-fadeb6de594c (CALCCORR:129)",
  "RK-21f4cc982e48 (CALCCORR:133)",
  "RK-fa50ce8fa3e7 (CALCCORR:136)",
  "RK-d24d71f27db8 (CALCCORR:140)",
  "RK-d87bc4bc2bc4 (CALCCORR:180)",
  "RK-d7af59c5343d (CALCCORR:181)",
  "RK-012f5e03ef37 (CALCCORR:184)",
  "RK-2a52231a524c (CALCCORR:185)",
  "RK-7ac41f6abbe2 (CALCCORR:152)",
  "RK-26314a2e669a (CALCCORR:154)",
  "RK-ef8db09fc095 (CALCCORR:155)",
  "RK-146fee57d2a4 (CALCCORR:156)",
  "RK-b5eb9d994cd9 (CALCCORR:158)",
];

describe("rastreabilidade RK → correcao.ts", () => {
  it("cita as 14 regras da story 5.1", () => {
    const fonte = readFileSync(fileURLToPath(new URL("./correcao.ts", import.meta.url)), "utf8");
    expect(REGRAS_5_1.filter((r) => !fonte.includes(r))).toEqual([]);
    expect(fonte).toContain("LEGACY-QUIRK(D9)");
  });
  it("cada regra também é citada neste teste", () => {
    const teste = readFileSync(fileURLToPath(new URL("./correcao.test.ts", import.meta.url)), "utf8");
    const semTeste = REGRAS_5_1.filter((r) => teste.split(r).length < 3); // lista + describe/it
    expect(semTeste).toEqual([]);
  });
});
