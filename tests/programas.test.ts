import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { inclusaoProgramaSchema, type FaixaCalculo, type ParamRegional } from "@/domain/programa";
import { createPrismaClient } from "@/server/db";
import { consultarPrograma, incluirPrograma, listarProgramas, salvarFaixas, salvarParamsRegionais } from "@/server/programas";
import { seed } from "../prisma/seed";

// Casos de uso de programas (story 1.1) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-prog-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_USER", "SIFAPUSR");
  // limpeza do teste: base = seed (3 programas)
  await prisma.programaSocial.deleteMany({ where: { codPrograma: { notIn: ["PA01", "PP01", "PT01"] } } });
  await prisma.programaFaixaCalculo.deleteMany({ where: { programa: { codPrograma: "PA01" } } });
  await prisma.programaParamRegional.deleteMany({ where: { programa: { codPrograma: "PA01" } } });
  await seed(prisma);
});

const entrada = (over: Record<string, string> = {}) =>
  inclusaoProgramaSchema.parse({
    codPrograma: "PX01",
    nomePrograma: "Programa de Renda Teste",
    tipoPrograma: "A",
    vlrBase: "15000",
    codElegibilidade: "",
    dtInicio: "20260101",
    dtFim: "0",
    rendaMaxima: "0",
    idadeMin: "0",
    idadeMax: "0",
    fatorReajuste: "0.0450",
    ...over,
  });

const faixa: FaixaCalculo = { rendaInicio: 0, rendaFim: 50000, fatorMultiplicador: "1.2000", vlrAdicional: 1000, indAcumulativo: "N" };
const param: ParamRegional = { codRegiao: 1, fatorRegional: "1.1000", vlrComplementoReg: 500, indAtivoRegiao: "S" };

describe("incluirPrograma", () => {
  it("grava fatorK truncado, base ajustada, status A e usuário", async () => {
    const r = await incluirPrograma(entrada(), prisma);
    expect(r).toEqual({
      ok: true,
      mensagem: "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ 152,34",
      dados: { codPrograma: "PX01", fatorK: "1.015624", vlrBaseIndividual: 15234 },
    });
    const p = await prisma.programaSocial.findUniqueOrThrow({ where: { codPrograma: "PX01" } });
    expect(p).toMatchObject({
      sitPrograma: "A",
      fatorK: "1.015624",
      fatorReajuste: "0.0450",
      vlrBaseIndividual: 15234,
      dtCriacao: 20260101,
      usrInclusao: "SIFAPUSR",
    });
    expect(p.dtInclusao).toBeGreaterThan(20260000);
  });

  it("código duplicado → PROGRAMA JA CADASTRADO, nada gravado", async () => {
    await incluirPrograma(entrada(), prisma);
    const r = await incluirPrograma(entrada({ nomePrograma: "OUTRO" }), prisma);
    expect(r).toEqual({ ok: false, mensagem: "PROGRAMA JA CADASTRADO" });
    expect(await prisma.programaSocial.count({ where: { codPrograma: "PX01" } })).toBe(1);
    expect((await prisma.programaSocial.findUniqueOrThrow({ where: { codPrograma: "PX01" } })).nomePrograma).toBe(
      "Programa de Renda Teste",
    );
  });

  it("não registra auditoria (CADPROG não audita)", async () => {
    await incluirPrograma(entrada(), prisma);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("valor ajustado acima do Int32 → recusado, nada gravado", async () => {
    // 2.147.483.647 × 1,015624 excede a coluna Int
    const r = await incluirPrograma(entrada({ vlrBase: "2147483647" }), prisma);
    expect(r).toEqual({ ok: false, mensagem: "Valor ajustado acima do limite (máx. R$ 21.474.836,47)." });
    expect(await prisma.programaSocial.count({ where: { codPrograma: "PX01" } })).toBe(0);
  });

  it("usrInclusao é cortado a 8 caracteres", async () => {
    vi.stubEnv("SIFAP_USER", "OPERADOR01");
    await incluirPrograma(entrada(), prisma);
    const p = await prisma.programaSocial.findUniqueOrThrow({ where: { codPrograma: "PX01" } });
    expect(p.usrInclusao).toBe("OPERADOR");
  });

  it("falha sem SIFAP_USER", async () => {
    vi.stubEnv("SIFAP_USER", "");
    await expect(incluirPrograma(entrada(), prisma)).rejects.toThrow(/SIFAP_USER/);
    expect(await prisma.programaSocial.count({ where: { codPrograma: "PX01" } })).toBe(0);
  });
});

describe("consultarPrograma", () => {
  it("existente devolve ficha com grupos", async () => {
    const r = await consultarPrograma("pp01", prisma);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.programa.codPrograma).toBe("PP01");
      expect(r.programa.faixasCalculo.length).toBe(1);
      expect(r.programa.paramsRegionais.length).toBe(1);
    }
  });

  it("inexistente → PROGRAMA NAO ENCONTRADO", async () => {
    expect(await consultarPrograma("ZZZZ", prisma)).toEqual({ ok: false, mensagem: "PROGRAMA NAO ENCONTRADO" });
  });
});

