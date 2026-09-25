import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv, mascaraCpfLista } from "@/domain/cpf";
import type { QuirksMotor } from "@/domain/calculo/motor";
import { createPrismaClient } from "@/server/db";
import { ejecutarLotePagamentos, LOTE_LEITURA_BENEFICIARIOS } from "@/server/lotePagamentos";
import { PROGRAMAS_SEED, seed } from "../prisma/seed";

// H3 — o lote lê os beneficiários por cursor (lotes de 500, ordem numCpf). Qualquer
// tamanho de leitura dá exatamente o mesmo resultado: mesma ordem, mesma numeração,
// mesmo resumo, mesmos logs e o arrastre D17 (legado) atravessando a fronteira das leituras.

let dir: string;
let prisma: PrismaClient;
const AGORA = new Date("2026-09-24T15:30:00Z");
const DT_HOJE = 20260301;

/** PRNG determinístico (mulberry32). */
function prng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-lote-cursor-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
  const rnd = prng(777);
  const escolhe = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  // Rendas acima de 9.999,99 (D17) intercaladas com rendas normais; situações e programas variados.
  const bases = new Set<string>();
  while (bases.size < 45) bases.add(String(100000000 + Math.floor(rnd() * 800000000)));
  await prisma.beneficiario.createMany({
    data: [...bases].map((b) => ({
      numCpf: completaDv(b),
      nomeCompleto: `CURSOR ${b}`,
      dtNascimento: escolhe([19500101, 19850412, 19900101, 20100101]),
      sexo: "F",
      codRegiao: escolhe([1, 7, 11, 18, 22, 99]),
      codPrograma: escolhe(PROGRAMAS_SEED.map((p) => p.codPrograma)),
      dtCadastro: 20250101,
      sitBeneficiario: escolhe(["A", "A", "A", "A", "S", "C"]),
      vlrRendaFamiliar: escolhe([0, 30000, 50000, 120000, 999999, 1000000, 2000000]),
      numDependentes: escolhe([0, 1, 3]),
    })),
  });
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

async function rodar(quirks: QuirksMotor, loteLeitura?: number) {
  await prisma.pagamento.deleteMany();
  const logs: string[] = [];
  const r = await ejecutarLotePagamentos({ dtHoje: DT_HOJE, agora: AGORA, db: prisma, log: (l) => logs.push(l), quirks, ...(loteLeitura ? { loteLeitura } : {}) });
  const pagamentos = await prisma.pagamento.findMany({ orderBy: { numPagamento: "asc" }, omit: { id: true } });
  return { r, logs, pagamentos };
}

describe("lote: leitura por cursor", () => {
  it("tamanho padrão = 500", () => {
    expect(LOTE_LEITURA_BENEFICIARIOS).toBe(500);
  });

  for (const [nome, quirks] of [
    ["legado (D17 arrasta)", { corrigidos: new Set() }],
    ["D17 corrigido", { corrigidos: new Set(["D17"]) }],
    ["todas as correções", { corrigidos: new Set(["D8", "D17"]) }],
  ] as [string, QuirksMotor][]) {
    it(`${nome}: tamanhos 1, 2, 3, 7 e 44 ≡ leitura única`, async () => {
      const referencia = await rodar(quirks);
      if (!referencia.r.ok) throw new Error(referencia.r.mensagem);
      expect(referencia.r.resumo.processados).toBe(50);
      expect(referencia.r.resumo.gerados).toBeGreaterThan(5);
      // Pagamentos em ordem de CPF (numeração crescente acompanha o CPF).
      const cpfs = referencia.pagamentos.map((p) => p.numCpf);
      expect(cpfs).toEqual([...cpfs].sort());
      for (const tamanho of [1, 2, 3, 7, 44]) {
        const outro = await rodar(quirks, tamanho);
        expect(outro, `tamanho ${tamanho}`).toEqual(referencia);
      }
    });
  }

  it("legado: o arrastre D17 muda o resultado (o cenário o exercita)", async () => {
    const legado = await rodar({ corrigidos: new Set() }, 1);
    const d17 = await rodar({ corrigidos: new Set(["D17"]) }, 1);
    expect(legado.pagamentos.map((p) => p.vlrBruto)).not.toEqual(d17.pagamentos.map((p) => p.vlrBruto));
  });

  it("tamanho inválido → erro antes de qualquer acesso à base", async () => {
    const acessos: PropertyKey[] = [];
    const semBase = new Proxy(prisma, {
      get(_alvo, prop) {
        acessos.push(prop);
        throw new Error("acesso à base");
      },
    });
    for (const loteLeitura of [0, -1, 1.5, Number.NaN]) {
      await expect(ejecutarLotePagamentos({ dtHoje: DT_HOJE, agora: AGORA, db: semBase, log: () => {}, loteLeitura })).rejects.toThrow("tamanho de leitura inválido");
    }
    expect(acessos).toEqual([]);
  });
});

