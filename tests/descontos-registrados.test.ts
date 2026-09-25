import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { salvarDescontosRegistradosAction } from "@/app/beneficiarios/[chave]/descontos/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DescontoRegistrado } from "@/domain/beneficiario/descontosRegistrados";
import { createPrismaClient } from "@/server/db";
import { listarDescontosRegistrados, salvarDescontosRegistrados } from "@/server/descontosRegistrados";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Delega no caso de uso real; um teste força a falha inesperada com mockRejectedValueOnce.
vi.mock("@/server/descontosRegistrados", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/descontosRegistrados")>();
  return { ...real, salvarDescontosRegistrados: vi.fn(real.salvarDescontosRegistrados) };
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Casos de uso dos descontos registrados (story 2.5) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPF_S0 = cpfComDv(BENEFICIARIOS_SEED[0].base); // seed: 1 desconto J
const CPF_S1 = cpfComDv(BENEFICIARIOS_SEED[1].base); // seed: sem descontos
const CPF_INEXISTENTE = "15975348625";
const HOJE = 20260924;

/** H2 (LGPD): as rotas/ações recebem a chave opaca do beneficiário, nunca o CPF. */
const chaveDe = async (cpf: string) =>
  (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } })).chavePublica;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-dsct-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pela Server Action) aponta para a mesma base.
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
  vi.stubEnv("DATABASE_URL", url);
});

afterAll(async () => {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
  vi.unstubAllEnvs();
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  // limpeza do teste: base = seed
  await prisma.beneficiarioDesconto.deleteMany({});
  await seed(prisma);
});

const J: DescontoRegistrado = {
  tipoDesconto: "J",
  vlrDesconto: 2500,
  pctDesconto: "0.00",
  dtInicioDsct: 20260101,
  dtFimDsct: 0,
  numProcesso: "123",
};
const S: DescontoRegistrado = { tipoDesconto: "S", vlrDesconto: 0, pctDesconto: "0.00", dtInicioDsct: 20260101, dtFimDsct: 0, numProcesso: null };

async function filasDe(cpf: string) {
  return prisma.beneficiarioDesconto.findMany({ where: { beneficiario: { numCpf: cpf } }, orderBy: { occurrence: "asc" } });
}

