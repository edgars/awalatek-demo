import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executarLoteAction } from "@/app/lote/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { calcular } from "@/domain/calculo/motor";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { ehColisaoNumPagamento, ejecutarLotePagamentos, situacaoLote } from "@/server/lotePagamentos";
import { BENEFICIARIOS_SEED, cpfComDv, PROGRAMAS_SEED, seed } from "../prisma/seed";

// Story 4.2 — lote mensal (BATCHPGT) contra uma base SQLite temporária. Cada
// cenário usa uma competência própria (dtHoje injetada) para não depender dos outros.

let dir: string;
let url: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // único A do seed: PA01, região 1, 1 dep., renda 1.200,00, 1985
const PA01 = PROGRAMAS_SEED[0];
const AGORA = new Date("2026-09-24T15:30:00Z");
const TOTAL_SEED = BENEFICIARIOS_SEED.length;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const semLog = () => {};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-batchpgt-"));
  url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

// Modo legado explícito: un SIFAP_QUIRKS_CORRIGIDOS del .env/entorno del desarrollador
// no cambia estos tests (las correcciones tienen tests propios).
beforeEach(() => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
});

function lote(dtHoje: number, extra: { log?: (l: string) => void; db?: PrismaClient } = {}) {
  return ejecutarLotePagamentos({ dtHoje, agora: AGORA, db: extra.db ?? prisma, log: extra.log ?? semLog });
}

/** Cliente que delega em `prisma`, mas passa cada `$transaction` por `interceptar` (n = nº da chamada). */
function comTransacao(interceptar: (n: number, real: () => Promise<unknown>) => Promise<unknown>): PrismaClient {
  let n = 0;
  return new Proxy(prisma, {
    get(alvo, prop, receptor) {
      if (prop === "$transaction") {
        return (fn: Parameters<PrismaClient["$transaction"]>[0]) => interceptar(++n, () => prisma.$transaction(fn as never));
      }
      return Reflect.get(alvo, prop, receptor);
    },
  });
}

function entradaMaria(competencia: number) {
  return {
    vlrBase: PA01.vlrBaseIndividual,
    fatorReajuste: PA01.fatorReajuste,
    tipoPrograma: PA01.tipoPrograma,
    codRegiao: 1,
    numDependentes: 1,
    renda: 120000,
    dtNascimento: 19850412,
    competencia,
  };
}

async function novoBeneficiario(base9: string, dados: { codPrograma?: string; renda: number; sit?: string }) {
  const numCpf = completaDv(base9);
  await prisma.beneficiario.create({
    data: {
      numCpf,
      nomeCompleto: `LOTE TESTE ${base9}`,
      dtNascimento: 19900101,
      sexo: "F",
      codRegiao: 11,
      codPrograma: dados.codPrograma ?? "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: dados.sit ?? "A",
      vlrRendaFamiliar: dados.renda,
      numDependentes: 0,
    },
  });
  return numCpf;
}

