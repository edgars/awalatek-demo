import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { conciliarRetorno } from "@/server/conciliacao";
import { createPrismaClient } from "@/server/db";
import { ejecutarLotePagamentos, loteEmExecucao, situacaoLote } from "@/server/lotePagamentos";
import {
  adquirirLock,
  comLock,
  expiracaoLockMs,
  liberarLock,
  LOCK_CONCILIACAO,
  LOCK_LOTE_PAGAMENTOS,
  lockAtivo,
} from "@/server/processoLock";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";
import { arquivoRetorno } from "./fixtures/cnab240";

// H1 — candado entre procesos (tabla ProcessoLock). Dos clientes Prisma sobre el mismo
// archivo SQLite simulan dos procesos (web y CLI); el CLI real se ejecuta en un
// proceso hijo.

let dir: string;
let url: string;
/** "Proceso" A (p. ej. la web). */
let a: PrismaClient;
/** "Proceso" B (p. ej. el CLI). */
let b: PrismaClient;
const AGORA = new Date("2026-09-24T15:30:00Z");
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const semLog = () => {};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-lock-"));
  url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  a = createPrismaClient(url);
  b = createPrismaClient(url);
  await seed(a);
});

afterAll(async () => {
  await a?.$disconnect();
  await b?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  await a.processoLock.deleteMany();
});

const lote = (db: PrismaClient, dtHoje: number) => ejecutarLotePagamentos({ dtHoje, agora: AGORA, db, log: semLog });

describe("adquirirLock / liberarLock", () => {
  it("dois processos disputando ao mesmo tempo → exatamente um adquire", async () => {
    const [x, y] = await Promise.all([adquirirLock(a, "TESTE"), adquirirLock(b, "TESTE")]);
    expect([x, y].filter((l) => l !== null)).toHaveLength(1);
    await (x ?? y)!.liberar();
    expect(await a.processoLock.count()).toBe(0);
  });

  it("ocupado enquanto não expira; órfão expirado é substituído", async () => {
    const agora = new Date();
    const orfao = await adquirirLock(a, "TESTE", { agora: new Date(agora.getTime() - 3 * 3_600_000) });
    expect(orfao).not.toBeNull();
    // 3 h > 2 h (padrão): o candado do processo caído não bloqueia mais.
    expect(await lockAtivo(b, "TESTE", { agora })).toBe(false);
    const novo = await adquirirLock(b, "TESTE", { agora });
    expect(novo).not.toBeNull();
    // Com expiração maior que a idade, continuaria ocupado.
    expect(await adquirirLock(a, "TESTE", { agora, expiracaoMs: 4 * 3_600_000 })).toBeNull();
    // O dono antigo não solta o candado do novo dono.
    await orfao!.liberar();
    expect(await lockAtivo(a, "TESTE", { agora })).toBe(true);
    await novo!.liberar();
    expect(await lockAtivo(a, "TESTE", { agora })).toBe(false);
  });

  it("liberarLock só remove o candado do mesmo dono", async () => {
    const l = await adquirirLock(a, "TESTE");
    await liberarLock(b, "TESTE", "outro-dono");
    expect(await a.processoLock.count({ where: { nome: "TESTE" } })).toBe(1);
    await liberarLock(b, "TESTE", l!.dono);
    expect(await a.processoLock.count({ where: { nome: "TESTE" } })).toBe(0);
  });

  it("comLock libera no finally mesmo com erro", async () => {
    await expect(comLock(a, "TESTE", () => "ocupado", () => Promise.reject(new Error("falha")))).rejects.toThrow("falha");
    expect(await a.processoLock.count()).toBe(0);
  });

  it("expiracaoLockMs: SIFAP_LOCK_EXPIRACAO_MIN em minutos; vazio/inválido → 120", () => {
    expect(expiracaoLockMs({})).toBe(120 * 60_000);
    expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "30" })).toBe(30 * 60_000);
    expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: " " })).toBe(120 * 60_000);
    expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "abc" })).toBe(120 * 60_000);
    expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "-5" })).toBe(120 * 60_000);
  });
});

