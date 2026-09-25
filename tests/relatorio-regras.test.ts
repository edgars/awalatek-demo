import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  codigoSaida,
  ehArquivoDeTeste,
  escanearImplementacoes,
  extrairChaves,
  gerarMarkdown,
  mapearTestes,
  montarRelatorio,
  parsePrdRegras,
  parseQuirks,
  statusRegra,
  testesDePlaywright,
  testesDeVitest,
  type Teste,
  type TesteDaRegra,
} from "../scripts/relatorio-regras-lib.mjs";

// Robot de regras (npm run test:regras) — funções puras de parsing e mapeamento.

const K1 = "RK-aaaaaaaaaaaa";
const K2 = "RK-bbbbbbbbbbbb";
const K3 = "RK-cccccccccccc";

const PRD = `# PRD

## 4. Requisitos

## 5. Decisiones LEGACY-QUIRK

| ID | Comportamiento legado | Decisión fase 1 | FR |
|---|---|---|---|
| D1 | Tablas fijas | Replicar | FR-CAL-03, FR-CAL-05 |
| D4b | CPF 000 | Replicar | FR-VAL-02 |
| D14 | Descuentos | Modelo | FR-DSC-05 |

### 5.1 Correcciones configurables (2026-09-25)

| ID | Corregido (\`Dn\` activo) |
|---|---|
| D4b | Todo CPF repetido es inválido |

## 6. Requisitos no funcionales

| D9 | fuera de la sección | x | FR-X-01 |

## Anexo A — Trazabilidad de reglas (289)

| RK | Programa:línea | Tipo | FR | Extracto |
|---|---|---|---|---|
| ${K1} | CALCBENF:190 | FIELD_VALIDATION | FR-CAL-03 | \`IF #NUM-DEP <= 2 THEN X\` |
| ${K2} | BATCHPGT:282 | — | FR-LOT-03 | \`A | B\` |
| ${K3} | CALCDSCT:125 | COMPUTATION | FR-DSC-05 | \`X\` |
`;

function teste(titulo: string, status: Teste["status"], arquivo = "tests/a.test.ts"): Teste {
  return { arquivo, titulo, status, duracaoMs: 5 };
}

describe("parsePrdRegras", () => {
  it("lê chave, fonte, programa, linha, tipo, FR e pseudocódigo (com | no extrato e tipo —)", () => {
    const r = parsePrdRegras(PRD);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({
      chave: K1,
      fonte: "CALCBENF:190",
      programa: "CALCBENF",
      linha: 190,
      tipo: "FIELD_VALIDATION",
      fr: "FR-CAL-03",
      pseudocodigo: "IF #NUM-DEP <= 2 THEN X",
    });
    expect(r[1]).toMatchObject({ chave: K2, programa: "BATCHPGT", linha: 282, tipo: null, pseudocodigo: "A | B" });
  });

  it("rejeita chave duplicada e fonte inválida", () => {
    expect(() => parsePrdRegras(`| ${K1} | X:1 | T | FR-A-01 | a |\n| ${K1} | X:2 | T | FR-A-01 | b |`)).toThrow(/duplicada/);
    expect(() => parsePrdRegras(`| ${K1} | sem-linha | T | FR-A-01 | a |`)).toThrow(/fonte inválida/);
  });

  it("o PRD real tem 289 regras únicas", () => {
    const r = parsePrdRegras(readFileSync("docs/prd.md", "utf8"));
    expect(r).toHaveLength(289);
    expect(new Set(r.map((x) => x.programa)).size).toBeGreaterThanOrEqual(15);
  });
});

describe("parseQuirks", () => {
  it("junta §5 e §5.1 por ID e ignora tabelas fora da seção 5", () => {
    const q = parseQuirks(PRD);
    expect(q.map((x) => x.id)).toEqual(["D1", "D4b", "D14"]);
    expect(q[0]).toEqual({ id: "D1", comportamentoLegado: "Tablas fijas", decisao: "Replicar", frs: ["FR-CAL-03", "FR-CAL-05"], corrigido: null });
    expect(q[1]?.corrigido).toBe("Todo CPF repetido es inválido");
  });

  it("o PRD real tem D1–D17 em §5 e as correções de §5.1", () => {
    const q = parseQuirks(readFileSync("docs/prd.md", "utf8"));
    expect(q.find((x) => x.id === "D17")?.frs).toEqual(["FR-CAL-05", "FR-LOT-03"]);
    expect(q.find((x) => x.id === "D8")?.corrigido).toMatch(/FATOR-REAJ/);
    expect(q.find((x) => x.id === "D2")?.corrigido).toBeNull();
    expect(q.find((x) => x.id === "D23")?.corrigido).toMatch(/AAAAMMDD/); // só em §5.1
  });
});

