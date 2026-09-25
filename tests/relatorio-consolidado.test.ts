import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Beneficiario, PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";
import { relatorioConsolidado } from "@/server/relatorioConsolidado";
import * as modulo from "@/server/relatorioConsolidado";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Informe consolidado mensual (story 7.2) contra una base SQLite temporal.

let dir: string;
let prisma: PrismaClient;
let modeloBenef: Omit<Beneficiario, "id">;
const REGIOES = [3, 7, 12, 18, 22, 99] as const;
const cpfRegiao = (r: number) => completaDv(`7720000${String(r).padStart(2, "0")}`);
const AGORA = new Date("2026-09-25T15:00:00Z");

function pagamento(numPagamento: number, numCpf: string, over: Record<string, unknown> = {}) {
  return {
    numPagamento,
    numCpf,
    codPrograma: "PA01",
    anoMesRef: 201101,
    vlrBruto: 10000,
    vlrLiquido: 9500,
    vlrDescontoTotal: 500,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 20110101,
    hrGeracao: 101500,
    ...over,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-consol-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
  const modelo = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpfComDv(BENEFICIARIOS_SEED[0].base) } });
  const { id: _id, ...dados } = modelo;
  void _id;
  modeloBenef = { ...dados, nis: null };
  for (const r of REGIOES) {
    await prisma.beneficiario.create({ data: { ...dados, nis: null, numCpf: cpfRegiao(r), codRegiao: r } });
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.pagamento.deleteMany();
});

describe("relatorioConsolidado", () => {
  it("sem pagamentos → todas as linhas em zero e data de emissão", async () => {
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.competencia).toBe(201101);
    expect(r.dataEmissao).toBe(20260925);
    expect(r.regioes.map((x) => x.nome)).toEqual(["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE"]);
    expect(r.regioes.every((x) => x.qtd === 0 && x.bruto === 0 && x.desconto === 0 && x.liquido === 0)).toBe(true);
    expect(r.status.map((x) => x.nome)).toEqual(["GERADO", "PAGO", "CANCELADO", "DEVOLVIDO", "ESTORNADO"]);
    expect(r.status.every((x) => x.qtd === 0 && x.bruto === 0)).toBe(true);
    expect(r.total).toEqual({ qtd: 0, bruto: 0, desconto: 0, liquido: 0 });
  });

  it("agrupa por região do beneficiário (D10), status desconhecido → GERADO, outra competência excluída", async () => {
    let n = 1;
    for (const r of REGIOES) {
      await prisma.pagamento.create({ data: pagamento(n++, cpfRegiao(r), { sitPagamento: r === 99 ? "X" : "P" }) });
    }
    await prisma.pagamento.create({ data: pagamento(n++, cpfRegiao(3), { anoMesRef: 201102, vlrBruto: 99999 }) });

    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.regioes.map((x) => [x.nome, x.qtd, x.bruto, x.desconto, x.liquido])).toEqual([
      ["NORTE", 1, 10000, 500, 9500],
      ["NORDESTE", 1, 10000, 500, 9500],
      ["SUDESTE", 1, 10000, 500, 9500],
      ["SUL", 1, 10000, 500, 9500],
      ["CENTRO-OESTE", 2, 20000, 1000, 19000],
    ]);
    expect(r.status.map((x) => [x.codigo, x.qtd, x.bruto])).toEqual([
      ["G", 1, 10000],
      ["P", 5, 50000],
      ["C", 0, 0],
      ["D", 0, 0],
      ["E", 0, 0],
    ]);
    expect(r.total).toEqual({ qtd: 6, bruto: 60000, desconto: 3000, liquido: 57000 });
  });

  it("pagamento de CPF sem beneficiário → CENTRO-OESTE", async () => {
    // A FK impede o caso na base; ele é simulado desligando as FKs só neste teste.
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    try {
      await prisma.pagamento.create({ data: pagamento(50, completaDv("772999999")) });
    } finally {
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    }
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.regioes[4]).toEqual({ nome: "CENTRO-OESTE", qtd: 1, bruto: 10000, desconto: 500, liquido: 9500 });
    expect(r.total.qtd).toBe(1);
  });

  it("somente leitura: o módulo não exporta escritas", () => {
    expect(Object.keys(modulo).sort()).toEqual(["LOTE_CPFS", "relatorioConsolidado"]);
  });
});

describe("relatorioConsolidado — lotes de CPFs", () => {
  const COMP = 201201;

  async function criar(prefixo: string, cods: readonly number[], inicio: number) {
    const cpfs = cods.map((_, i) => completaDv(`${prefixo}${String(i).padStart(9 - prefixo.length, "0")}`));
    await prisma.beneficiario.deleteMany({ where: { numCpf: { in: cpfs } } });
    await prisma.beneficiario.createMany({
      data: cods.map((codRegiao, i) => ({ ...modeloBenef, numCpf: cpfs[i] ?? "", codRegiao })),
    });
    await prisma.pagamento.createMany({
      data: cpfs.map((cpf, i) => pagamento(inicio + i, cpf, { anoMesRef: COMP })),
    });
    return cpfs;
  }

  const qtdPorRegiao = (r: Awaited<ReturnType<typeof relatorioConsolidado>>) => r.regioes.map((x) => x.qtd);

  it("lote de 3 com 8 beneficiários → cada um na sua região (nenhum sobra em CENTRO-OESTE)", async () => {
    const cods = [1, 2, 6, 7, 11, 16, 17, 20] as const;
    await criar("7731", cods, 1000);
    const r = await relatorioConsolidado(COMP, prisma, { agora: AGORA, loteCpfs: 3 });
    expect(qtdPorRegiao(r)).toEqual([2, 2, 1, 3, 0]);
    expect(r.total.qtd).toBe(8);
    // Mesmo resultado com o lote padrão.
    const padrao = await relatorioConsolidado(COMP, prisma, { agora: AGORA });
    expect(padrao.regioes).toEqual(r.regioes);
  });

  it("501 CPFs com o lote padrão (500) → segundo lote também resolvido", async () => {
    const cods = Array.from({ length: 501 }, (_, i) => [1, 6, 11, 16][i % 4] as number);
    await criar("774", cods, 2000);
    const r = await relatorioConsolidado(COMP, prisma, { agora: AGORA });
    expect(qtdPorRegiao(r)).toEqual([126, 125, 125, 125, 0]);
    expect(r.total.qtd).toBe(501);
  });

  it("lote inválido → erro", async () => {
    await expect(relatorioConsolidado(COMP, prisma, { loteCpfs: 0 })).rejects.toThrow();
  });
});