describe("ejecutarLotePagamentos", () => {
  it("corrida normal (seed): 1 gerado, 4 ignorados; pagamento G/BATCH idêntico ao motor", async () => {
    const r = await lote(20260901);
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ competencia: 202609, processados: TOTAL_SEED, gerados: 1, ignorados: TOTAL_SEED - 1, erros: 0, mensagensErro: [] });

    const esperado = calcular(entradaMaria(202609));
    // Mesmo valor do cálculo individual (story 4.1): 122,20.
    expect(esperado.vlrBruto).toBe(12220);
    expect(r.resumo).toMatchObject({
      vlrTotalBruto: esperado.vlrBruto,
      vlrTotalDesconto: esperado.vlrDesc,
      vlrTotalLiquido: esperado.vlrLiq,
      vlrTotalAbono: esperado.vlrAbono,
    });

    const pagamentos = await prisma.pagamento.findMany({ where: { anoMesRef: 202609 } });
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0]).toMatchObject({
      numPagamento: 1,
      numCpf: CPF_MARIA,
      codPrograma: "PA01",
      vlrBruto: esperado.vlrBruto,
      vlrDescontoTotal: esperado.vlrDesc,
      vlrLiquido: esperado.vlrLiq,
      vlrAbono: 0,
      tipoPgto: "N",
      sitPagamento: "G",
      dtGeracao: 20260901,
      hrGeracao: hoje(AGORA).hora,
      usrInclusao: "BATCH",
    });
    // BATCHPGT não audita.
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("re-execução na mesma competência não duplica (todos ignorados)", async () => {
    const r = await lote(20260915);
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ competencia: 202609, processados: TOTAL_SEED, gerados: 0, ignorados: TOTAL_SEED, erros: 0, vlrTotalBruto: 0 });
    expect(r.resumo.ignoradosPorMotivo).toEqual({ CPF_REPETIDO: 0, NAO_ATIVO: TOTAL_SEED - 1, JA_GERADO: 1, PROGRAMA_INATIVO: 0 });
    expect(await prisma.pagamento.count({ where: { anoMesRef: 202609 } })).toBe(1);
  });

  it("dezembro → tipo D com 13º e abono do motor", async () => {
    const r = await lote(20261201);
    if (!r.ok) throw new Error(r.mensagem);
    const esperado = calcular(entradaMaria(202612));
    expect(esperado).toMatchObject({ tipoPgto: "D", vlr13: 20250, vlrAbono: 1833, vlrBruto: 34303 });
    expect(r.resumo).toMatchObject({ gerados: 1, vlrTotalBruto: 34303, vlrTotalAbono: 1833 });
    const p = await prisma.pagamento.findFirstOrThrow({ where: { anoMesRef: 202612 } });
    expect(p).toMatchObject({ tipoPgto: "D", vlrBruto: 34303, vlrAbono: 1833, numPagamento: 2 });
  });

  it("numeração: continua do maior NUM-PAGTO existente", async () => {
    await prisma.pagamento.create({
      data: { numPagamento: 500, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199001, vlrBruto: 1, vlrLiquido: 1, sitPagamento: "G", dtGeracao: 19900101, hrGeracao: 0 },
    });
    const r = await lote(20260101);
    if (!r.ok) throw new Error(r.mensagem);
    expect((await prisma.pagamento.findFirstOrThrow({ where: { anoMesRef: 202601 } })).numPagamento).toBe(501);
  });

  it("duas chamadas simultâneas → a segunda recebe 'Lote já em execução.'", async () => {
    const [a, b] = await Promise.all([lote(20261001), lote(20261001)]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, mensagem: "Lote já em execução." });
    // O cadeado é liberado ao terminar.
    const c = await lote(20261001);
    expect(c).toMatchObject({ ok: true, resumo: { gerados: 0 } });
    expect(await prisma.pagamento.count({ where: { anoMesRef: 202610 } })).toBe(1);
  });

  it("programa inativo → beneficiário ignorado", async () => {
    await prisma.programaSocial.update({ where: { codPrograma: "PA01" }, data: { sitPrograma: "I" } });
    try {
      const r = await lote(20261101);
      if (!r.ok) throw new Error(r.mensagem);
      expect(r.resumo).toMatchObject({ gerados: 0, ignorados: TOTAL_SEED, erros: 0 });
      expect(await prisma.pagamento.count({ where: { anoMesRef: 202611 } })).toBe(0);
    } finally {
      await prisma.programaSocial.update({ where: { codPrograma: "PA01" }, data: { sitPrograma: "A" } });
    }
  });

  it("D17: renda > 9.999,99 arrasta o fator de renda do último calculado", async () => {
    // Ordem por CPF: MARIA (0,55) → B1 renda 500,00 (0,85) → B2 renda 20.000,00 (arrasta 0,85).
    const b1 = await novoBeneficiario("500000001", { renda: 50000 });
    const b2 = await novoBeneficiario("500000002", { renda: 2000000 });
    expect(b1 < b2).toBe(true);
    try {
      const r = await lote(20260201);
      if (!r.ok) throw new Error(r.mensagem);
      expect(r.resumo).toMatchObject({ gerados: 3, erros: 0 });
      const entradaB = (renda: number) => ({ ...entradaMaria(202602), codRegiao: 11, numDependentes: 0, dtNascimento: 19900101, renda });
      const e1 = calcular(entradaB(50000));
      expect(e1.fatorRenda).toBe("0.8500");
      const comArrastre = calcular({ ...entradaB(2000000), fatorRendaAnterior: e1.fatorRenda });
      const semArrastre = calcular(entradaB(2000000));
      expect(semArrastre.vlrBruto).toBe(0);
      expect(comArrastre.vlrBruto).toBeGreaterThan(0);
      const p2 = await prisma.pagamento.findFirstOrThrow({ where: { numCpf: b2, anoMesRef: 202602 } });
      expect(p2.vlrBruto).toBe(comArrastre.vlrBruto);
      expect(p2.vlrLiquido).toBe(comArrastre.vlrLiq);
    } finally {
      await prisma.pagamento.deleteMany({ where: { numCpf: { in: [b1, b2] } } });
      await prisma.beneficiario.deleteMany({ where: { numCpf: { in: [b1, b2] } } });
    }
  });

  it("programa inexistente → erro registrado e o lote segue", async () => {
    // Beneficiario.codPrograma é FK: grava sem verificação de FK para simular o registro órfão do legado.
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    let orfao: string;
    try {
      orfao = await novoBeneficiario("000000001", { codPrograma: "ZZ99", renda: 50000 });
    } finally {
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    }
    expect(orfao < CPF_MARIA).toBe(true); // o erro ocorre antes de MARIA, que ainda é gerada
    const linhas: string[] = [];
    try {
      const r = await lote(20260301, { log: (l) => linhas.push(l) });
      if (!r.ok) throw new Error(r.mensagem);
      const msg = `ERRO: PROG NAO ENCONTRADO CPF=***.***.${orfao.slice(6, 9)}-${orfao.slice(9)} PROG=ZZ99`;
      expect(r.resumo).toMatchObject({ processados: TOTAL_SEED + 1, gerados: 1, ignorados: TOTAL_SEED - 1, erros: 1, mensagensErro: [msg] });
      expect(linhas).toEqual([msg]);
      expect(await prisma.pagamento.count({ where: { anoMesRef: 202603, numCpf: CPF_MARIA } })).toBe(1);
    } finally {
      await prisma.beneficiario.delete({ where: { numCpf: orfao } });
    }
  });
});

