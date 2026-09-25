import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calcularBeneficioAction } from "@/app/calculo/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { calcular } from "@/domain/calculo/motor";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { calcularBeneficioIndividual } from "@/server/calculo";
import { BENEFICIARIOS_SEED, cpfComDv, PROGRAMAS_SEED, seed } from "../prisma/seed";

// Story 4.1 — cálculo individual (CALCBENF) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // A, PA01 (tipo A), região 1, 1 dep., renda 1.200,00, 1985
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base); // S
const PA01 = PROGRAMAS_SEED[0];
const AGORA = new Date("2026-09-24T15:30:00Z");
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-calcbenf-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  process.env.DATABASE_URL = url;
  process.env.SIFAP_USER = "OPERADR1";
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  rmSync(dir, { recursive: true, force: true });
});

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

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("calcularBeneficioIndividual", () => {
  it("normal (202609) → pagamento G tipo N com os valores do motor", async () => {
    const esperado = calcular(entradaMaria(202609));
    const r = await calcularBeneficioIndividual(CPF_MARIA, 202609, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem).toBe("CALCULO REALIZADO COM SUCESSO");
    // 150,00 × 1,35 × 1,05 × 0,55 × 1,00 = 116,94 → × 1,045 = 122,20
    expect(r.resumo).toMatchObject({ numCpf: CPF_MARIA, competencia: 202609, vlrBruto: 12220, vlrDesconto: 0, vlrLiquido: 12220, tipoPgto: "N" });
    expect(r.resumo.vlrBruto).toBe(esperado.vlrBruto);

    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: r.resumo.numPagamento } });
    const { data, hora } = hoje(AGORA);
    expect(p).toMatchObject({
      numCpf: CPF_MARIA,
      codPrograma: "PA01",
      anoMesRef: 202609,
      vlrBruto: esperado.vlrBruto,
      vlrDescontoTotal: esperado.vlrDesc,
      vlrLiquido: esperado.vlrLiq,
      vlrAbono: esperado.vlrAbono,
      tipoPgto: "N",
      sitPagamento: "G",
      dtGeracao: data,
      hrGeracao: hora,
      usrInclusao: "OPERADR1",
    });
  });

  it("dezembro com programa A → tipo D, 13º e abono", async () => {
    const r = await calcularBeneficioIndividual(CPF_MARIA, 202612, prisma, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 13º = 150,00 × 1,35 × 1,00 = 202,50; abono = 122,20 × 0,15 = 18,33; bruto = 343,03 (≤ 500 → sem desconto)
    expect(r.resumo).toMatchObject({ tipoPgto: "D", vlr13: 20250, vlrAbono: 1833, vlrBruto: 34303, vlrDesconto: 0, vlrLiquido: 34303 });
    expect(r.resumo).toMatchObject({ vlrBruto: calcular(entradaMaria(202612)).vlrBruto });
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: r.resumo.numPagamento } });
    expect(p).toMatchObject({ tipoPgto: "D", vlrAbono: 1833, vlrBruto: 34303 });
  });

  it("numeração máx.+1 e mesma competência duas vezes → dois pagamentos (legado não impede)", async () => {
    const a = await calcularBeneficioIndividual(CPF_MARIA, 202610, prisma, AGORA);
    const b = await calcularBeneficioIndividual(CPF_MARIA, 202610, prisma, AGORA);
    if (!a.ok || !b.ok) throw new Error("esperado sucesso");
    expect(b.resumo.numPagamento).toBe(a.resumo.numPagamento + 1);
    expect(await prisma.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: 202610 } })).toBe(2);
  });

  it("D17: renda > 9.999,99 → fator de renda 0 no individual (sem arrastre)", async () => {
    await prisma.beneficiario.update({ where: { numCpf: CPF_MARIA }, data: { vlrRendaFamiliar: 1000000 } });
    try {
      const r = await calcularBeneficioIndividual(CPF_MARIA, 202609, prisma, AGORA);
      if (!r.ok) throw new Error(r.mensagem);
      expect(r.resumo).toMatchObject({ vlrBruto: 0, vlrLiquido: 0 });
    } finally {
      await prisma.beneficiario.update({ where: { numCpf: CPF_MARIA }, data: { vlrRendaFamiliar: 120000 } });
    }
  });

  it("falhas não gravam nada, na ordem do legado", async () => {
    const antes = await prisma.pagamento.count();
    expect(await calcularBeneficioIndividual(CPF_MARIA, 202613, prisma)).toEqual({ ok: false, mensagem: "COMPETENCIA INVALIDA" });
    expect(await calcularBeneficioIndividual("15975348625", 202609, prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
    // competência inválida antes do beneficiário inexistente
    expect(await calcularBeneficioIndividual("15975348625", 202600, prisma)).toEqual({ ok: false, mensagem: "COMPETENCIA INVALIDA" });
    expect(await calcularBeneficioIndividual(CPF_JOSE, 202609, prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ATIVO - STATUS: S" });
    expect(await prisma.pagamento.count()).toBe(antes);
  });
});

describe("calcularBeneficioAction", () => {
  it("entrada válida → resumo", async () => {
    const r = await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "202609" }));
    expect(r).toMatchObject({ ok: true, mensagem: "CALCULO REALIZADO COM SUCESSO", resumo: { vlrLiquido: 12220 } });
  });

  it("zod rejeita CPF e competência malformados", async () => {
    expect(await calcularBeneficioAction(null, form({ numCpf: "123", competencia: "202609" }))).toMatchObject({ ok: false });
    expect(await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "" }))).toEqual({
      ok: false,
      mensagem: "Informe a competência (mês/ano).",
    });
    expect(await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "invalido" }))).toMatchObject({ ok: false });
  });

  it("mês 13 → mensagem literal do legado", async () => {
    expect(await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "202613" }))).toEqual({
      ok: false,
      mensagem: "COMPETENCIA INVALIDA",
    });
  });
});
