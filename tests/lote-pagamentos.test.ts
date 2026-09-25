import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { executarLoteAction } from "@/app/lote/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { calcular } from "@/domain/calculo/motor";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { ejecutarLotePagamentos, situacaoLote } from "@/server/lotePagamentos";
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

function lote(dtHoje: number, extra: { log?: (l: string) => void } = {}) {
  return ejecutarLotePagamentos({ dtHoje, agora: AGORA, db: prisma, log: extra.log ?? semLog });
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