describe("lote entre processos", () => {
  it("lote de outro processo em execução → 'Lote já em execução.' sem gravar; liberado → roda", async () => {
    const outro = await adquirirLock(b, LOCK_LOTE_PAGAMENTOS);
    expect(await loteEmExecucao(a)).toBe(true);
    expect((await situacaoLote(a, AGORA)).emExecucao).toBe(true);
    expect(await lote(a, 20250101)).toEqual({ ok: false, mensagem: "Lote já em execução." });
    expect(await a.pagamento.count({ where: { anoMesRef: 202501 } })).toBe(0);
    await outro!.liberar();
    expect(await lote(a, 20250101)).toMatchObject({ ok: true, resumo: { gerados: 1 } });
    expect(await a.processoLock.count()).toBe(0);
  });

  it("dois processos simultâneos na mesma competência → um roda, o outro recebe a mensagem; sem duplicata", async () => {
    const [x, y] = await Promise.all([lote(a, 20250201), lote(b, 20250201)]);
    const resultados = [x, y];
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toEqual([{ ok: false, mensagem: "Lote já em execução." }]);
    expect(await a.pagamento.count({ where: { anoMesRef: 202502, numCpf: CPF_MARIA } })).toBe(1);
  });

  it("candado órfão (processo caído há mais que a expiração) não bloqueia o lote", async () => {
    await a.processoLock.create({ data: { nome: LOCK_LOTE_PAGAMENTOS, dono: "caido", adquiridoEm: new Date(Date.now() - 3 * 3_600_000) } });
    expect(await loteEmExecucao(a)).toBe(false);
    expect(await lote(b, 20250301)).toMatchObject({ ok: true });
    expect(await a.processoLock.count()).toBe(0);
  });

  it("erro antes do recorrido → candado liberado", async () => {
    const quebrado = new Proxy(a, {
      get(alvo, prop, receptor) {
        if (prop === "pagamento") return { aggregate: () => Promise.reject(Object.assign(new Error("x"), { code: "P9999" })) };
        return Reflect.get(alvo, prop, receptor);
      },
    });
    await expect(lote(quebrado, 20250401)).rejects.toMatchObject({ code: "P9999" });
    expect(await a.processoLock.count()).toBe(0);
  });

  it("CLI (outro processo real) com lote em execução na web → mensagem e saída ≠ 0", async () => {
    const web = await adquirirLock(a, LOCK_LOTE_PAGAMENTOS);
    try {
      const r = spawnSync("npx", ["tsx", "scripts/lote-pagamentos.ts"], {
        env: { ...process.env, DATABASE_URL: url, SIFAP_QUIRKS_CORRIGIDOS: "" },
        encoding: "utf8",
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Lote já em execução.");
    } finally {
      await web!.liberar();
    }
  });

  it("CLI (outro processo real) libera o candado ao terminar", async () => {
    const r = spawnSync("npx", ["tsx", "scripts/lote-pagamentos.ts"], {
      env: { ...process.env, DATABASE_URL: url, SIFAP_QUIRKS_CORRIGIDOS: "" },
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(await a.processoLock.count()).toBe(0);
  });
});

describe("conciliação entre processos", () => {
  it("conciliação de outro processo em execução → 'Conciliação já em execução.'; liberada → roda", async () => {
    const outro = await adquirirLock(b, LOCK_CONCILIACAO);
    const conteudo = arquivoRetorno([]);
    expect(await conciliarRetorno({ competencia: 199201, conteudo }, { db: a })).toEqual({ ok: false, mensagem: "Conciliação já em execução." });
    await outro!.liberar();
    expect(await conciliarRetorno({ competencia: 199201, conteudo }, { db: a })).toMatchObject({ ok: true });
    expect(await a.processoLock.count()).toBe(0);
  });

  it("lote e conciliação usam candados distintos", async () => {
    const l = await adquirirLock(b, LOCK_LOTE_PAGAMENTOS);
    try {
      expect(await conciliarRetorno({ competencia: 199201, conteudo: arquivoRetorno([]) }, { db: a })).toMatchObject({ ok: true });
    } finally {
      await l!.liberar();
    }
  });
});
