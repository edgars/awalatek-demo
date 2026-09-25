import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ERRO_INESPERADO, falhaInesperada } from "@/app/relatorios/auditoria/falha";
import type { PrismaClient } from "@/generated/prisma/client";
import { registrarEvento, type EventoAuditoria } from "@/server/auditoria";
import { createPrismaClient } from "@/server/db";
import { relatorioAuditoria } from "@/server/relatorioAuditoria";
import * as modulo from "@/server/relatorioAuditoria";

// Informe de la trilla de auditoría (RELAUDIT, story 7.3) contra una base SQLite temporal.
// Los eventos se siembran solo con `registrarEvento` (único escritor, ADR-009); la fecha
// y la hora del evento se fijan con el reloj falso de vitest.

let dir: string;
let prisma: PrismaClient;
const AGORA = new Date("2026-09-25T15:00:00Z"); // 20260925
const VAZIA = { dtIni: 0, dtFim: 0, acao: "", usuario: "", tabela: "", saida: "" };
const ANO_2011 = { ...VAZIA, dtIni: 20110101, dtFim: 20111231 };

/** Grava um evento com `registrarEvento` na data/hora (TZ=UTC no teste) indicada. */
async function evento(dt: number, hr: number, over: Partial<EventoAuditoria> = {}) {
  const s = String(dt);
  const h = String(hr).padStart(6, "0");
  vi.setSystemTime(new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}Z`));
  return registrarEvento({ acao: "IN", tabela: "BENEFICIARIO", chave: "01234567890", usuario: "BATCH", descricao: "INCLUSAO DE BENEFICIARIO", ...over }, prisma);
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-relaudit-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.stubEnv("TZ", "UTC"); // relógio do evento sem horário de verão histórico
  await prisma.auditoria.deleteMany(); // limpeza do teste, não do código de produção
  vi.useFakeTimers({ toFake: ["Date"] });
});

describe("falhaInesperada (relatório de auditoria)", () => {
  it("devolve a mensagem genérica e só registra nome e código do erro", () => {
    const erro = Object.assign(new Error("falha na consulta usrEvento = MARIA"), { name: "PrismaClientKnownRequestError", code: "P2025" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(falhaInesperada("relatorio", erro)).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
      const args = JSON.stringify(spy.mock.calls[0]);
      expect(args).toContain("PrismaClientKnownRequestError");
      expect(args).toContain("P2025");
      expect(args).not.toContain("MARIA");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("relatorioAuditoria", () => {
  it("defaults: 19970101–hoje, saída T; EX oculto e contado como filtrado", async () => {
    await evento(19961231, 120000);
    await evento(19970101, 80000, { acao: "AL" });
    await evento(20110315, 90503, { acao: "EX" });
    await evento(20260925, 110000, { acao: "CO", tabela: "PAGAMENTO" });
    const r = await relatorioAuditoria(VAZIA, prisma, AGORA);
    expect(r.filtros).toEqual({ ...VAZIA, dtIni: 19970101, dtFim: 20260925, saida: "T" });
    expect(r.dataEmissao).toBe(20260925);
    expect(r.saida).toBe("T");
    expect(r.linhas.map((l) => [l.dtEvento, l.hora, l.acaoDesc])).toEqual([
      [19970101, "08:00:00", "ALTERACAO"],
      [20260925, "11:00:00", "CONCILIACAO"],
    ]);
    expect(r.resumo).toEqual({ total: 3, exibidos: 2, filtrados: 1, porAcao: { inclusao: 0, alteracao: 1, consulta: 0, conciliacao: 1, divergencia: 0, outras: 0 } });
  });

  it("filtros por ação, usuário e tabela; saída I com descrição; hora com zeros", async () => {
    await evento(20110315, 90503, { acao: "CO", usuario: "BATCH", tabela: "PAGAMENTO", descricao: "CONCILIADO" });
    await evento(20110316, 100000, { acao: "DV", usuario: "BATCH", tabela: "PAGAMENTO" });
    await evento(20110317, 100000, { acao: "CO", usuario: "MARIA", tabela: "PAGAMENTO" });
    await evento(20110318, 100000, { acao: "CO", usuario: "BATCH", tabela: "BENEFICIARIO" });
    const r = await relatorioAuditoria({ ...ANO_2011, acao: "CO", usuario: "BATCH", tabela: "PAGAMENTO", saida: "I" }, prisma, AGORA);
    expect(r.saida).toBe("I");
    expect(r.linhas).toEqual([
      { numAuditoria: 1, dtEvento: 20110315, hora: "09:05:03", usuario: "BATCH", codAcao: "CO", acaoDesc: "CONCILIACAO", tabela: "PAGAMENTO", chave: "01234567890", descricao: "CONCILIADO" },
    ]);
    expect(r.resumo).toMatchObject({ total: 4, exibidos: 1, filtrados: 3 });
  });

  it("60 eventos no período → páginas de 54 e 6", async () => {
    for (let i = 0; i < 60; i++) await evento(20110401, 100000 + i);
    const r = await relatorioAuditoria(ANO_2011, prisma, AGORA);
    expect(r.paginas.map((p) => p.length)).toEqual([54, 6]);
    expect(r.linhas.map((l) => l.numAuditoria)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("período invertido → vazio", async () => {
    await evento(20110315, 100000);
    const r = await relatorioAuditoria({ ...VAZIA, dtIni: 20111231, dtFim: 20110101 }, prisma, AGORA);
    expect(r).toMatchObject({ linhas: [], paginas: [], resumo: { total: 0, exibidos: 0, filtrados: 0 } });
  });

  it("somente leitura: não exporta escrita e não altera a base", async () => {
    await evento(20110315, 100000);
    const antes = await prisma.auditoria.findMany();
    await relatorioAuditoria(ANO_2011, prisma, AGORA);
    expect(await prisma.auditoria.findMany()).toEqual(antes);
    expect(Object.keys(modulo)).toEqual(["relatorioAuditoria"]);
  });
});

// ---------------------------------------------------------------------------
// FR-AUD-07 — auditoria imutável: nenhuma rota, Server Action ou API grava auditoria.

function arquivos(raiz: string): string[] {
  return readdirSync(raiz).flatMap((nome) => {
    const p = path.join(raiz, nome);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx|js|jsx|mjs)$/.test(nome) ? [p] : [];
  });
}

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const ESCRITA_AUDITORIA = /\bauditoria\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|delete|deleteMany|upsert)\b/;

describe("FR-AUD-07 — auditoria imutável", () => {
  it("src/app não contém escrita de auditoria (create/update/delete/upsert)", () => {
    const achados = arquivos(path.join(RAIZ, "src/app")).filter((f) => ESCRITA_AUDITORIA.test(readFileSync(f, "utf8")));
    expect(achados).toEqual([]);
  });

  it("em src, só src/server/auditoria.ts (registrarEvento) grava auditoria", () => {
    const achados = arquivos(path.join(RAIZ, "src"))
      .filter((f) => !f.includes(`${path.sep}generated${path.sep}`) && !/\.test\.tsx?$/.test(f))
      .filter((f) => ESCRITA_AUDITORIA.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(achados).toEqual([path.join("src", "server", "auditoria.ts")]);
  });

  it("nenhum Route Handler nem Server Action em src/app referencia a tabela de auditoria para gravar", () => {
    const suspeitos = arquivos(path.join(RAIZ, "src/app")).filter((f) => {
      const src = readFileSync(f, "utf8");
      const ehRotaOuAcao = /(^|[\\/])route\.(ts|js)$/.test(f) || /^\s*["']use server["']/m.test(src);
      return ehRotaOuAcao && /\.auditoria\b/.test(src);
    });
    expect(suspeitos).toEqual([]);
  });

  it("o escritor único não exporta atualização nem exclusão", async () => {
    const auditoria = await import("@/server/auditoria");
    expect(Object.keys(auditoria).filter((k) => typeof (auditoria as Record<string, unknown>)[k] === "function")).toEqual(["registrarEvento"]);
  });
});
