import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recalcularDescontosAction } from "@/app/descontos/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { calcularDescontos } from "@/domain/calculo/descontos";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { recalcularDescontos } from "@/server/descontos";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

vi.mock("@/server/descontos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/descontos")>();
  return { ...real, recalcularDescontos: vi.fn(real.recalcularDescontos) };
});

// Story 4.3 — recálculo de descontos de um pagamento (CALCDSCT) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base);
const AGORA = new Date("2026-09-24T15:30:00Z");
const HOJE = hoje(AGORA).data;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

const PGTO_MARIA = 5001;
const PGTO_JOSE = 5002;
const LIQUIDO_ORIGINAL = 77600;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-calcdsct-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("SIFAP_USER", "OPERADOR12");
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function beneficiarioId(cpf: string): Promise<number> {
  return (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf } })).id;
}

type Desc = { tipoDesconto: string; vlrDesconto?: number; pctDesconto?: string; dtInicioDsct?: number; dtFimDsct?: number; numProcesso?: string };

async function registrar(cpf: string, descontos: Desc[]) {
  const id = await beneficiarioId(cpf);
  await prisma.beneficiarioDesconto.deleteMany({ where: { beneficiarioId: id } });
  await prisma.beneficiarioDesconto.createMany({
    data: descontos.map((d, i) => ({
      beneficiarioId: id,
      occurrence: i + 1,
      tipoDesconto: d.tipoDesconto,
      vlrDesconto: d.vlrDesconto ?? 0,
      pctDesconto: d.pctDesconto ?? "0.00",
      dtInicioDsct: d.dtInicioDsct ?? 20250101,
      dtFimDsct: d.dtFimDsct ?? 0,
      numProcesso: d.numProcesso ?? null,
    })),
  });
}

