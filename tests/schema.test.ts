import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Matriz I/O da story 0.1 contra uma base SQLite temporária.

let dir: string;
let dbUrl: string;
let prisma: PrismaClient;

function migrar(url: string): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-schema-"));
  dbUrl = `file:${path.join(dir, "test.db")}`;
  migrar(dbUrl);
  prisma = createPrismaClient(dbUrl);
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("esquema e seed", () => {
  it("cria as 10 tabelas do modelo (9 do legado + ProcessoLock)", async () => {
    const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%'",
    );
    expect(rows.map((r) => r.name).sort()).toEqual(
      [
        "Auditoria",
        "Beneficiario",
        "BeneficiarioDependente",
        "BeneficiarioDesconto",
        "Pagamento",
        "PagamentoDesconto",
        "ProcessoLock",
        "ProgramaFaixaCalculo",
        "ProgramaParamRegional",
        "ProgramaSocial",
      ].sort(),
    );
  });

  it("cpfComDv calcula os dígitos verificadores (módulo 11)", () => {
    expect(cpfComDv("012345678")).toBe("01234567890");
  });

  it("carrega 3 programas (A,P,T) e 5 beneficiários (A,S,C,I,D)", async () => {
    const programas = await prisma.programaSocial.findMany({ orderBy: { tipoPrograma: "asc" } });
    expect(programas.map((p) => p.tipoPrograma)).toEqual(["A", "P", "T"]);
    const benef = await prisma.beneficiario.findMany();
    expect(benef.map((b) => b.sitBeneficiario).sort()).toEqual(["A", "C", "D", "I", "S"]);
    expect(benef.every((b) => /^\d{11}$/.test(b.numCpf))).toBe(true);
    expect(benef.some((b) => b.numCpf.startsWith("0"))).toBe(true);
  });

  it("é idempotente", async () => {
    await seed(prisma);
    await seed(prisma);
    expect(await prisma.programaSocial.count()).toBe(3);
    expect(await prisma.beneficiario.count()).toBe(5);
    expect(await prisma.beneficiarioDependente.count()).toBe(1);
    expect(await prisma.beneficiarioDesconto.count()).toBe(1);
    expect(await prisma.programaFaixaCalculo.count()).toBe(1);
    expect(await prisma.programaParamRegional.count()).toBe(1);
  });

  it("apaga dependentes e descontos em cascata", async () => {
    const numCpf = cpfComDv(BENEFICIARIOS_SEED[0].base);
    const b = await prisma.beneficiario.findUniqueOrThrow({
      where: { numCpf },
      include: { dependentes: true, descontos: true },
    });
    try {
      expect(b.dependentes.length).toBeGreaterThan(0);
      expect(b.descontos.length).toBeGreaterThan(0);
      await prisma.beneficiario.delete({ where: { numCpf } });
      expect(await prisma.beneficiarioDependente.count({ where: { beneficiarioId: b.id } })).toBe(0);
      expect(await prisma.beneficiarioDesconto.count({ where: { beneficiarioId: b.id } })).toBe(0);
    } finally {
      await seed(prisma); // restaura sempre
    }
  });

  it("rejeita segundo beneficiário com o mesmo numCpf (P2002)", async () => {
    const existente = await prisma.beneficiario.findFirstOrThrow();
    const { id: _id, numCpf, nis: _nis, ...resto } = existente;
    void _id;
    void _nis;
    await expect(prisma.beneficiario.create({ data: { ...resto, numCpf } })).rejects.toMatchObject({
      code: "P2002",
    });
  });
});

describe("entrada real do seed (prisma db seed)", () => {
  it("carrega 3 programas e 5 beneficiários numa base nova", async () => {
    const url = `file:${path.join(dir, "seed-cli.db")}`;
    migrar(url);
    execFileSync("npx", ["prisma", "db", "seed"], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    const client = createPrismaClient(url);
    try {
      expect(await client.programaSocial.count()).toBe(3);
      expect(await client.beneficiario.count()).toBe(5);
    } finally {
      await client.$disconnect();
    }
  });
});
