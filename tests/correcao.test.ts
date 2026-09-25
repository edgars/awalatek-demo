import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corrigirPagamentosAction } from "@/app/correcao/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { corrigirPagamentos } from "@/server/correcao";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Story 5.1 — corrección retroactiva (CALCCORR) contra una base SQLite temporal.

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // PA01
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base); // PP01
const AGORA = new Date("2026-09-24T15:30:00Z");
const HOJE = hoje(AGORA).data;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

let proximoNum = 1;

async function pagamento(numCpf: string, anoMesRef: number, vlrBruto: number, extra: Record<string, unknown> = {}) {
  return prisma.pagamento.create({
    data: {
      numPagamento: proximoNum++,
      numCpf,
      codPrograma: numCpf === CPF_MARIA ? "PA01" : "PP01",
      anoMesRef,
      vlrBruto,
      vlrLiquido: vlrBruto,
      sitPagamento: "G",
      dtGeracao: 20260901,
      hrGeracao: 100000,
      usrInclusao: "TESTE",
      ...extra,
    },
  });
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-calccorr-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  await seed(prisma);
});

beforeEach(async () => {
  await prisma.pagamentoDesconto.deleteMany();
  await prisma.pagamento.deleteMany();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("corrigirPagamentos", () => {
  it("período inválido → PERIODO INVALIDO - COMP INICIAL > FINAL, nada processado", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentos(CPF_MARIA, 201205, 201201, prisma, AGORA);
    expect(r).toEqual({ ok: false, mensagem: "PERIODO INVALIDO - COMP INICIAL > FINAL" });
    const depois = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
    expect(depois).toMatchObject({ vlrCorrecao: null, dtCorrecao: null, indCorrigido: null });
  });

  it("corrige 100,00 em 201101 → 100,83; grava vlrCorrecao (valor completo), dtCorrecao = hoje e S", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201101, prisma, AGORA);
    expect(r).toEqual({
      ok: true,
      mensagem: "CORRECAO RETROATIVA FINALIZADA",
      qtdRegistros: 1,
      vlrTotal: 83,
      corrigidos: [{ numPagamento: p.numPagamento, competencia: 201101, vlrOriginal: 10000, vlrCorrigido: 10083, vlrDiferenca: 83 }],
    });
    const depois = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
    expect(depois).toMatchObject({ vlrCorrecao: 10083, dtCorrecao: HOJE, indCorrigido: "S", vlrBruto: 10000, vlrLiquido: 10000 });
  });

  it("fora da tabela (D9) e jun/2010 → diferença 0, não marca", async () => {
    const fora = await pagamento(CPF_MARIA, 202001, 10000);
    const jun = await pagamento(CPF_MARIA, 201006, 10000);
    const r1 = await corrigirPagamentos(CPF_MARIA, 202001, 202001, prisma, AGORA);
    const r2 = await corrigirPagamentos(CPF_MARIA, 201006, 201006, prisma, AGORA);
    for (const r of [r1, r2]) expect(r).toMatchObject({ ok: true, qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    for (const id of [fora.id, jun.id]) {
      expect(await prisma.pagamento.findUniqueOrThrow({ where: { id } })).toMatchObject({ vlrCorrecao: null, dtCorrecao: null, indCorrigido: null });
    }
  });

  it("já corrigido (S) é pulado; re-execução não corrige de novo", async () => {
    const ja = await pagamento(CPF_MARIA, 201102, 10000, { indCorrigido: "S", vlrCorrecao: 99999, dtCorrecao: 20200101 });
    const novo = await pagamento(CPF_MARIA, 201103, 10000);
    const r1 = await corrigirPagamentos(CPF_MARIA, 201101, 201112, prisma, AGORA);
    expect(r1).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 79 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: ja.id } })).toMatchObject({ vlrCorrecao: 99999, dtCorrecao: 20200101 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: novo.id } })).toMatchObject({ vlrCorrecao: 10079, indCorrigido: "S" });

    const r2 = await corrigirPagamentos(CPF_MARIA, 201101, 201112, prisma, new Date("2026-10-01T15:00:00Z"));
    expect(r2).toEqual({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: novo.id } })).toMatchObject({ vlrCorrecao: 10079, dtCorrecao: HOJE });
  });

  it("total = soma das diferenças; só o CPF e o período informados; ordem por competência", async () => {
    await pagamento(CPF_MARIA, 201207, 48500); // 487,08 → +2,08
    await pagamento(CPF_MARIA, 201101, 10000); // 100,83 → +0,83
    await pagamento(CPF_MARIA, 201212, 10000); // fora do período
    await pagamento(CPF_MARIA, 200912, 10000); // antes do período
    const outro = await pagamento(CPF_JOSE, 201101, 10000); // outro CPF
    const r = await corrigirPagamentos(CPF_MARIA, 201001, 201211, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.qtdRegistros).toBe(2);
    expect(r.vlrTotal).toBe(291);
    expect(r.corrigidos.map((c) => [c.competencia, c.vlrCorrigido, c.vlrDiferenca])).toEqual([
      [201101, 10083, 83],
      [201207, 48708, 208],
    ]);
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: outro.id } })).toMatchObject({ indCorrigido: null });
    expect(await prisma.pagamento.count({ where: { indCorrigido: "S" } })).toBe(2);
  });

  it("CPF sem pagamentos → finalizada com 0 registros", async () => {
    const r = await corrigirPagamentos("99999999999", 201001, 201212, prisma, AGORA);
    expect(r).toMatchObject({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0 });
  });

  it("não registra auditoria (CALCCORR não audita)", async () => {
    await pagamento(CPF_MARIA, 201101, 10000);
    const antes = await prisma.auditoria.count();
    await corrigirPagamentos(CPF_MARIA, 201101, 201101, prisma, AGORA);
    expect(await prisma.auditoria.count()).toBe(antes);
  });
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("corrigirPagamentosAction", () => {
  it("valida a forma com zod e aponta o campo", async () => {
    expect(await corrigirPagamentosAction(null, form({ numCpf: "123", compIni: "201101", compFim: "201112" }))).toMatchObject({
      ok: false,
      campo: "numCpf",
    });
    expect(await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "", compFim: "201112" }))).toMatchObject({
      ok: false,
      campo: "compIni",
    });
    expect(await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201113" }))).toMatchObject({
      ok: false,
      campo: "compFim",
    });
  });

  it("período invertido → mensagem literal do legado", async () => {
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201205", compFim: "201201" }));
    expect(r).toEqual({ ok: false, mensagem: "PERIODO INVALIDO - COMP INICIAL > FINAL" });
  });

  it("executa a correção com a base do DATABASE_URL", async () => {
    await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201101" }));
    expect(r).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 83 });
  });
});