beforeEach(async () => {
  await prisma.pagamento.deleteMany({});
  const base = {
    codPrograma: "PA01",
    anoMesRef: 202609,
    vlrBruto: 80000,
    vlrLiquido: LIQUIDO_ORIGINAL,
    vlrDescontoTotal: 2400,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 20260901,
    hrGeracao: 100000,
    usrInclusao: "BATCH",
  };
  await prisma.pagamento.create({ data: { ...base, numPagamento: PGTO_MARIA, numCpf: CPF_MARIA } });
  await prisma.pagamento.create({ data: { ...base, numPagamento: PGTO_JOSE, numCpf: CPF_JOSE, codPrograma: "PP01" } });
  await registrar(CPF_JOSE, []);
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("recalcularDescontos", () => {
  it("só contribuição: bruto 800,00 sem descontos → 40,00 (5 %); líquido sem mudança (D13)", async () => {
    const auditoriasAntes = await prisma.auditoria.count();
    const r = await recalcularDescontos(CPF_JOSE, PGTO_JOSE, prisma, AGORA);
    expect(r).toMatchObject({
      ok: true,
      mensagem: "DESCONTOS CALCULADOS",
      resumo: { numPagamento: PGTO_JOSE, vlrBruto: 80000, vlrDesconto: 4000, vlrContribuicao: 4000, vlrTeto: 24000, vlrLiquido: LIQUIDO_ORIGINAL, descontos: [] },
    });
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_JOSE }, include: { descontos: true } });
    const { data, hora } = hoje(AGORA);
    expect(p).toMatchObject({
      vlrDescontoTotal: 4000,
      vlrLiquido: LIQUIDO_ORIGINAL,
      dtUltAlteracao: data,
      hrUltAlteracao: hora,
      usrUltAlteracao: "OPERADOR",
    });
    expect(p.descontos).toEqual([]);
    // CALCDSCT não audita.
    expect(await prisma.auditoria.count()).toBe(auditoriasAntes);
  });

  it("registrados J fixo 25,00 + S → total do domínio e 2 linhas em PagamentoDesconto", async () => {
    await registrar(CPF_MARIA, [
      { tipoDesconto: "J", vlrDesconto: 2500, numProcesso: "PROC-1" },
      { tipoDesconto: "S", pctDesconto: "1.00" },
    ]);
    const esperado = calcularDescontos({
      vlrBruto: 80000,
      dtHoje: HOJE,
      descontos: [
        { occurrence: 1, tipoDesconto: "J", vlrDesconto: 2500, pctDesconto: "0.00", dtInicioDsct: 20250101, dtFimDsct: 0 },
        { occurrence: 2, tipoDesconto: "S", vlrDesconto: 0, pctDesconto: "1.00", dtInicioDsct: 20250101, dtFimDsct: 0 },
      ],
    });
    const r = await recalcularDescontos(CPF_MARIA, PGTO_MARIA, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 40,00 (contribuição) + 25,00 (J) + 8,00 (S 1 %) = 73,00
    expect(r.resumo.vlrDesconto).toBe(7300);
    expect(r.resumo.vlrDesconto).toBe(esperado.vlrTotal);
    expect(r.resumo.descontos.map((d) => [d.tipoDesconto, d.situacao, d.vlrItem])).toEqual([
      ["J", "aplicado", 2500],
      ["S", "aplicado", 800],
    ]);

    const linhas = await prisma.pagamentoDesconto.findMany({
      where: { pagamento: { numPagamento: PGTO_MARIA } },
      orderBy: { occurrence: "asc" },
    });
    expect(linhas.map(({ occurrence, tipoDesconto, vlrDesconto, pctDesconto, numProcesso, dtInicioDsct, dtFimDsct }) => ({
      occurrence,
      tipoDesconto,
      vlrDesconto,
      pctDesconto,
      numProcesso,
      dtInicioDsct,
      dtFimDsct,
    }))).toEqual([
      { occurrence: 1, tipoDesconto: "J", vlrDesconto: 2500, pctDesconto: "0.00", numProcesso: "PROC-1", dtInicioDsct: 20250101, dtFimDsct: 0 },
      { occurrence: 2, tipoDesconto: "S", vlrDesconto: 800, pctDesconto: "1.00", numProcesso: null, dtInicioDsct: 20250101, dtFimDsct: 0 },
    ]);
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_MARIA } });
    expect(p.vlrDescontoTotal).toBe(7300);
    expect(p.vlrLiquido).toBe(LIQUIDO_ORIGINAL);
  });

  it("LEGACY-QUIRK(D2): descontos acima de 30 % do bruto → total limitado ao teto", async () => {
    await registrar(CPF_MARIA, [
      { tipoDesconto: "J", vlrDesconto: 30000 },
      { tipoDesconto: "A", vlrDesconto: 1000 },
    ]);
    const r = await recalcularDescontos(CPF_MARIA, PGTO_MARIA, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 40 + 300 (J, sem teto) = 340 → + 10 (A) = 350 > 240 → 240 (recorta inclusive o judicial).
    expect(r.resumo.vlrTeto).toBe(24000);
    expect(r.resumo.vlrDesconto).toBe(24000);
    expect(r.resumo.descontos.map((d) => d.tetoAplicado)).toEqual([false, true]);
    expect((await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_MARIA } })).vlrDescontoTotal).toBe(24000);
  });

  it("fora de vigência e tipo desconhecido: não aplicados nem gravados, mas listados", async () => {
    await registrar(CPF_MARIA, [
      { tipoDesconto: "P", vlrDesconto: 5000, dtFimDsct: 20200101 },
      { tipoDesconto: "I", pctDesconto: "10.00", dtInicioDsct: 20300101 },
      { tipoDesconto: "C", pctDesconto: "5.00" },
      { tipoDesconto: "J", vlrDesconto: 1000 },
    ]);
    const r = await recalcularDescontos(CPF_MARIA, PGTO_MARIA, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumo.vlrDesconto).toBe(5000); // 40 + 10 (J)
    expect(r.resumo.descontos.map((d) => [d.occurrence, d.situacao])).toEqual([
      [1, "foraDeVigencia"],
      [2, "foraDeVigencia"],
      [3, "ignorado"],
      [4, "aplicado"],
    ]);
    const linhas = await prisma.pagamentoDesconto.findMany({ where: { pagamento: { numPagamento: PGTO_MARIA } } });
    expect(linhas.map((l) => [l.occurrence, l.tipoDesconto, l.vlrDesconto])).toEqual([[1, "J", 1000]]);
  });

  it("recálculo repetido substitui as linhas e mantém o total", async () => {
    await registrar(CPF_MARIA, [{ tipoDesconto: "J", vlrDesconto: 2500 }, { tipoDesconto: "S" }]);
    const r1 = await recalcularDescontos(CPF_MARIA, PGTO_MARIA, prisma, AGORA);
    const r2 = await recalcularDescontos(CPF_MARIA, PGTO_MARIA, prisma, AGORA);
    expect(r2).toEqual(r1);
    const linhas = await prisma.pagamentoDesconto.findMany({ where: { pagamento: { numPagamento: PGTO_MARIA } } });
    expect(linhas).toHaveLength(2);
  });

  it("RK-314dbfb4a26e — pagamento de outro CPF → PAGAMENTO NAO ENCONTRADO e nada gravado", async () => {
    await registrar(CPF_MARIA, [{ tipoDesconto: "J", vlrDesconto: 2500 }]);
    expect(await recalcularDescontos(CPF_MARIA, PGTO_JOSE, prisma, AGORA)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: PGTO_JOSE }, include: { descontos: true } });
    expect(p).toMatchObject({ vlrDescontoTotal: 2400, vlrLiquido: LIQUIDO_ORIGINAL, usrUltAlteracao: "" });
    expect(p.descontos).toEqual([]);
  });

  it("RK-8b1376b9c23d — pagamento inexistente → PAGAMENTO NAO ENCONTRADO", async () => {
    expect(await recalcularDescontos(CPF_MARIA, 999999, prisma, AGORA)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
    expect(await recalcularDescontos("123", PGTO_MARIA, prisma, AGORA)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
  });
});

describe("recalcularDescontosAction", () => {
  it("valida a forma da entrada com zod", async () => {
    expect(await recalcularDescontosAction(null, form({ numCpf: "123", numPagamento: "1" }))).toMatchObject({ ok: false, campo: "numCpf" });
    expect(await recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: "" }))).toMatchObject({
      ok: false,
      campo: "numPagamento",
    });
    expect(await recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: "0" }))).toMatchObject({
      ok: false,
      campo: "numPagamento",
    });
    expect(await recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: "9999999999" }))).toMatchObject({
      ok: false,
      campo: "numPagamento",
    });
  });

  it("delega ao caso de uso (singleton da base)", async () => {
    const r = await recalcularDescontosAction(null, form({ numCpf: CPF_JOSE, numPagamento: String(PGTO_JOSE) }));
    expect(r).toMatchObject({ ok: true, mensagem: "DESCONTOS CALCULADOS", resumo: { vlrDesconto: 4000 } });
  });

  it("erro inesperado → mensagem genérica, sem dados pessoais no log", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recalcularDescontos).mockRejectedValueOnce(Object.assign(new Error(`falha ${CPF_MARIA}`), { code: "P1001" }));
    const r = await recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: String(PGTO_MARIA) }));
    expect(r).toEqual({ ok: false, mensagem: "Erro inesperado ao processar a solicitação. Tente novamente." });
    expect(JSON.stringify(erro.mock.calls)).not.toContain(CPF_MARIA);
    erro.mockRestore();
  });
});
