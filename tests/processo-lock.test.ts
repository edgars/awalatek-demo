import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executarLoteAction } from "@/app/lote/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { conciliarRetorno } from "@/server/conciliacao";
import { createPrismaClient } from "@/server/db";
import { ejecutarLotePagamentos, loteEmExecucao, situacaoLote } from "@/server/lotePagamentos";
import {
  adquirirLock,
  comLock,
  expiracaoLockMs,
  forcarLiberacao,
  liberarLock,
  LOCK_CONCILIACAO,
  LOCK_LOTE_PAGAMENTOS,
  lockAtivo,
  type LockAdquirido,
} from "@/server/processoLock";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";
import { arquivoRetorno } from "./fixtures/cnab240";

// H1 — candado entre procesos (tabla ProcessoLock). Dos clientes Prisma sobre el mismo
// archivo SQLite simulan dos procesos (web y CLI); el CLI real y la disputa entre dos
// procesos reales se ejecutan en procesos hijos.

let dir: string;
let url: string;
/** "Proceso" A (p. ej. la web). */
let a: PrismaClient;
/** "Proceso" B (p. ej. el CLI). */
let b: PrismaClient;
const AGORA = new Date("2026-09-24T15:30:00Z");
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const semLog = () => {};
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const TIMEOUT_FILHO = 60_000;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-lock-"));
  url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  a = createPrismaClient(url);
  b = createPrismaClient(url);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  await seed(a);
});

afterAll(async () => {
  await a?.$disconnect();
  await b?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  await a.processoLock.deleteMany();
});

const lote = (db: PrismaClient, dtHoje: number) => ejecutarLotePagamentos({ dtHoje, agora: AGORA, db, log: semLog });
const envFilho = () => ({ ...process.env, DATABASE_URL: url, SIFAP_QUIRKS_CORRIGIDOS: "" });

/** Cliente que delega em `alvo`, com `antes(n)` / `depois(n)` em volta de cada `$transaction`. */
function comTransacao(alvo: PrismaClient, ganchos: { antes?: (n: number) => Promise<void>; depois?: (n: number) => Promise<void> }): PrismaClient {
  let n = 0;
  return new Proxy(alvo, {
    get(t, prop, receptor) {
      if (prop !== "$transaction") return Reflect.get(t, prop, receptor);
      return async (fn: Parameters<PrismaClient["$transaction"]>[0]) => {
        const i = ++n;
        await ganchos.antes?.(i);
        const r = await alvo.$transaction(fn as never);
        await ganchos.depois?.(i);
        return r;
      };
    },
  });
}

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Executa um processo filho sem bloquear o event loop. */
function executar(args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const filho = spawn("npx", args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    filho.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    const limite = setTimeout(() => {
      filho.kill("SIGKILL");
      reject(new Error("timeout do processo filho"));
    }, TIMEOUT_FILHO);
    filho.on("close", (status) => {
      clearTimeout(limite);
      resolve({ status, stdout });
    });
  });
}