describe("listarProgramas", () => {
  it("busca por código ou nome sem distinguir maiúsculas", async () => {
    await incluirPrograma(entrada(), prisma);
    const r = await listarProgramas({ q: "renda" }, prisma);
    expect(r.itens.map((p) => p.codPrograma)).toEqual(["PP01", "PX01"]);
    expect((await listarProgramas({ q: "pt0" }, prisma)).itens.map((p) => p.codPrograma)).toEqual(["PT01"]);
    expect((await listarProgramas({ q: "nada-disso" }, prisma)).total).toBe(0);
  });

  it("pagina de 10 em 10", async () => {
    for (let i = 0; i < 12; i++) await incluirPrograma(entrada({ codPrograma: `Z${String(i).padStart(3, "0")}` }), prisma);
    const p1 = await listarProgramas({ pagina: 1 }, prisma);
    expect(p1).toMatchObject({ total: 15, totalPaginas: 2, pagina: 1 });
    expect(p1.itens).toHaveLength(10);
    const p2 = await listarProgramas({ pagina: 2 }, prisma);
    expect(p2.itens).toHaveLength(5);
    expect((await listarProgramas({ pagina: 99 }, prisma)).pagina).toBe(2);
  });
});

describe("grupos do programa", () => {
  it("salvar faixas substitui todas com occurrence 1..n", async () => {
    const r = await salvarFaixas("PA01", [faixa, { ...faixa, rendaInicio: 50001, rendaFim: 90000 }], prisma);
    expect(r.ok).toBe(true);
    const rows = await prisma.programaFaixaCalculo.findMany({ where: { programa: { codPrograma: "PA01" } }, orderBy: { occurrence: "asc" } });
    expect(rows.map((f) => [f.occurrence, f.rendaInicio])).toEqual([
      [1, 0],
      [2, 50001],
    ]);
    await salvarFaixas("PA01", [], prisma);
    expect(await prisma.programaFaixaCalculo.count({ where: { programa: { codPrograma: "PA01" } } })).toBe(0);
  });

  it("6 faixas → mensagem de limite, nada gravado", async () => {
    const antes = await prisma.programaFaixaCalculo.count();
    const r = await salvarFaixas("PA01", Array.from({ length: 6 }, () => faixa), prisma);
    expect(r).toMatchObject({ ok: false });
    expect(r.mensagem).toMatch(/máx\. 5/);
    expect(await prisma.programaFaixaCalculo.count()).toBe(antes);
  });

  it("salvar parâmetros regionais substitui todos; 7 → limite", async () => {
    const r = await salvarParamsRegionais("PA01", Array.from({ length: 6 }, (_, i) => ({ ...param, codRegiao: i + 1 })), prisma);
    expect(r.ok).toBe(true);
    const rows = await prisma.programaParamRegional.findMany({ where: { programa: { codPrograma: "PA01" } }, orderBy: { occurrence: "asc" } });
    expect(rows.map((p) => p.occurrence)).toEqual([1, 2, 3, 4, 5, 6]);

    const r7 = await salvarParamsRegionais("PA01", Array.from({ length: 7 }, () => param), prisma);
    expect(r7.ok).toBe(false);
    expect(r7.mensagem).toMatch(/máx\. 6/);
    expect(await prisma.programaParamRegional.count({ where: { programa: { codPrograma: "PA01" } } })).toBe(6);
  });

  it("programa inexistente → PROGRAMA NAO ENCONTRADO", async () => {
    expect(await salvarFaixas("ZZZZ", [faixa], prisma)).toEqual({ ok: false, mensagem: "PROGRAMA NAO ENCONTRADO" });
    expect(await salvarParamsRegionais("ZZZZ", [param], prisma)).toEqual({ ok: false, mensagem: "PROGRAMA NAO ENCONTRADO" });
  });
});
