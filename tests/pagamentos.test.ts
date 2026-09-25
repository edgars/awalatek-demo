import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { lerFiltrosPagamentos } from "@/domain/pagamento";
import { createPrismaClient } from "@/server/db";
import { listarPagamentos, obterPagamento, TAMANHO_PAGINA } from "@/server/pagamentos";
import * as modulo from "@/server/pagamentos";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Consulta de pagamentos (story 4.4) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPF_A = cpfComDv(BENEFICIARIOS_SEED[0].base); // PA01
const CPF_B = cpfComDv(BENEFICIARIOS_SEED[1].base); // PP01

function pagamento(numPagamento: number, over: Record<string, unknown> = {}) {
  return {
    numPagamento,
    numCpf: CPF_A,
    codPrograma: "PA01",
    anoMesRef: 202609,
    vlrBruto: 50000,
    vlrLiquido: 48500,
    vlrDescontoTotal: 1500,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 20260901,
    hrGeracao: 101500,
    ...over,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-pgto-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.pagamento.deleteMany();
});

async function tresPagamentos() {
  await prisma.pagamento.create({ data: pagamento(1) });
  await prisma.pagamento.create({ data: pagamento(2, { numCpf: CPF_B, codPrograma: "PP01", sitPagamento: "P" }) });
  await prisma.pagamento.create({ data: pagamento(3, { anoMesRef: 202608 }) });
}

describe("listarPagamentos", () => {
  it("vazia → nenhum item, 1 página", async () => {
    expect(await listarPagamentos({}, prisma)).toEqual({ itens: [], total: 0, pagina: 1, totalPaginas: 1 });
  });

  it("3 pagamentos → ordenados por Nº desc", async () => {
    await tresPagamentos();
    const r = await listarPagamentos({}, prisma);
    expect(r.itens.map((p) => p.numPagamento)).toEqual([3, 2, 1]);
    expect(r.total).toBe(3);
  });

  it("filtro CPF exato → só os pagamentos dele", async () => {
    await tresPagamentos();
    const r = await listarPagamentos(lerFiltrosPagamentos({ cpf: CPF_B }), prisma);
    expect(r.itens.map((p) => p.numPagamento)).toEqual([2]);
  });

  it("CPF parcial → nenhuma coincidência (sem enumeração)", async () => {
    await tresPagamentos();
    const r = await listarPagamentos(lerFiltrosPagamentos({ cpf: CPF_B.slice(0, 6) }), prisma);
    expect(r.itens).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("competência + situação", async () => {
    await tresPagamentos();
    const r = await listarPagamentos(lerFiltrosPagamentos({ competencia: "202609", situacao: "G" }), prisma);
    expect(r.itens.map((p) => p.numPagamento)).toEqual([1]);
  });

  it("programa", async () => {
    await tresPagamentos();
    const r = await listarPagamentos(lerFiltrosPagamentos({ programa: "PA01" }), prisma);
    expect(r.itens.map((p) => p.numPagamento)).toEqual([3, 1]);
  });

  it("paginação de 10; página além do fim → última", async () => {
    for (let n = 1; n <= 12; n++) await prisma.pagamento.create({ data: pagamento(n, { anoMesRef: 202600 + (n % 12) + 1 }) });
    const p1 = await listarPagamentos({ pagina: 1 }, prisma);
    expect(p1.itens).toHaveLength(TAMANHO_PAGINA);
    expect(p1.itens[0]?.numPagamento).toBe(12);
    expect(p1.totalPaginas).toBe(2);
    const p9 = await listarPagamentos({ pagina: 9 }, prisma);
    expect(p9.pagina).toBe(2);
    expect(p9.itens.map((p) => p.numPagamento)).toEqual([2, 1]);
  });
});

describe("obterPagamento", () => {
  it("detalhe com descontos na ordem de occurrence, correção e conciliação", async () => {
    await prisma.pagamento.create({
      data: {
        ...pagamento(7, {
          vlrCorrecao: 1234,
          dtCorrecao: 20260915,
          indCorrigido: "S",
          dtPagamento: 20260910,
          codBanco: "001",
          codRetornoBanco: "00",
          sitConciliacao: "C",
        }),
        descontos: {
          create: [
            { occurrence: 2, tipoDesconto: "S", vlrDesconto: 500, pctDesconto: "1.00", dtInicioDsct: 20260101 },
            { occurrence: 1, tipoDesconto: "J", vlrDesconto: 1000, pctDesconto: "0.00", numProcesso: "123", dtInicioDsct: 20260101 },
          ],
        },
      },
    });
    const r = await obterPagamento(7, prisma);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pagamento.descontos.map((d) => [d.occurrence, d.tipoDesconto])).toEqual([
      [1, "J"],
      [2, "S"],
    ]);
    expect(r.pagamento).toMatchObject({ vlrCorrecao: 1234, indCorrigido: "S", codBanco: "001", sitConciliacao: "C" });
  });

  it("inexistente ou inválido → PAGAMENTO NAO ENCONTRADO", async () => {
    expect(await obterPagamento(999999, prisma)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
    expect(await obterPagamento(null, prisma)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
    expect(await obterPagamento(0, prisma)).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
  });
});

describe("ADR-009 — sem escrita", () => {
  it("o módulo expõe somente leitura", () => {
    expect(Object.keys(modulo).sort()).toEqual(["TAMANHO_PAGINA", "listarPagamentos", "obterPagamento"]);
  });
});
