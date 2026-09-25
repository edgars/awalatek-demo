import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import * as auditoria from "@/server/auditoria";
import { registrarEvento } from "@/server/auditoria";
import { createPrismaClient } from "@/server/db";

// Escritor único de auditoria contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-audit-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  prisma = createPrismaClient(url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  await prisma.auditoria.deleteMany(); // limpeza do teste, não do código de produção
});

const base = { acao: "IN", tabela: "BENEFICIARIO", chave: "01234567890", usuario: "SIFAPUSR", descricao: "INCLUSAO" } as const;

describe("registrarEvento", () => {
  it("numera sequencialmente numa base vazia (1, 2)", async () => {
    const a = await registrarEvento(base, prisma);
    const b = await registrarEvento({ ...base, acao: "AL" }, prisma);
    expect([a.numAuditoria, b.numAuditoria]).toEqual([1, 2]);
  });

  it("mantém max+1 na transação do insert sob concorrência (1..10)", async () => {
    const eventos = await Promise.all(Array.from({ length: 10 }, () => registrarEvento(base, prisma)));
    expect(eventos.map((e) => e.numAuditoria).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1),
    );
  });

  it("preenche dt/hr do evento via hoje()", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T02:30:00Z"));
    vi.stubEnv("TZ", "America/Sao_Paulo");
    try {
      const e = await registrarEvento(base, prisma);
      expect([e.dtEvento, e.hrEvento]).toEqual([20260924, 233000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("usa o momento informado pelo chamador (mesmo dt/hr para todos os eventos)", async () => {
    const momento = { data: 20260925, hora: 81502 };
    const a = await registrarEvento({ ...base, acao: "CO", momento }, prisma);
    await prisma.$transaction((tx) => registrarEvento({ ...base, acao: "DV", momento }, tx));
    const todos = await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } });
    expect(a.numAuditoria).toBe(1);
    expect(todos.map((e) => [e.dtEvento, e.hrEvento])).toEqual([
      [20260925, 81502],
      [20260925, 81502],
    ]);
    await expect(registrarEvento({ ...base, momento: { data: 1.5, hora: 0 } }, prisma)).rejects.toThrow(/momento/);
  });

  it("corta textos ao tamanho do DDM", async () => {
    const e = await registrarEvento(
      {
        acao: "CO",
        tabela: "X".repeat(30),
        chave: "9".repeat(30),
        usuario: "USUARIOLONGO",
        descricao: "D".repeat(100),
        valorAnterior: "antes",
        valorPosterior: "depois",
      },
      prisma,
    );
    expect(e.tipoEntidade).toHaveLength(15);
    expect(e.idEntidade).toHaveLength(20);
    expect(e.usrEvento).toBe("USUARIOL");
    expect(e.desAcao).toHaveLength(80);
    expect([e.valorAnterior, e.valorPosterior]).toEqual(["antes", "depois"]);
  });

  it("usa SIFAP_USER quando o usuário não é informado", async () => {
    vi.stubEnv("SIFAP_USER", "OPERADOR");
    const { usuario: _u, ...semUsuario } = base;
    void _u;
    expect((await registrarEvento(semUsuario, prisma)).usrEvento).toBe("OPERADOR");
    expect((await registrarEvento({ ...semUsuario, usuario: "  " }, prisma)).usrEvento).toBe("OPERADOR");
    vi.stubEnv("SIFAP_USER", "");
    await expect(registrarEvento(semUsuario, prisma)).rejects.toThrow(/SIFAP_USER/);
  });

  it("rejeita ação fora de IN/AL/CO/CN/DV/EX", async () => {
    await expect(
      registrarEvento({ ...base, acao: "XX" as unknown as auditoria.AcaoAuditoria }, prisma),
    ).rejects.toThrow(/ação/);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("grava dentro da transação do chamador (commit e rollback)", async () => {
    await prisma.$transaction(async (tx) => {
      await registrarEvento({ ...base, acao: "CO", usuario: "BATCH" }, tx);
      await registrarEvento({ ...base, acao: "DV", usuario: "BATCH" }, tx);
    });
    expect((await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } })).map((e) => e.numAuditoria)).toEqual([1, 2]);

    await expect(
      prisma.$transaction(async (tx) => {
        await registrarEvento({ ...base, acao: "CO", usuario: "BATCH" }, tx);
        throw new Error("falha do processo");
      }),
    ).rejects.toThrow("falha do processo");
    expect(await prisma.auditoria.count()).toBe(2);
  });

  it("não expõe funções de update ou delete", () => {
    const funcoes = Object.entries(auditoria)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    expect(funcoes).toEqual(["registrarEvento"]);
  });
});
