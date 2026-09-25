import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { incluirDependenteAction } from "@/app/beneficiarios/[cpf]/dependentes/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { dependenteSchema, type DadosDependente } from "@/domain/beneficiario/dependentes";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";
import { incluirDependente, listarDependentes } from "@/server/dependentes";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Story 2.4 — casos de uso de dependentes (CADDEPEND) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const CPF_TITULAR = completaDv("555666777");
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const CPF_CANCELADO = cpfComDv(BENEFICIARIOS_SEED[2].base);
const CPF_DESLIGADO = cpfComDv(BENEFICIARIOS_SEED[4].base);
const CPF_DEP = completaDv("111222333");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-depend-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pela Server Action) é recriado apontando para esta base.
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

beforeEach(async () => {
  vi.stubEnv("SIFAP_USER", "SIFAPUSR");
  // limpeza do teste: titular próprio, recriado sem dependentes
  await prisma.beneficiario.deleteMany({ where: { numCpf: CPF_TITULAR } });
  await prisma.beneficiario.create({
    data: {
      numCpf: CPF_TITULAR,
      nomeCompleto: "TITULAR DE TESTE",
      dtNascimento: 19800101,
      sexo: "F",
      codRegiao: 1,
      codPrograma: "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: "A",
      vlrRendaFamiliar: 50000,
      numDependentes: 0,
      dtInclusao: 20250101,
      usrInclusao: "TESTE",
      dtUltAlteracao: 20250101,
      usrUltAlteracao: "TESTE",
    },
  });
});

const dep = (over: Partial<DadosDependente> = {}): DadosDependente => ({
  nomeDependente: "FILHO UM",
  dtNascDepend: 20150310,
  parentesco: "FI",
  cpfDependente: null,
  docDependente: null,
  sexoDependente: "M",
  ...over,
});

async function titular() {
  return prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_TITULAR }, include: { dependentes: { orderBy: { occurrence: "asc" } } } });
}