/** Cliente que delega em `prisma`, com `beneficiario.findMany` interceptado (n = nº da leitura). */
function comLeitura(interceptar: (n: number, real: () => Promise<unknown>) => Promise<unknown>): PrismaClient {
  let n = 0;
  const beneficiario = new Proxy(prisma.beneficiario, {
    get(alvo, prop, receptor) {
      if (prop === "findMany") {
        return (args: Parameters<PrismaClient["beneficiario"]["findMany"]>[0]) => interceptar(++n, () => prisma.beneficiario.findMany(args));
      }
      return Reflect.get(alvo, prop, receptor);
    },
  });
  return new Proxy(prisma, {
    get(alvo, prop, receptor) {
      return prop === "beneficiario" ? beneficiario : Reflect.get(alvo, prop, receptor);
    },
  });
}

describe("lote: leitura por cursor — falhas e inclusões durante a corrida", () => {
  it("falha na 2.ª leitura → interrompe com resumo parcial, mensagem com o último CPF lido (mascarado), log só nome/código", async () => {
    await prisma.pagamento.deleteMany();
    const primeiros = await prisma.beneficiario.findMany({ orderBy: { numCpf: "asc" }, take: 7, select: { numCpf: true } });
    const ultimoLido = primeiros[6]?.numCpf ?? "";
    const db = comLeitura(async (n, real) => {
      if (n === 2) throw Object.assign(new Error(`falha lendo numCpf > ${ultimoLido}`), { name: "PrismaClientKnownRequestError", code: "P1001" });
      return real();
    });
    const logs: string[] = [];
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await ejecutarLotePagamentos({ dtHoje: DT_HOJE, agora: AGORA, db, log: (l) => logs.push(l), quirks: { corrigidos: new Set() }, loteLeitura: 7 });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.mensagem).toBe(`LOTE INTERROMPIDO: ERRO INESPERADO CPF=${mascaraCpfLista(ultimoLido)}`);
      expect(logs.at(-1)).toBe(r.mensagem);
      // Resumo parcial: os 7 da primeira leitura processados; os pagamentos gerados ficam gravados.
      expect(r.resumo?.processados).toBe(7);
      expect(await prisma.pagamento.count({ where: { anoMesRef: 202603 } })).toBe(r.resumo?.gerados);
      expect(erro).toHaveBeenCalledWith("[lote] erro inesperado:", "PrismaClientKnownRequestError", "P1001");
      expect(JSON.stringify(erro.mock.calls)).not.toContain(ultimoLido);
    } finally {
      erro.mockRestore();
    }
  });

  it("falha na 1.ª leitura (antes do recorrido) → propaga, como a leitura única anterior", async () => {
    const db = comLeitura(async () => {
      throw new Error("base indisponível");
    });
    await expect(ejecutarLotePagamentos({ dtHoje: DT_HOJE, agora: AGORA, db, log: () => {} })).rejects.toThrow("base indisponível");
  });

  it("beneficiário incluído durante a corrida com CPF maior que o último lido → também é processado (como o READ do legado)", async () => {
    await prisma.pagamento.deleteMany();
    const novo = completaDv("999999990");
    await prisma.beneficiario.deleteMany({ where: { numCpf: novo } });
    const total = await prisma.beneficiario.count();
    const db = comLeitura(async (n, real) => {
      const lote = await real();
      if (n === 1) {
        await prisma.beneficiario.create({
          data: { numCpf: novo, nomeCompleto: "INCLUIDO DURANTE", dtNascimento: 19850412, sexo: "F", codRegiao: 1, codPrograma: "PA01", dtCadastro: 20250101, sitBeneficiario: "A", vlrRendaFamiliar: 120000 },
        });
      }
      return lote;
    });
    try {
      const r = await ejecutarLotePagamentos({ dtHoje: DT_HOJE, agora: AGORA, db, log: () => {}, loteLeitura: 5 });
      if (!r.ok) throw new Error(r.mensagem);
      expect(r.resumo.processados).toBe(total + 1);
      expect(await prisma.pagamento.count({ where: { numCpf: novo, anoMesRef: 202603 } })).toBe(1);
    } finally {
      await prisma.pagamento.deleteMany({ where: { numCpf: novo } });
      await prisma.beneficiario.deleteMany({ where: { numCpf: novo } });
    }
  });
});