describe("extração de testes", () => {
  it("extrairChaves: chaves distintas em ordem", () => {
    expect(extrairChaves(`${K1} (X:1) / ${K2} … ${K1}`)).toEqual([K1, K2]);
    expect(extrairChaves("RK-XYZ sem chave")).toEqual([]);
  });

  it("testesDeVitest: título = describes + it; caminho relativo; arquivo que não carregou = falha", () => {
    const json = {
      testResults: [
        {
          name: "/repo/tests/a.test.ts",
          status: "passed",
          assertionResults: [
            { ancestorTitles: ["bloco", K1], title: "caso", status: "passed", duration: 3.4 },
            { ancestorTitles: [], title: "x", status: "failed", duration: 1, failureMessages: ["AssertionError: 1 != 2\n at …"] },
            { ancestorTitles: [], title: "y", status: "todo" },
          ],
        },
        { name: "/repo/tests/b.test.ts", status: "failed", message: "SyntaxError", assertionResults: [] },
      ],
    };
    const t = testesDeVitest(json, "/repo");
    expect(t[0]).toEqual({ arquivo: "tests/a.test.ts", titulo: `bloco > ${K1} > caso`, status: "passed", duracaoMs: 3, mensagem: undefined });
    expect(t[1]).toMatchObject({ status: "failed", mensagem: "AssertionError: 1 != 2" });
    expect(t[2]?.status).toBe("skipped");
    expect(t[3]).toMatchObject({ arquivo: "tests/b.test.ts", status: "failed", erroArquivo: true });
  });

  it("testesDePlaywright: suites aninhadas, flaky conta como aprovado", () => {
    const json = {
      suites: [
        {
          title: "lote.spec.ts",
          file: "lote.spec.ts",
          specs: [],
          suites: [
            {
              title: "lote",
              specs: [
                { title: "ok", file: "lote.spec.ts", tests: [{ status: "expected", projectName: "chromium", results: [{ duration: 10 }] }] },
                { title: "instável", file: "lote.spec.ts", tests: [{ status: "flaky", results: [{ duration: 5 }, { duration: 7 }] }] },
                { title: "quebrado", file: "lote.spec.ts", tests: [{ status: "unexpected", results: [{ duration: 1 }] }] },
              ],
            },
          ],
        },
      ],
    };
    const t = testesDePlaywright(json);
    expect(t.map((x) => [x.titulo, x.status, x.duracaoMs])).toEqual([
      ["lote > ok", "passed", 10],
      ["lote > instável", "passed", 12],
      ["lote > quebrado", "failed", 1],
    ]);
    expect(t[1]?.flaky).toBe(true);
  });
});