describe("falhas durante o lote", () => {
  it("erro inesperado no 2.º calculado → interrompe com resumo parcial; o 1.º pagamento fica gravado", async () => {
    // numDependentes negativo faz o motor lançar (dado corrompido): cai depois de MARIA na ordem de CPF.
    const cpf = await novoBeneficiario("500000003", { renda: 50000 });
    await prisma.beneficiario.update({ where: { numCpf: cpf }, data: { numDependentes: -1 } });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await lote(20260401);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.mensagem).toBe(`LOTE INTERROMPIDO: ERRO INESPERADO CPF=***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`);
      expect(r.resumo).toMatchObject({ competencia: 202604, processados: TOTAL_SEED + 1, gerados: 1, ignorados: TOTAL_SEED - 1, erros: 0, vlrTotalBruto: 12220 });
      expect(await prisma.pagamento.count({ where: { anoMesRef: 202604, numCpf: CPF_MARIA } })).toBe(1);
      expect(await prisma.pagamento.count({ where: { anoMesRef: 202604, numCpf: cpf } })).toBe(0);
      // Log só com tipo/código, sem CPF.
      expect(JSON.stringify(erro.mock.calls)).not.toContain(cpf);
    } finally {
      erro.mockRestore();
      await prisma.beneficiario.delete({ where: { numCpf: cpf } });
    }
  });

  it("colisão de numPagamento (P2002 real) → relê o máximo e grava com máx.+1", async () => {
    const maximo = (await prisma.pagamento.aggregate({ _max: { numPagamento: true } }))._max.numPagamento ?? 0;
    const conflito = maximo + 1;
    const db = comTransacao(async (n, real) => {
      // Antes da 1.ª transação (MARIA), outro escritor toma o número que o lote vai usar.
      if (n === 1) {
        await prisma.pagamento.create({
          data: { numPagamento: conflito, numCpf: CPF_MARIA, codPrograma: "PA01", anoMesRef: 199002, vlrBruto: 1, vlrLiquido: 1, sitPagamento: "G", dtGeracao: 19900201, hrGeracao: 0 },
        });
      }
      return real();
    });
    const r = await lote(20260501, { db });
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo.gerados).toBe(1);
    const p = await prisma.pagamento.findFirstOrThrow({ where: { anoMesRef: 202605, numCpf: CPF_MARIA } });
    expect(p.numPagamento).toBe(conflito + 1);
  });

  it("erro de banco não P2002 → não reintenta; interrompe com resumo parcial", async () => {
    const chamadas: number[] = [];
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const db = comTransacao((n) => {
        chamadas.push(n);
        return Promise.reject(Object.assign(new Error("fk"), { code: "P2003" }));
      });
      const r = await lote(20260601, { db });
      expect(r).toMatchObject({ ok: false, mensagem: "LOTE INTERROMPIDO: ERRO INESPERADO CPF=***.***.678-90", resumo: { processados: 1, gerados: 0 } });
      expect(chamadas).toEqual([1]);
    } finally {
      erro.mockRestore();
    }
  });

  it("P2002 em outro campo → não reintenta", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    let chamadas = 0;
    try {
      const db = comTransacao(() => {
        chamadas++;
        return Promise.reject({ code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields: ["nis"] } } } } });
      });
      const r = await lote(20260601, { db });
      expect(r.ok).toBe(false);
      expect(chamadas).toBe(1);
    } finally {
      erro.mockRestore();
    }
  });

  it("ehColisaoNumPagamento reconhece meta do driver adapter e meta.target", () => {
    const adapter = (fields: string[]) => ({ code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields } } } } });
    expect(ehColisaoNumPagamento(adapter(["numPagamento"]))).toBe(true);
    expect(ehColisaoNumPagamento({ code: "P2002", meta: { target: ["numPagamento"] } })).toBe(true);
    expect(ehColisaoNumPagamento({ code: "P2002", meta: { target: "Pagamento_numPagamento_key" } })).toBe(true);
    expect(ehColisaoNumPagamento(adapter(["numCpf"]))).toBe(false);
    expect(ehColisaoNumPagamento({ code: "P2002" })).toBe(false);
    expect(ehColisaoNumPagamento({ code: "P2003", meta: { target: ["numPagamento"] } })).toBe(false);
    expect(ehColisaoNumPagamento(null)).toBe(false);
  });
});

describe("situacaoLote / executarLoteAction", () => {
  it("competência atual e pagamentos existentes nela", async () => {
    const agora = new Date("2026-09-10T12:00:00Z");
    expect(await situacaoLote(prisma, agora)).toEqual({ competencia: 202609, pagamentosExistentes: 1, emExecucao: false });
  });

  it("action executa na competência do dia e devolve o resumo", async () => {
    const r = await executarLoteAction();
    expect(r).toMatchObject({ ok: true, resumo: { competencia: Math.trunc(hoje().data / 100), processados: TOTAL_SEED } });
  });
});