describe("incluirDependente", () => {
  it("inclui na ocorrência 1 e incrementa o contador na mesma operação", async () => {
    const r = await incluirDependente(CPF_TITULAR, dep());
    expect(r).toEqual({ ok: true, mensagens: ["DEPENDENTE INCLUIDO - TOTAL: 1"], total: 1, numCpf: CPF_TITULAR });
    const t = await titular();
    expect(t.numDependentes).toBe(1);
    expect(t.numVersao).toBe(2);
    expect(t.usrUltAlteracao).toBe("SIFAPUSR");
    expect(t.dependentes).toHaveLength(1);
    expect(t.dependentes[0]).toMatchObject({ occurrence: 1, nomeDependente: "FILHO UM", parentesco: "FI", cpfDependente: null, sexoDependente: "M" });
  });

  it("inclusão em série: segunda ocorrência e total 2", async () => {
    await incluirDependente(CPF_TITULAR, dep());
    const r = await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "CONJUGE", parentesco: "CO" }));
    expect(r.ok && r.mensagens).toEqual(["DEPENDENTE INCLUIDO - TOTAL: 2"]);
    const lista = await listarDependentes(CPF_TITULAR, prisma);
    expect(lista?.dependentes.map((d) => [d.occurrence, d.nomeDependente])).toEqual([
      [1, "FILHO UM"],
      [2, "CONJUGE"],
    ]);
  });

  it("titular inexistente → BENEFICIARIO NAO ENCONTRADO", async () => {
    expect(await incluirDependente(completaDv("999888777"), dep())).toEqual({ ok: false, mensagens: ["BENEFICIARIO NAO ENCONTRADO"] });
    expect(await incluirDependente("abc", dep())).toEqual({ ok: false, mensagens: ["BENEFICIARIO NAO ENCONTRADO"] });
  });

  it("titular C ou D → bloqueado, nada gravado", async () => {
    for (const cpf of [CPF_CANCELADO, CPF_DESLIGADO]) {
      expect(await incluirDependente(cpf, dep())).toEqual({
        ok: false,
        mensagens: ["BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO"],
      });
      const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, include: { dependentes: true } });
      expect(b.numDependentes).toBe(0);
      expect(b.dependentes).toHaveLength(0);
    }
  });

  it("D6: com 5 inclui o 6.º; com 6 rejeita o 7.º", async () => {
    for (let i = 1; i <= 5; i++) await incluirDependente(CPF_TITULAR, dep({ nomeDependente: `DEP ${i}` }));
    const sexto = await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "DEP 6" }));
    expect(sexto.ok && sexto.mensagens).toEqual(["DEPENDENTE INCLUIDO - TOTAL: 6"]);
    expect(await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "DEP 7" }))).toEqual({
      ok: false,
      mensagens: ["LIMITE DE DEPENDENTES ATINGIDO"],
    });
    const t = await titular();
    expect(t.numDependentes).toBe(6);
    expect(t.dependentes).toHaveLength(6);
  });

  it("dados inválidos → ambos os mensagens, nada gravado", async () => {
    expect(await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "", parentesco: "XX" }))).toEqual({
      ok: false,
      mensagens: ["NOME DO DEPENDENTE OBRIGATORIO", "PARENTESCO INVALIDO"],
    });
    const t = await titular();
    expect(t.numDependentes).toBe(0);
    expect(t.dependentes).toHaveLength(0);
  });

  it("CPF duplicado → nada gravado", async () => {
    await incluirDependente(CPF_TITULAR, dep({ cpfDependente: CPF_DEP }));
    expect(await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "OUTRO", cpfDependente: CPF_DEP }))).toEqual({
      ok: false,
      mensagens: ["DEPENDENTE JA CADASTRADO (CPF DUPLICADO)"],
    });
    expect((await titular()).numDependentes).toBe(1);
  });

  it("mesmo CPF de dependente em titulares diferentes é permitido", async () => {
    await incluirDependente(CPF_TITULAR, dep({ cpfDependente: CPF_DEP }));
    const maria = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_MARIA } });
    const r = await incluirDependente(CPF_MARIA, dep({ cpfDependente: CPF_DEP }));
    expect(r.ok).toBe(true);
    // limpeza do teste: restaura o seed de MARIA
    await prisma.beneficiarioDependente.deleteMany({ where: { beneficiarioId: maria.id, occurrence: { gt: 1 } } });
    await prisma.beneficiario.update({ where: { id: maria.id }, data: { numDependentes: 1 } });
  });

  it("dois dependentes sem CPF → ambos gravados com NULL", async () => {
    await incluirDependente(CPF_TITULAR, dep());
    const r = await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "FILHO DOIS" }));
    expect(r.ok).toBe(true);
    const t = await titular();
    expect(t.dependentes.map((d) => d.cpfDependente)).toEqual([null, null]);
  });

  it("contador defasado: numDependentes 0 com linha na ocorrência 1 → sobrescreve, total 1", async () => {
    const t0 = await titular();
    await prisma.beneficiarioDependente.create({
      data: { beneficiarioId: t0.id, occurrence: 1, nomeDependente: "ANTIGO", dtNascDepend: 0, parentesco: "OU", cpfDependente: CPF_DEP },
    });
    // O CPF da ocorrência além do contador não conta como duplicado (o legado só percorre 1..n).
    const r = await incluirDependente(CPF_TITULAR, dep({ nomeDependente: "NOVO", cpfDependente: CPF_DEP }));
    expect(r.ok && r.mensagens).toEqual(["DEPENDENTE INCLUIDO - TOTAL: 1"]);
    const t = await titular();
    expect(t.numDependentes).toBe(1);
    expect(t.dependentes).toHaveLength(1);
    expect(t.dependentes[0]).toMatchObject({ occurrence: 1, nomeDependente: "NOVO", parentesco: "FI" });
  });

  it("CPF igual ao de uma ocorrência acima do contador → unique decide como duplicado", async () => {
    const t0 = await titular();
    await prisma.beneficiarioDependente.create({
      data: { beneficiarioId: t0.id, occurrence: 3, nomeDependente: "ORFAO", dtNascDepend: 0, parentesco: "OU", cpfDependente: CPF_DEP },
    });
    expect(await incluirDependente(CPF_TITULAR, dep({ cpfDependente: CPF_DEP }))).toEqual({
      ok: false,
      mensagens: ["DEPENDENTE JA CADASTRADO (CPF DUPLICADO)"],
    });
    // Transação desfeita: contador intacto.
    expect((await titular()).numDependentes).toBe(0);
  });
});