describe("mapeamento e status por regra", () => {
  it("escanearImplementacoes: arquivo:linha de cada chave; ehArquivoDeTeste", () => {
    const m = escanearImplementacoes(
      [
        { arquivo: "src/a.ts", conteudo: `x\n// ${K1} (A:1) · ${K2} (B:2)\n` },
        { arquivo: "src/b.ts", conteudo: `// ${K1}` },
      ],
      [K1, K2, K3],
    );
    expect(m.get(K1)).toEqual([
      { arquivo: "src/a.ts", linha: 2 },
      { arquivo: "src/b.ts", linha: 1 },
    ]);
    expect(m.get(K3)).toEqual([]);
    expect(ehArquivoDeTeste("src/domain/motor.test.ts")).toBe(true);
    expect(ehArquivoDeTeste("tests/e2e/lote.spec.ts")).toBe(true);
    expect(ehArquivoDeTeste("src/domain/motor.ts")).toBe(false);
  });

  it("mapearTestes: um teste com duas chaves conta para ambas, com status por modo", () => {
    const m = mapearTestes([K1, K2, K3], {
      legado: [teste(`${K1} / ${K2}: caso`, "passed")],
      corrigido: [teste(`${K1} / ${K2}: caso`, "failed")],
    });
    expect(m.get(K1)).toEqual([
      { arquivo: "tests/a.test.ts", titulo: `${K1} / ${K2}: caso`, status: { legado: "passed", corrigido: "failed" }, duracaoMs: { legado: 5, corrigido: 5 } },
    ]);
    expect(m.get(K2)).toHaveLength(1);
    expect(m.get(K3)).toEqual([]);
  });

  it("statusRegra: aprovada exige passar nos dois modos; qualquer falha = falhou; sem teste = sem-teste", () => {
    const t = (legado: Teste["status"], corrigido?: Teste["status"]): TesteDaRegra => ({
      arquivo: "a",
      titulo: "t",
      status: corrigido ? { legado, corrigido } : { legado },
      duracaoMs: {},
    });
    expect(statusRegra([t("passed", "passed")])).toBe("aprovada");
    expect(statusRegra([t("passed", "passed"), t("passed", "failed")])).toBe("falhou");
    expect(statusRegra([t("passed")])).toBe("sem-teste"); // não rodou no modo corrigido
    expect(statusRegra([t("skipped", "skipped")])).toBe("sem-teste");
    expect(statusRegra([])).toBe("sem-teste");
  });

  it("montarRelatorio: totais, agregados por programa/FR, quirks por FR e código de saída", () => {
    const regras = parsePrdRegras(PRD);
    const execucoes = {
      legado: [teste(`${K1}: a`, "passed"), teste(`${K2}: b`, "passed"), teste("sem chave", "passed")],
      corrigido: [teste(`${K1}: a`, "passed"), teste(`${K2}: b`, "failed")],
    };
    const rel = montarRelatorio({
      regras,
      quirks: parseQuirks(PRD),
      execucoes,
      implementacoes: new Map([[K1, [{ arquivo: "src/a.ts", linha: 1 }]]]),
      e2e: null,
      meta: { data: "2026-09-25T00:00:00.000Z", gitSha: "abc", node: "v24" },
    });
    expect(rel.totais).toEqual({ regras: 3, aprovada: 1, falhou: 1, "sem-teste": 1, semImplementacao: 2 });
    expect(rel.porPrograma.CALCBENF).toEqual({ total: 1, aprovada: 1, falhou: 0, "sem-teste": 0 });
    expect(rel.porFr["FR-LOT-03"]).toMatchObject({ falhou: 1 });
    expect(rel.regras[0]?.quirksDoFr).toEqual(["D1"]);
    expect(rel.regras[2]?.quirksDoFr).toEqual(["D14"]);
    expect(rel.vitest.corrigido).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(rel.e2e).toEqual({ executado: false });
    expect(codigoSaida(rel)).toBe(1);

    const md = gerarMarkdown(rel);
    expect(md).toContain("# Informe de reglas de negocio — SIFAP");
    expect(md).toContain("REPROBADO");
    expect(md).toContain(`| ${K1} | CALCBENF:190 | FIELD_VALIDATION | FR-CAL-03 (D1) | aprobada | 1 | src/a.ts:1 |`);
  });

  it("codigoSaida: 0 só com todas aprovadas e sem falhas de vitest/e2e", () => {
    const regras = parsePrdRegras(PRD);
    const todos = [K1, K2, K3].map((k) => teste(`${k}: ok`, "passed"));
    const base = { regras, quirks: [], execucoes: { legado: todos, corrigido: todos }, implementacoes: new Map(), meta: {} };
    expect(codigoSaida(montarRelatorio({ ...base, e2e: null }))).toBe(0);
    expect(codigoSaida(montarRelatorio({ ...base, e2e: [teste("e2e", "failed", "tests/e2e/x.spec.ts")] }))).toBe(1);
    const comFalhaSemChave = { legado: [...todos, teste("outro", "failed")], corrigido: todos };
    expect(codigoSaida(montarRelatorio({ ...base, execucoes: comFalhaSemChave, e2e: null }))).toBe(1);
  });
});
