import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { carregarDoCadastroAction, validarCadastroAction } from "@/app/validacao/cadastro/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { entradaValbenefSchema } from "@/domain/beneficiario/validacao";
import { createPrismaClient } from "@/server/db";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Story 2.2 — Server Actions de /validacao/cadastro contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-valbenef-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pelas Server Actions) é recriado apontando para esta base.
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

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function contagens() {
  return {
    beneficiarios: await prisma.beneficiario.count(),
    auditoria: await prisma.auditoria.count(),
    versoes: (await prisma.beneficiario.findMany({ select: { numVersao: true } })).map((b) => b.numVersao),
  };
}

describe("carregar do cadastro", () => {
  it("beneficiário do seed → dados para preencher o formulário", async () => {
    const r = await carregarDoCadastroAction(CPF_MARIA);
    expect(r).toEqual({
      ok: true,
      dados: { numCpf: CPF_MARIA, nomeCompleto: "MARIA APARECIDA DA SILVA", dtNascimento: 19850412, uf: "SP", sitBeneficiario: "A" },
    });
  });

  it("aceita CPF com máscara", async () => {
    const m = `${CPF_MARIA.slice(0, 3)}.${CPF_MARIA.slice(3, 6)}.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`;
    expect((await carregarDoCadastroAction(m)).ok).toBe(true);
  });

  it("CPF inexistente → BENEFICIARIO NAO ENCONTRADO", async () => {
    expect(await carregarDoCadastroAction("15975348625")).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
  });

  it("CPF vazio ou com mais de 11 dígitos → erro sem consultar a base", async () => {
    const erro = { ok: false, mensagem: "Informe o CPF (até 11 dígitos) para carregar do cadastro." };
    expect(await carregarDoCadastroAction("")).toEqual(erro);
    expect(await carregarDoCadastroAction("abc")).toEqual(erro);
    expect(await carregarDoCadastroAction("123456789012")).toEqual(erro);
  });
});

describe("validar", () => {
  it("dados do seed → V", async () => {
    const r = await validarCadastroAction(
      null,
      form({ numCpf: CPF_MARIA, nomeCompleto: "MARIA APARECIDA DA SILVA", dtNascimento: "19850412", uf: "SP", sitBeneficiario: "A" }),
    );
    expect(r).toEqual({ ok: true, resultado: "V", erros: [] });
  });

  it("vários erros → I com a lista na ordem do legado", async () => {
    const r = await validarCadastroAction(
      null,
      form({ numCpf: "01234567891", nomeCompleto: "", dtNascimento: "invalido", uf: "XX", sitBeneficiario: "" }),
    );
    expect(r).toEqual({
      ok: true,
      resultado: "I",
      erros: [
        "CPF INVALIDO - DIGITO VERIFICADOR",
        "DATA NASCIMENTO INVALIDA",
        "NOME INVALIDO - DEVE TER NOME E SOBRENOME",
        "UF INVALIDA",
        "STATUS INVALIDO",
      ],
    });
  });

  it("não grava nada: contagens de beneficiários e auditoria e versões iguais", async () => {
    const antes = await contagens();
    await carregarDoCadastroAction(CPF_MARIA);
    await validarCadastroAction(null, form({ numCpf: CPF_MARIA, nomeCompleto: "X", dtNascimento: "0", uf: "", sitBeneficiario: "Z" }));
    await validarCadastroAction(null, form({ numCpf: "32165498791", nomeCompleto: "NOVO NOME", dtNascimento: "19900101", uf: "RJ", sitBeneficiario: "A" }));
    expect(await contagens()).toEqual(antes);
  });
});

describe("entradaValbenefSchema (borda)", () => {
  const p = (over: Record<string, string>) =>
    entradaValbenefSchema.parse({ numCpf: "", nomeCompleto: "", dtNascimento: "", uf: "", sitBeneficiario: "", ...over });

  it("CPF: só dígitos, zeros à esquerda; vazio = 0 (N11)", () => {
    expect(p({ numCpf: "012.345.678-90" }).numCpf).toBe("01234567890");
    expect(p({ numCpf: "123" }).numCpf).toBe("00000000123");
    expect(p({ numCpf: "" }).numCpf).toBe("00000000000");
    expect(p({ numCpf: "123456789012" }).numCpf).toBe("123456789012");
  });

  it("valores longos são truncados à largura do campo, sem rejeição", () => {
    const r = entradaValbenefSchema.safeParse({
      numCpf: "1".repeat(300),
      nomeCompleto: "A".repeat(300),
      dtNascimento: "9".repeat(300),
      uf: "SPXXXX",
      sitBeneficiario: "AXXXX",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ numCpf: "1".repeat(300), nomeCompleto: "A".repeat(60), dtNascimento: 0, uf: "SP", sitBeneficiario: "A" });
  });

  it("validação sempre roda e acumula mesmo com valores longos", async () => {
    const r = await validarCadastroAction(
      null,
      form({ numCpf: "9".repeat(300), nomeCompleto: "B".repeat(300), dtNascimento: "1".repeat(300), uf: "", sitBeneficiario: "" }),
    );
    expect(r).toEqual({
      ok: true,
      resultado: "I",
      erros: ["CPF INVALIDO - DIGITO VERIFICADOR", "DATA NASCIMENTO INVALIDA", "NOME INVALIDO - DEVE TER NOME E SOBRENOME", "STATUS INVALIDO"],
    });
  });

  it("data: AAAAMMDD numérico; vazio ou inválido → 0", () => {
    expect(p({ dtNascimento: "19850412" }).dtNascimento).toBe(19850412);
    expect(p({ dtNascimento: "" }).dtNascimento).toBe(0);
    expect(p({ dtNascimento: "invalido" }).dtNascimento).toBe(0);
  });
});
