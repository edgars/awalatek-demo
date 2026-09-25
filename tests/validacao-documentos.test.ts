import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validarDocumentosAction } from "@/app/validacao/documentos/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { seed } from "../prisma/seed";

// Story 2.3 — Server Action de /validacao/documentos: flag D4 lido do ambiente e
// nenhuma escrita na base (VALDOCS não grava nem audita).

let dir: string;
let prisma: PrismaClient;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-valdocs-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  process.env.DATABASE_URL = url;
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const ESPECIAL = { numCpf: "001.000.000-00", rg: "", tituloEleitor: "", ctps: "" };
const DOIS_ERROS = { ok: true, resultado: "I", erros: ["CPF INVALIDO", "RG INVALIDO OU FORMATO INCORRETO"], docEspecial: false };

describe("validarDocumentosAction", () => {
  it("documentos válidos → V", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    const r = await validarDocumentosAction(null, form({ numCpf: "01234567890", rg: "123456789", tituloEleitor: "", ctps: "" }));
    expect(r).toEqual({ ok: true, resultado: "V", erros: [], docEspecial: false });
  });

  it("CPF vazio e RG curto → 2 erros na ordem CPF, RG", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    expect(await validarDocumentosAction(null, form({ numCpf: "", rg: "1234", tituloEleitor: "", ctps: "" }))).toEqual(DOIS_ERROS);
  });

  it("D4 flag ausente → prefixo especial sem efeito", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", undefined);
    expect(await validarDocumentosAction(null, form(ESPECIAL))).toEqual(DOIS_ERROS);
  });

  it("D4 flag false → prefixo especial sem efeito", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    expect(await validarDocumentosAction(null, form(ESPECIAL))).toEqual(DOIS_ERROS);
  });

  it("D4 flag true → V, erros anulados, selo de documento especial", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "true");
    expect(await validarDocumentosAction(null, form(ESPECIAL))).toEqual({ ok: true, resultado: "V", erros: [], docEspecial: true });
  });

  it("flag com valor inválido → erro genérico, sem detalhes", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "talvez");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await validarDocumentosAction(null, form(ESPECIAL))).toEqual({
      ok: false,
      mensagem: "Erro inesperado ao processar a solicitação. Tente novamente.",
    });
    expect(spy).toHaveBeenCalledWith("[validacao-documentos] configuração inválida: LEGACY_DOC_ESPECIAL_ENABLED");
    spy.mockRestore();
  });

  it("valores longos são truncados e a validação roda", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    const r = await validarDocumentosAction(
      null,
      form({ numCpf: "01234567890", rg: "9".repeat(200), tituloEleitor: "T".repeat(200), ctps: "C".repeat(200) }),
    );
    expect(r).toEqual({ ok: true, resultado: "V", erros: [], docEspecial: false });
  });

  it("não grava nada: contagens de beneficiários e auditoria e versões iguais", async () => {
    const contagens = async () => ({
      beneficiarios: await prisma.beneficiario.count(),
      auditoria: await prisma.auditoria.count(),
      versoes: (await prisma.beneficiario.findMany({ select: { numVersao: true, documentosOk: true } })).map((b) => [b.numVersao, b.documentosOk]),
    });
    const antes = await contagens();
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "true");
    await validarDocumentosAction(null, form(ESPECIAL));
    await validarDocumentosAction(null, form({ numCpf: "01234567890", rg: "123456789", tituloEleitor: "", ctps: "" }));
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    await validarDocumentosAction(null, form({ numCpf: "01234567891", rg: "", tituloEleitor: "", ctps: "" }));
    expect(await contagens()).toEqual(antes);
  });
});