describe("listarDependentes", () => {
  it("titular inexistente ou CPF mal formado → null", async () => {
    expect(await listarDependentes(completaDv("999888777"), prisma)).toBeNull();
    expect(await listarDependentes("123", prisma)).toBeNull();
  });

  it("só as ocorrências 1..numDependentes", async () => {
    const t0 = await titular();
    await prisma.beneficiarioDependente.create({
      data: { beneficiarioId: t0.id, occurrence: 2, nomeDependente: "FORA", dtNascDepend: 0, parentesco: "OU" },
    });
    await incluirDependente(CPF_TITULAR, dep());
    const r = await listarDependentes(CPF_TITULAR, prisma);
    expect(r?.titular.numDependentes).toBe(1);
    expect(r?.dependentes.map((d) => d.nomeDependente)).toEqual(["FILHO UM"]);
  });
});

describe("incluirDependenteAction", () => {
  const form = (campos: Record<string, string>) => {
    const f = new FormData();
    const base = { nomeDependente: "Filha Action", dtNascDepend: "20180101", parentesco: "FI", cpfDependente: "", docDependente: "", sexoDependente: "F" };
    for (const [k, v] of Object.entries({ ...base, ...campos })) f.set(k, v);
    return f;
  };

  it("sucesso: mensagem com o total", async () => {
    expect(await incluirDependenteAction(CPF_TITULAR, null, form({}))).toEqual({
      ok: true,
      mensagens: ["DEPENDENTE INCLUIDO - TOTAL: 1"],
      total: 1,
    });
    expect((await titular()).dependentes[0]?.nomeDependente).toBe("FILHA ACTION");
  });

  it("erros do legado ligados aos campos", async () => {
    const r = await incluirDependenteAction(CPF_TITULAR, null, form({ nomeDependente: "", parentesco: "XX" }));
    expect(r).toEqual({
      ok: false,
      mensagens: ["NOME DO DEPENDENTE OBRIGATORIO", "PARENTESCO INVALIDO"],
      erros: { nomeDependente: "NOME DO DEPENDENTE OBRIGATORIO", parentesco: "PARENTESCO INVALIDO" },
    });
  });

  it("zod: formato inválido não chega ao caso de uso", async () => {
    const r = await incluirDependenteAction(CPF_TITULAR, null, form({ sexoDependente: "X" }));
    expect(r).toEqual({ ok: false, mensagens: ["Sexo: informe M ou F"], erros: { sexoDependente: "Sexo: informe M ou F" } });
    expect((await titular()).numDependentes).toBe(0);
  });

  it("erro inesperado: mensagem genérica e log sem dados pessoais", async () => {
    vi.stubEnv("SIFAP_USER", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await incluirDependenteAction(CPF_TITULAR, null, form({}));
    expect(r).toEqual({ ok: false, mensagens: ["Erro inesperado ao processar a solicitação. Tente novamente."] });
    expect(log).toHaveBeenCalledWith("[dependentes] inclusão:", "Error", "");
    expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_TITULAR);
    log.mockRestore();
  });

  it("schema aplicado na borda (sanidade)", () => {
    expect(dependenteSchema.parse({ nomeDependente: "a", dtNascDepend: "", parentesco: "co", cpfDependente: "", docDependente: "", sexoDependente: "" }).parentesco).toBe("CO");
  });
});
