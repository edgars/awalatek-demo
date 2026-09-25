import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corrigirPagamentosAction } from "@/app/correcao/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { corrigirPagamentos } from "@/server/correcao";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Story 5.1 — corrección retroactiva (CALCCORR) contra una base SQLite temporal.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let dir: string;
let dbUrl: string;
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
  dbUrl = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: dbUrl }, stdio: "pipe" });
  prisma = createPrismaClient(dbUrl);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", dbUrl);
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

// Modo legado explícito: un SIFAP_QUIRKS_CORRIGIDOS del .env/entorno del desarrollador
// no cambia estos tests (las correcciones tienen tests propios).
beforeEach(() => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
});

describe("corrigirPagamentos", () => {
  it("período inválido → PERIODO INVALIDO - COMP INICIAL > FINAL, nada processado", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentos(CPF_MARIA, 201205, 201201, { db: prisma, agora: AGORA });
    expect(r).toEqual({ ok: false, mensagem: "PERIODO INVALIDO - COMP INICIAL > FINAL" });
    const depois = await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } });
    expect(depois).toMatchObject({ vlrCorrecao: null, dtCorrecao: null, indCorrigido: null });
  });

  it("corrige 100,00 em 201101 → 100,83; grava vlrCorrecao (valor completo), dtCorrecao = hoje e S", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201101, { db: prisma, agora: AGORA });
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
    const r1 = await corrigirPagamentos(CPF_MARIA, 202001, 202001, { db: prisma, agora: AGORA });
    const r2 = await corrigirPagamentos(CPF_MARIA, 201006, 201006, { db: prisma, agora: AGORA });
    for (const r of [r1, r2]) expect(r).toMatchObject({ ok: true, qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    for (const id of [fora.id, jun.id]) {
      expect(await prisma.pagamento.findUniqueOrThrow({ where: { id } })).toMatchObject({ vlrCorrecao: null, dtCorrecao: null, indCorrigido: null });
    }
  });

  it("já corrigido (S) é pulado; re-execução não corrige de novo", async () => {
    const ja = await pagamento(CPF_MARIA, 201102, 10000, { indCorrigido: "S", vlrCorrecao: 99999, dtCorrecao: 20200101 });
    const novo = await pagamento(CPF_MARIA, 201103, 10000);
    const r1 = await corrigirPagamentos(CPF_MARIA, 201101, 201112, { db: prisma, agora: AGORA });
    expect(r1).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 79 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: ja.id } })).toMatchObject({ vlrCorrecao: 99999, dtCorrecao: 20200101 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: novo.id } })).toMatchObject({ vlrCorrecao: 10079, indCorrigido: "S" });

    const r2 = await corrigirPagamentos(CPF_MARIA, 201101, 201112, { db: prisma, agora: new Date("2026-10-01T15:00:00Z") });
    expect(r2).toEqual({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: novo.id } })).toMatchObject({ vlrCorrecao: 10079, dtCorrecao: HOJE });
  });

  it("caso normal (inserção cronológica): total = soma das diferenças; só o CPF e o período informados", async () => {
    await pagamento(CPF_MARIA, 200912, 10000); // antes do período (ESCAPE TOP)
    const outro = await pagamento(CPF_JOSE, 201101, 10000); // outro CPF
    await pagamento(CPF_MARIA, 201101, 10000); // 100,83 → +0,83
    await pagamento(CPF_MARIA, 201207, 48500); // 487,08 → +2,08
    await pagamento(CPF_MARIA, 201212, 10000); // depois do período (ESCAPE BOTTOM)
    const r = await corrigirPagamentos(CPF_MARIA, 201001, 201211, { db: prisma, agora: AGORA });
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

  it("LEGACY-QUIRK(D22): competência > final lida antes (ordem de ISN) encerra o recorrido", async () => {
    const depois = await pagamento(CPF_MARIA, 201205, 10000); // numPagamento menor, fora do período
    const dentro = await pagamento(CPF_MARIA, 201101, 10000); // no período, mas lido depois
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201112, { db: prisma, agora: AGORA });
    expect(r).toEqual({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    expect(depois.numPagamento).toBeLessThan(dentro.numPagamento);
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: dentro.id } })).toMatchObject({ vlrCorrecao: null, indCorrigido: null });
  });

  it("competência anterior à inicial lida antes não encerra (ESCAPE TOP)", async () => {
    await pagamento(CPF_MARIA, 200912, 10000);
    await pagamento(CPF_MARIA, 201101, 10000);
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201112, { db: prisma, agora: AGORA });
    expect(r).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 83 });
  });

  it("indicador 'N' não impede a correção: termina como S", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000, { indCorrigido: "N" });
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201101, { db: prisma, agora: AGORA });
    expect(r).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 83 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ vlrCorrecao: 10083, dtCorrecao: HOJE, indCorrigido: "S" });
  });

  it("leitura desatualizada (já S na base) → não corrige de novo nem conta", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000, { indCorrigido: "S", vlrCorrecao: 12345, dtCorrecao: 20200101 });
    const real = prisma.pagamento;
    const pagamentoDesatualizado = {
      findMany: async (args: Parameters<typeof real.findMany>[0]) =>
        (await real.findMany(args)).map((x) => ({ ...x, indCorrigido: null })),
    };
    const dbDesatualizado = new Proxy(prisma, {
      get(alvo, prop) {
        if (prop === "pagamento") return pagamentoDesatualizado;
        const v: unknown = Reflect.get(alvo, prop, alvo);
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(alvo) : v;
      },
    }) as PrismaClient;
    const r = await corrigirPagamentos(CPF_MARIA, 201101, 201101, { db: dbDesatualizado, agora: AGORA });
    expect(r).toMatchObject({ ok: true, qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ vlrCorrecao: 12345, dtCorrecao: 20200101, indCorrigido: "S" });
  });

  it("CPF sem pagamentos → finalizada com 0 registros", async () => {
    const r = await corrigirPagamentos("99999999999", 201001, 201212, { db: prisma, agora: AGORA });
    expect(r).toMatchObject({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0 });
  });

  it("não registra auditoria (CALCCORR não audita)", async () => {
    await pagamento(CPF_MARIA, 201101, 10000);
    const antes = await prisma.auditoria.count();
    await corrigirPagamentos(CPF_MARIA, 201101, 201101, { db: prisma, agora: AGORA });
    expect(await prisma.auditoria.count()).toBe(antes);
  });
});