describe("adquirirLock / liberarLock", () => {
  it("dois processos disputando ao mesmo tempo → exatamente um adquire", async () => {
    const [x, y] = await Promise.all([adquirirLock(a, "TESTE"), adquirirLock(b, "TESTE")]);
    expect([x, y].filter((l) => l !== null)).toHaveLength(1);
    await (x ?? y)!.liberar();
    expect(await a.processoLock.count()).toBe(0);
  });

  it("dois processos reais (filhos) disputando ao mesmo tempo → exatamente um adquire", async () => {
    const env = { ...envFilho(), INICIO: String(Date.now() + 4000) };
    const fixture = path.join("tests", "fixtures", "disputar-lock.ts");
    const rs = await Promise.all([executar(["tsx", fixture], env), executar(["tsx", fixture], env)]);
    expect(rs.map((r) => r.status)).toEqual([0, 0]);
    expect(rs.map((r) => r.stdout.trim()).sort()).toEqual(["ADQUIRIDO", "OCUPADO"]);
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
    // O dono antigo não solta nem renova o candado do novo dono.
    expect(await orfao!.renovar()).toBe(false);
    await orfao!.liberar();
    expect(await lockAtivo(a, "TESTE", { agora })).toBe(true);
    expect(await novo!.renovar()).toBe(true);
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

  it("comLock: falha ao liberar → loga só nome/código e devolve o resultado", async () => {
    const quebrado = new Proxy(a, {
      get(t, prop, receptor) {
        if (prop !== "processoLock") return Reflect.get(t, prop, receptor);
        return new Proxy(t.processoLock, {
          get(m, p, r) {
            if (p !== "deleteMany") return Reflect.get(m, p, r);
            // A limpeza de órfãos (sem `dono`) passa; a liberação (com `dono`) falha.
            return (args: { where: { dono?: string } }) =>
              args.where.dono ? Promise.reject(Object.assign(new Error(`dados ${CPF_MARIA}`), { code: "P9999" })) : m.deleteMany(args as never);
          },
        });
      },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await comLock(quebrado, "TESTE", () => "ocupado", async () => "feito")).toBe("feito");
      expect(log.mock.calls).toEqual([["[lock] falha ao liberar TESTE:", "Error", "P9999"]]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_MARIA);
    } finally {
      log.mockRestore();
    }
  });

  it("adquirirLock: erro que não é P2002 propaga", async () => {
    const quebrado = new Proxy(a, {
      get(t, prop, receptor) {
        if (prop !== "processoLock") return Reflect.get(t, prop, receptor);
        return new Proxy(t.processoLock, {
          get: (m, p, r) => (p === "create" ? () => Promise.reject(Object.assign(new Error("io"), { code: "P1001" })) : Reflect.get(m, p, r)),
        });
      },
    });
    await expect(adquirirLock(quebrado, "TESTE")).rejects.toMatchObject({ code: "P1001" });
  });

  it("expiracaoLockMs: inteiro de 1 a 10080 minutos; vazio → 120; inválido → 120 com aviso", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(expiracaoLockMs({})).toBe(120 * 60_000);
      expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: " " })).toBe(120 * 60_000);
      expect(aviso).not.toHaveBeenCalled();
      expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "30" })).toBe(30 * 60_000);
      expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "1" })).toBe(60_000);
      expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: "10080" })).toBe(10_080 * 60_000);
      for (const invalido of ["0.001", "1e12", "abc", "-5", "0", "10081", "1000000000000"]) {
        expect(expiracaoLockMs({ SIFAP_LOCK_EXPIRACAO_MIN: invalido })).toBe(120 * 60_000);
      }
      expect(aviso).toHaveBeenCalledTimes(7);
      expect(String(aviso.mock.calls[0]?.[0])).toContain("SIFAP_LOCK_EXPIRACAO_MIN inválida");
    } finally {
      aviso.mockRestore();
    }
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
    await a.processoLock.create({ data: { nome: LOCK_LOTE_PAGAMENTOS, dono: "caido", adquiridoEm: new Date(AGORA.getTime() - 3 * 3_600_000) } });
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

  it("corrida mais longa que a expiração: a renovação mantém o candado contra um concorrente", async () => {
    // Cada beneficiário leva ~150 ms; expiração de 300 ms; renova a cada beneficiário (5 no seed ≈ 750 ms).
    const lento = comTransacao(a, { antes: () => espera(150) });
    const corrida = ejecutarLotePagamentos({ dtHoje: 20250501, db: lento, log: semLog, lock: { expiracaoMs: 300, renovarACada: 1 } });
    await espera(500);
    const concorrente = await adquirirLock(b, LOCK_LOTE_PAGAMENTOS, { expiracaoMs: 300 });
    expect(concorrente).toBeNull();
    expect(await corrida).toMatchObject({ ok: true, resumo: { gerados: 1 } });
    expect(await a.processoLock.count()).toBe(0);
  });

  it("sem renovação no período, o concorrente assume o candado expirado (controle)", async () => {
    const lento = comTransacao(a, { antes: () => espera(150) });
    const corrida = ejecutarLotePagamentos({ dtHoje: 20250601, db: lento, log: semLog, lock: { expiracaoMs: 300, renovarACada: 1000 } });
    await espera(500);
    const concorrente = await adquirirLock(b, LOCK_LOTE_PAGAMENTOS, { expiracaoMs: 300 });
    expect(concorrente).not.toBeNull();
    await corrida;
    await concorrente!.liberar();
  });

  it("candado perdido no meio da corrida → para com 'LOTE INTERROMPIDO: CANDADO PERDIDO' e resumo parcial", async () => {
    const roubo: { lock: LockAdquirido | null } = { lock: null };
    // Depois do 1.º beneficiário, alguém libera à força e outro processo toma o candado.
    const db = comTransacao(a, {
      depois: async (n) => {
        if (n !== 1) return;
        await forcarLiberacao(b, LOCK_LOTE_PAGAMENTOS);
        roubo.lock = await adquirirLock(b, LOCK_LOTE_PAGAMENTOS);
      },
    });
    const linhas: string[] = [];
    const r = await ejecutarLotePagamentos({ dtHoje: 20250701, agora: AGORA, db, log: (l) => linhas.push(l), lock: { renovarACada: 1 } });
    expect(r).toMatchObject({ ok: false, mensagem: "LOTE INTERROMPIDO: CANDADO PERDIDO", resumo: { processados: 1 } });
    expect(linhas).toContain("LOTE INTERROMPIDO: CANDADO PERDIDO");
    // O candado do novo dono continua lá (o lote interrompido não o solta).
    expect(roubo.lock).not.toBeNull();
    expect(await a.processoLock.findUnique({ where: { nome: LOCK_LOTE_PAGAMENTOS } })).toMatchObject({ dono: roubo.lock!.dono });
    await roubo.lock!.liberar();
  });

  it("action: erro ao adquirir o candado (não P2002) → mensagem genérica, sem PII no log", async () => {
    await a.$executeRawUnsafe('DROP TABLE "ProcessoLock"');
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await executarLoteAction()).toEqual({ ok: false, mensagem: "Erro inesperado ao processar a solicitação. Tente novamente." });
      expect(log).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_MARIA);
    } finally {
      log.mockRestore();
      await a.$executeRawUnsafe('CREATE TABLE "ProcessoLock" ("nome" TEXT NOT NULL PRIMARY KEY, "dono" TEXT NOT NULL, "adquiridoEm" DATETIME NOT NULL)');
    }
  });

  it("CLI (outro processo real) com lote em execução na web → mensagem e saída ≠ 0", async () => {
    const web = await adquirirLock(a, LOCK_LOTE_PAGAMENTOS);
    try {
      const r = spawnSync("npx", ["tsx", "scripts/lote-pagamentos.ts", "--data=20250801"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Lote já em execução.");
      expect(await a.pagamento.count({ where: { anoMesRef: 202508 } })).toBe(0);
    } finally {
      await web!.liberar();
    }
  });

  it("CLI (outro processo real) com --data fixa roda nessa competência e libera o candado", async () => {
    const r = spawnSync("npx", ["tsx", "scripts/lote-pagamentos.ts", "--data=20250901"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
    expect(r.status).toBe(0);
    expect(await a.pagamento.count({ where: { anoMesRef: 202509, numCpf: CPF_MARIA } })).toBe(1);
    expect(await a.processoLock.count()).toBe(0);
  });

  it("CLI: --data inválida → saída 2 sem rodar", () => {
    const r = spawnSync("npx", ["tsx", "scripts/lote-pagamentos.ts", "--data=20251301"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--data deve ser AAAAMMDD");
  });
});

describe("lock:liberar (runbook)", () => {
  it("remove à força o cadeado nomeado e imprime o que removeu; inexistente → aviso", async () => {
    const preso = await adquirirLock(b, LOCK_CONCILIACAO);
    const r = spawnSync("npx", ["tsx", "scripts/liberar-lock.ts", "conciliacao"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Cadeado CONCILIACAO removido (dono ${preso!.dono}`);
    expect(await a.processoLock.count()).toBe(0);
    const vazio = spawnSync("npx", ["tsx", "scripts/liberar-lock.ts", "LOTE-PAGAMENTOS"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
    expect(vazio.status).toBe(0);
    expect(vazio.stdout).toContain("Nenhum cadeado LOTE-PAGAMENTOS encontrado.");
  });

  it("nome inválido → uso e saída 2", () => {
    const r = spawnSync("npx", ["tsx", "scripts/liberar-lock.ts", "OUTRO"], { env: envFilho(), encoding: "utf8", timeout: TIMEOUT_FILHO });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Uso: npm run lock:liberar -- <LOTE-PAGAMENTOS|CONCILIACAO>");
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

  it("candado perdido no meio → 'CONCILIACAO INTERROMPIDA: CANDADO PERDIDO' e resumo parcial", async () => {
    await a.pagamento.deleteMany({ where: { anoMesRef: 199201 } });
    for (const n of [801, 802, 803]) {
      await a.pagamento.create({
        data: { numPagamento: n, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199201, vlrBruto: 10000, vlrLiquido: 10000, sitPagamento: "G", dtGeracao: 19920105, hrGeracao: 0 },
      });
    }
    const roubo: { lock: LockAdquirido | null } = { lock: null };
    const db = comTransacao(a, {
      depois: async (n) => {
        if (n !== 1) return;
        await forcarLiberacao(b, LOCK_CONCILIACAO);
        roubo.lock = await adquirirLock(b, LOCK_CONCILIACAO);
      },
    });
    vi.stubEnv("SIFAP_USER", "SIFAPUSR");
    const conteudo = arquivoRetorno([801, 802, 803].map((numDoc) => ({ cpf: CPF_MARIA, numDoc, valor: 10000 })));
    const r = await conciliarRetorno({ competencia: 199201, conteudo }, { db, lock: { renovarACada: 1 } });
    expect(r).toMatchObject({ ok: false, mensagem: "CONCILIACAO INTERROMPIDA: CANDADO PERDIDO", resumo: { detalhes: 1, conciliados: 1 } });
    expect((await a.pagamento.findMany({ where: { anoMesRef: 199201 }, orderBy: { numPagamento: "asc" } })).map((p) => p.sitPagamento)).toEqual(["P", "G", "G"]);
    expect(roubo.lock).not.toBeNull();
    await roubo.lock!.liberar();
  });
});
