import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { verificarElegibilidadeAction } from "@/app/elegibilidade/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { MENSAGENS_VALELEG as M } from "@/domain/elegibilidade";
import { createPrismaClient } from "@/server/db";
import { verificarElegibilidade } from "@/server/elegibilidade";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Story 3.1 — caso de uso e Server Action de /elegibilidade contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const ANO = 2026;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // A, 1985, renda 1.200,00, 1 dependente, NIS
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base); // S, 1970, renda 900,00, sem dependentes, sem NIS
const CPF_FRANCISCO = cpfComDv(BENEFICIARIOS_SEED[3].base); // I, região 99
const CPF_REG99_C = cpfComDv("567890124");
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-valeleg-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pela Server Action) é recriado apontando para esta base.
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  await seed(prisma);
  // Programa inativo e beneficiário da região 99 com status C (não existem no seed).
  await prisma.programaSocial.create({
    data: {
      codPrograma: "PI01",
      nomePrograma: "PROGRAMA INATIVO DE TESTE",
      tipoPrograma: "A",
      dtCriacao: 20200101,
      sitPrograma: "I",
      vlrBaseIndividual: 10000,
      fatorReajuste: "0.0000",
      fatorK: "1.000000",
    },
  });
  await prisma.beneficiario.create({
    data: {
      numCpf: CPF_REG99_C,
      nomeCompleto: "DIPLOMATA DE TESTE",
      dtNascimento: 20100101,
      sexo: "M",
      codRegiao: 99,
      codPrograma: "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: "C",
      vlrRendaFamiliar: 999999,
      documentosOk: "N",
    },
  });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("verificarElegibilidade", () => {
  it("beneficiário A do seed + programa compatível (PT01) → elegível", async () => {
    expect(await verificarElegibilidade(CPF_MARIA, "PT01", prisma, ANO)).toEqual({
      tipo: "avaliado",
      elegivel: true,
      mensagem: M.elegivel,
      motivos: [],
    });
  });

  it("status S, renda acima do teto, tipo P e código R → todos os motivos na ordem", async () => {
    expect(await verificarElegibilidade(CPF_JOSE, "PP01", prisma, ANO)).toEqual({
      tipo: "avaliado",
      elegivel: false,
      mensagem: M.naoElegivel,
      motivos: [M.suspenso, M.rendaAcimaTeto, M.previdenciarioIdade, M.nisNaoCadastrado],
    });
  });

  it("código RD sem NIS e sem dependentes → NIS NAO CADASTRADO e PROGRAMA REQUER DEPENDENTES", async () => {
    const r = await verificarElegibilidade(CPF_JOSE, "PA01", prisma, ANO);
    expect(r).toMatchObject({ tipo: "avaliado", elegivel: false });
    expect(r.tipo === "avaliado" && r.motivos).toEqual([M.suspenso, M.rendaAcimaTeto, M.assistencialRenda, M.nisNaoCadastrado, M.requerDependentes]);
  });

  it("região 99 (status I no seed e status C sem documentos) → REGIAO ESPECIAL", async () => {
    const esperado = { tipo: "regiaoEspecial", elegivel: true, mensagem: M.regiaoEspecial };
    expect(await verificarElegibilidade(CPF_FRANCISCO, "PP01", prisma, ANO)).toEqual(esperado);
    expect(await verificarElegibilidade(CPF_REG99_C, "PA01", prisma, ANO)).toEqual(esperado);
  });

  it("programa inativo → PROGRAMA INATIVO (mesmo na região 99)", async () => {
    const esperado = { tipo: "precondicao", mensagem: M.programaInativo };
    expect(await verificarElegibilidade(CPF_MARIA, "PI01", prisma, ANO)).toEqual(esperado);
    expect(await verificarElegibilidade(CPF_REG99_C, "PI01", prisma, ANO)).toEqual(esperado);
  });

  it("CPF ou programa inexistentes → mensagem da precondição (beneficiário primeiro)", async () => {
    expect(await verificarElegibilidade("15975348625", "PT01", prisma, ANO)).toEqual({ tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado });
    expect(await verificarElegibilidade("15975348625", "ZZ99", prisma, ANO)).toEqual({ tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado });
    expect(await verificarElegibilidade(CPF_MARIA, "ZZ99", prisma, ANO)).toEqual({ tipo: "precondicao", mensagem: M.programaNaoEncontrado });
    expect(await verificarElegibilidade(CPF_MARIA, "", prisma, ANO)).toEqual({ tipo: "precondicao", mensagem: M.programaNaoEncontrado });
    expect(await verificarElegibilidade("123", "PT01", prisma, ANO)).toEqual({ tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado });
  });

  it("código do programa sem distinção de maiúsculas e com espaços", async () => {
    expect(await verificarElegibilidade(CPF_MARIA, " pt01 ", prisma, ANO)).toMatchObject({ tipo: "avaliado", elegivel: true });
  });
});

describe("verificarElegibilidadeAction", () => {
  it("CPF com máscara + programa → resultado do domínio", async () => {
    const m = `${CPF_MARIA.slice(0, 3)}.${CPF_MARIA.slice(3, 6)}.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`;
    const r = await verificarElegibilidadeAction(null, form({ numCpf: m, codPrograma: "PT01" }));
    expect(r).toEqual({ ok: true, resultado: { tipo: "avaliado", elegivel: true, mensagem: M.elegivel, motivos: [] } });
  });

  it("CPF vazio → BENEFICIARIO NAO ENCONTRADO (#CPF = 0)", async () => {
    const r = await verificarElegibilidadeAction(null, form({ numCpf: "", codPrograma: "PT01" }));
    expect(r).toEqual({ ok: true, resultado: { tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado } });
  });

  it("campos ausentes no formulário → tratados como vazios", async () => {
    const r = await verificarElegibilidadeAction(null, new FormData());
    expect(r).toEqual({ ok: true, resultado: { tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado } });
  });

  it("não grava nada: contagens e versões iguais", async () => {
    const contagens = async () => ({
      beneficiarios: await prisma.beneficiario.count(),
      programas: await prisma.programaSocial.count(),
      auditoria: await prisma.auditoria.count(),
      versoes: await prisma.beneficiario.findMany({ select: { numVersao: true, dtUltAlteracao: true } }),
    });
    const antes = await contagens();
    await verificarElegibilidadeAction(null, form({ numCpf: CPF_JOSE, codPrograma: "PA01" }));
    await verificarElegibilidadeAction(null, form({ numCpf: CPF_FRANCISCO, codPrograma: "PP01" }));
    expect(await contagens()).toEqual(antes);
  });
});