describe("listarDescontosRegistrados", () => {
  it("lista ordenado por occurrence, com vigência", async () => {
    const r = await listarDescontosRegistrados(CPF_S0, prisma, HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.beneficiario).toEqual({ numCpf: CPF_S0, nomeCompleto: "MARIA APARECIDA DA SILVA", sitBeneficiario: "A" });
    expect(r.descontos).toEqual([
      { occurrence: 1, tipoDesconto: "J", vlrDesconto: 2500, pctDesconto: "0.00", dtInicioDsct: 20250301, dtFimDsct: 0, numProcesso: "0001234-56.2025", vigenteHoje: true },
    ]);
  });

  it("CPF inexistente ou malformado → BENEFICIARIO NAO ENCONTRADO", async () => {
    expect(await listarDescontosRegistrados(CPF_INEXISTENTE, prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
    expect(await listarDescontosRegistrados("abc", prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
  });

  it("fim < hoje ou início > hoje → não vigente", async () => {
    await salvarDescontosRegistrados(
      CPF_S1,
      [
        { ...J, dtInicioDsct: 20250101, dtFimDsct: 20250601 },
        { ...J, dtInicioDsct: 20270101 },
        { ...J, dtInicioDsct: HOJE, dtFimDsct: HOJE },
      ],
      prisma,
      HOJE,
    );
    const r = await listarDescontosRegistrados(CPF_S1, prisma, HOJE);
    expect(r.ok && r.descontos.map((d) => d.vigenteHoje)).toEqual([false, false, true]);
  });
});

describe("salvarDescontosRegistrados", () => {
  it("J + S → 2 filas, occurrence 1..2, substitui as anteriores", async () => {
    const r = await salvarDescontosRegistrados(CPF_S0, [J, S], prisma, HOJE);
    expect(r).toEqual({ ok: true, mensagem: "Descontos gravados (2).", vigentes: [true, true] });
    const filas = await filasDe(CPF_S0);
    expect(filas.map((f) => [f.occurrence, f.tipoDesconto, f.vlrDesconto, f.numProcesso, f.dtFimDsct])).toEqual([
      [1, "J", 2500, "123", 0],
      [2, "S", 0, null, 0],
    ]);
  });

  it("lista vazia remove todas as filas", async () => {
    expect(await salvarDescontosRegistrados(CPF_S0, [], prisma)).toMatchObject({ ok: true, mensagem: "Descontos gravados (0)." });
    expect(await filasDe(CPF_S0)).toHaveLength(0);
  });

  it("9 filas → limite, nada gravado", async () => {
    const r = await salvarDescontosRegistrados(CPF_S1, Array.from({ length: 9 }, () => S), prisma);
    expect(r).toEqual({ ok: false, mensagem: "Limite de 8 descontos excedido (máx. 8)." });
    expect(await filasDe(CPF_S1)).toHaveLength(0);
  });

  it("fila fora do esquema (tipo, Int32, data de calendário) → nada gravado", async () => {
    for (const ruim of [
      { ...J, tipoDesconto: "X" as DescontoRegistrado["tipoDesconto"] },
      { ...J, vlrDesconto: 2_147_483_648 },
      { ...J, dtInicioDsct: 20260231 },
      { ...J, pctDesconto: "1.234" },
    ]) {
      expect((await salvarDescontosRegistrados(CPF_S0, [ruim], prisma)).ok).toBe(false);
    }
    expect((await filasDe(CPF_S0)).map((f) => f.dtInicioDsct)).toEqual([20250301]);
  });

  it("fila inválida (defesa) → nada gravado", async () => {
    const r = await salvarDescontosRegistrados(CPF_S0, [J, { ...J, numProcesso: null }], prisma);
    expect(r.ok).toBe(false);
    expect((await filasDe(CPF_S0)).map((f) => f.dtInicioDsct)).toEqual([20250301]);
  });

  it("beneficiário inexistente → BENEFICIARIO NAO ENCONTRADO", async () => {
    expect(await salvarDescontosRegistrados(CPF_INEXISTENTE, [J], prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
  });

  it("não toca Pagamento/PagamentoDesconto", async () => {
    const antes = [await prisma.pagamento.count(), await prisma.pagamentoDesconto.count()];
    await salvarDescontosRegistrados(CPF_S0, [J, S], prisma);
    expect([await prisma.pagamento.count(), await prisma.pagamentoDesconto.count()]).toEqual(antes);
  });
});

describe("salvarDescontosRegistradosAction", () => {
  function form(linhas: Record<string, string>[]) {
    const fd = new FormData();
    for (const l of linhas) for (const [k, v] of Object.entries(l)) fd.append(k, v);
    return fd;
  }
  const lj = { tipoDesconto: "J", vlrDesconto: "2500", pctDesconto: "0.00", dtInicioDsct: "20260101", dtFimDsct: "0", numProcesso: "123" };
  const ls = { tipoDesconto: "S", vlrDesconto: "0", pctDesconto: "0.00", dtInicioDsct: "20260101", dtFimDsct: "0", numProcesso: "" };

  it("grava duas filas", async () => {
    const r = await salvarDescontosRegistradosAction(await chaveDe(CPF_S1), null, form([lj, ls]));
    expect(r).toMatchObject({ ok: true, mensagens: ["Descontos gravados (2)."] });
    expect(r?.vigentes).toHaveLength(2);
    expect(await filasDe(CPF_S1)).toHaveLength(2);
  });

  it("J sem processo → erro na fila, nada gravado", async () => {
    const r = await salvarDescontosRegistradosAction(await chaveDe(CPF_S1), null, form([ls, { ...lj, numProcesso: "" }]));
    expect(r).toEqual({
      ok: false,
      mensagens: ["Desconto 2 — Nº processo: obrigatório para desconto judicial (J)"],
      erros: { "1.numProcesso": "Nº processo: obrigatório para desconto judicial (J)" },
    });
    expect(await filasDe(CPF_S1)).toHaveLength(0);
  });

  it("9 filas → limite", async () => {
    const r = await salvarDescontosRegistradosAction(await chaveDe(CPF_S1), null, form(Array.from({ length: 9 }, () => ls)));
    expect(r).toMatchObject({ ok: false, mensagens: ["Limite de 8 descontos excedido (máx. 8)."] });
  });

  it("campos com quantidades diferentes → formulário inválido, nada gravado", async () => {
    const fd = form([lj, ls]);
    fd.delete("numProcesso");
    fd.append("numProcesso", "123");
    const r = await salvarDescontosRegistradosAction(await chaveDe(CPF_S1), null, fd);
    expect(r).toEqual({ ok: false, mensagens: ["Formulário inválido: campos dos descontos incompletos. Recarregue a página."] });
    expect(await filasDe(CPF_S1)).toHaveLength(0);
  });

  it("erro inesperado → mensagem genérica; log só com nome e código", async () => {
    const erro = Object.assign(new Error(`falha gravando CPF ${CPF_S1}`), { name: "PrismaClientKnownRequestError", code: "P2002" });
    vi.mocked(salvarDescontosRegistrados).mockRejectedValueOnce(erro);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await salvarDescontosRegistradosAction(await chaveDe(CPF_S1), null, form([lj]));
      expect(r).toEqual({ ok: false, mensagens: ["Erro inesperado ao processar a solicitação. Tente novamente."] });
      expect(log).toHaveBeenCalledWith("[descontos] gravação:", "PrismaClientKnownRequestError", "P2002");
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_S1);
    } finally {
      log.mockRestore();
    }
  });

  it("chave de rota malformada ou inexistente (ou um CPF no lugar da chave) → BENEFICIARIO NAO ENCONTRADO", async () => {
    expect(await salvarDescontosRegistradosAction("123", null, form([lj]))).toEqual({ ok: false, mensagens: ["BENEFICIARIO NAO ENCONTRADO"] });
    expect(await salvarDescontosRegistradosAction(CPF_INEXISTENTE, null, form([lj]))).toEqual({
      ok: false,
      mensagens: ["BENEFICIARIO NAO ENCONTRADO"],
    });
    // H2: a rota não aceita mais o CPF, nem de um beneficiário existente.
    expect(await salvarDescontosRegistradosAction(CPF_S1, null, form([lj]))).toEqual({ ok: false, mensagens: ["BENEFICIARIO NAO ENCONTRADO"] });
    expect(await salvarDescontosRegistradosAction("00000000-0000-4000-8000-000000000000", null, form([lj]))).toEqual({
      ok: false,
      mensagens: ["BENEFICIARIO NAO ENCONTRADO"],
    });
  });
});