/** Fecha e descarta o singleton de `@/server/db` (o próximo uso relê DATABASE_URL). */
async function descartarClienteGlobal(): Promise<void> {
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
}

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

  it("executa a correção com a base do DATABASE_URL e revalida a consulta de pagamentos", async () => {
    const p = await pagamento(CPF_MARIA, 201101, 10000);
    vi.mocked(revalidatePath).mockClear();
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201101" }));
    expect(r).toMatchObject({ ok: true, qtdRegistros: 1, vlrTotal: 83 });
    expect(revalidatePath).toHaveBeenCalledWith("/pagamentos");
    expect(revalidatePath).toHaveBeenCalledWith(`/pagamentos/${p.numPagamento}`);
  });

  it("falha inesperada → mensagem genérica, sem CPF no log", async () => {
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    await descartarClienteGlobal();
    vi.stubEnv("DATABASE_URL", `file:${path.join(dir, "inexistente", "nada.db")}`);
    try {
      expect(await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201101" }))).toEqual({
        ok: false,
        mensagem: "Erro inesperado ao processar a solicitação. Tente novamente.",
      });
      expect(erroLog).toHaveBeenCalled();
      const logado = JSON.stringify(erroLog.mock.calls);
      expect(logado).not.toContain(CPF_MARIA);
    } finally {
      await descartarClienteGlobal();
      vi.stubEnv("DATABASE_URL", dbUrl);
      erroLog.mockRestore();
    }
  });
});
