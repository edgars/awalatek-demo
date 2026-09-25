import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alterarBeneficiarioAction, buscarBeneficiariosAction } from "@/app/beneficiarios/actions";
import BeneficiariosPage from "@/app/beneficiarios/page";
import { verificarElegibilidadeAction } from "@/app/elegibilidade/actions";
import { filtrarPagamentosAction } from "@/app/pagamentos/actions";
import { cpfDoFiltro } from "@/app/pagamentos/filtros";
import type { PrismaClient } from "@/generated/prisma/client";
import { alteracaoBeneficiarioSchema, inclusaoBeneficiarioSchema } from "@/domain/beneficiario/cadastro";
import { completaDv } from "@/domain/cpf";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import {
  alterarBeneficiario,
  chavePorCpf,
  cpfPorChave,
  incluirBeneficiario,
  listarBeneficiarios,
  resolverChavePorCpf,
  resolverCpfPorChave,
} from "@/server/beneficiarios";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// redirect() do Next lança um erro de controle; aqui só registra o destino.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

// Casos de uso de beneficiários (story 2.1) contra uma base SQLite temporária.

let dir: string;
let prisma: PrismaClient;
const CPFS_SEED = BENEFICIARIOS_SEED.map((b) => cpfComDv(b.base));
const CPF_S0 = cpfComDv(BENEFICIARIOS_SEED[0].base);
const CPF_S1 = cpfComDv(BENEFICIARIOS_SEED[1].base);
const CPF_NOVO = completaDv("987654321");
const CPF_NOVO2 = completaDv("876543210");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-benef-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pelas Server Actions) aponta para a mesma base.
  process.env.DATABASE_URL = url;
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_USER", "SIFAPUSR");
  // limpeza do teste: base = seed (5 beneficiários)
  await prisma.beneficiario.deleteMany({ where: { numCpf: { notIn: CPFS_SEED } } });
  await seed(prisma);
});

const form = (over: Record<string, string> = {}) => ({
  numCpf: CPF_NOVO,
  nomeCompleto: "Beatriz Nova Teste",
  dtNascimento: "19850412",
  sexo: "F",
  logradouro: "RUA A, 10",
  municipio: "CAMPINAS",
  uf: "SP",
  cep: "13010-000",
  telFixo: "1933334444",
  rgNumero: "123456789",
  codPrograma: "PA01",
  vlrRendaFamiliar: "80000",
  numDependentes: "0",
  codRegiao: "1",
  nis: "",
  ...over,
});
const inclusao = (over: Record<string, string> = {}) => inclusaoBeneficiarioSchema.parse(form(over));

async function formAlteracao(numCpf: string, over: Record<string, string> = {}) {
  const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf } });
  return alteracaoBeneficiarioSchema.parse({
    numCpf,
    nomeCompleto: b.nomeCompleto,
    dtNascimento: String(b.dtNascimento),
    sexo: b.sexo,
    logradouro: b.logradouro ?? "",
    municipio: b.municipio ?? "",
    uf: b.uf ?? "",
    cep: b.cep ? String(b.cep) : "",
    telFixo: b.telFixo ?? "",
    rgNumero: b.rgNumero ?? "",
    codPrograma: b.codPrograma,
    vlrRendaFamiliar: String(b.vlrRendaFamiliar),
    numDependentes: String(b.numDependentes),
    codRegiao: String(b.codRegiao),
    nis: b.nis ?? "",
    sitBeneficiario: b.sitBeneficiario,
    numVersao: String(b.numVersao),
    ...over,
  });
}

describe("incluirBeneficiario", () => {
  it("inclusão válida: status A, dtCadastro = dtUltAlteracao = hoje, usuário", async () => {
    const r = await incluirBeneficiario(inclusao(), prisma);
    expect(r).toMatchObject({ ok: true, mensagem: "BENEFICIARIO INCLUIDO COM SUCESSO", status: "A", suspensoPorIdade: false });
    const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_NOVO } });
    const { data } = hoje();
    expect(b).toMatchObject({
      nomeCompleto: "BEATRIZ NOVA TESTE",
      sitBeneficiario: "A",
      dtCadastro: data,
      dtUltAlteracao: data,
      dtInclusao: data,
      usrInclusao: "SIFAPUSR",
      usrUltAlteracao: "SIFAPUSR",
      cep: 13010000,
      nis: null,
      numVersao: 1,
    });
  });

  it("não registra auditoria (CADBENEF não audita)", async () => {
    await incluirBeneficiario(inclusao(), prisma);
    expect(await prisma.auditoria.count()).toBe(0);
  });

  it("CPF duplicado (seed) → BENEFICIARIO JA CADASTRADO, nada gravado", async () => {
    const antes = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } });
    const r = await incluirBeneficiario(inclusao({ numCpf: CPF_S0 }), prisma);
    expect(r).toEqual({ ok: false, mensagem: "BENEFICIARIO JA CADASTRADO" });
    expect(await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).toEqual(antes);
  });

  it("primeiro erro ganha: CPF vazio e nome vazio → só CPF OBRIGATORIO", async () => {
    const antes = await prisma.beneficiario.count();
    expect(await incluirBeneficiario(inclusao({ numCpf: "", nomeCompleto: "" }), prisma)).toEqual({ ok: false, mensagem: "CPF OBRIGATORIO" });
    expect(await prisma.beneficiario.count()).toBe(antes);
  });

  it("CPF com DV inválido e sexo inválido → mensagens literais", async () => {
    expect(await incluirBeneficiario(inclusao({ numCpf: "01234567891" }), prisma)).toEqual({
      ok: false,
      mensagem: "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO",
    });
    expect(await incluirBeneficiario(inclusao({ sexo: "X" }), prisma)).toEqual({ ok: false, mensagem: "SEXO INVALIDO" });
    expect(await incluirBeneficiario(inclusao({ dtNascimento: "0" }), prisma)).toEqual({ ok: false, mensagem: "DATA NASCIMENTO OBRIGATORIA" });
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(0);
  });

  it("LEGACY-QUIRK(D5): nascido em 1940 → status S", async () => {
    const r = await incluirBeneficiario(inclusao({ dtNascimento: "19400101" }), prisma);
    expect(r).toMatchObject({ ok: true, mensagem: "BENEFICIARIO INCLUIDO COM SUCESSO", status: "S", suspensoPorIdade: true });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_NOVO } })).sitBeneficiario).toBe("S");
  });

  it("programa inexistente → PROGRAMA NAO ENCONTRADO, nada gravado", async () => {
    expect(await incluirBeneficiario(inclusao({ codPrograma: "ZZZZ" }), prisma)).toEqual({ ok: false, mensagem: "PROGRAMA NAO ENCONTRADO" });
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(0);
  });

  it("NIS vazio → NULL; dois beneficiários sem NIS convivem", async () => {
    expect((await incluirBeneficiario(inclusao(), prisma)).ok).toBe(true);
    expect((await incluirBeneficiario(inclusao({ numCpf: CPF_NOVO2 }), prisma)).ok).toBe(true);
    expect(await prisma.beneficiario.count({ where: { numCpf: { in: [CPF_NOVO, CPF_NOVO2] }, nis: null } })).toBe(2);
  });

  it("NIS duplicado → mensagem de erro, nada gravado", async () => {
    const r = await incluirBeneficiario(inclusao({ nis: "10000000001" }), prisma);
    expect(r).toEqual({ ok: false, mensagem: "NIS já cadastrado para outro beneficiário." });
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(0);
  });

  it("constraint unique de nis na base (não vazio)", async () => {
    await incluirBeneficiario(inclusao({ nis: "20000000001" }), prisma);
    await expect(
      prisma.beneficiario.update({ where: { numCpf: CPF_S1 }, data: { nis: "20000000001" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("alterarBeneficiario", () => {
  it("altera só os campos editáveis, incrementa a versão e dtUltAlteracao", async () => {
    await incluirBeneficiario(inclusao(), prisma);
    await prisma.beneficiario.update({ where: { numCpf: CPF_NOVO }, data: { dtUltAlteracao: 20250101, dtCadastro: 20250101 } });
    const r = await alterarBeneficiario(
      await formAlteracao(CPF_NOVO, { nomeCompleto: "Beatriz Alterada", municipio: "SANTOS", sitBeneficiario: "C", vlrRendaFamiliar: "1" }),
      prisma,
    );
    expect(r).toMatchObject({ ok: true, mensagem: "BENEFICIARIO ALTERADO COM SUCESSO", status: "C", numVersao: 2 });
    const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_NOVO } });
    expect(b).toMatchObject({
      nomeCompleto: "BEATRIZ ALTERADA",
      municipio: "SANTOS",
      sitBeneficiario: "C",
      vlrRendaFamiliar: 1,
      numVersao: 2,
      dtCadastro: 20250101,
      dtUltAlteracao: hoje().data,
    });
  });

  it("CPF não cadastrado → BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO", async () => {
    const dados = { ...(await formAlteracao(CPF_S0)), numCpf: CPF_NOVO };
    expect(await alterarBeneficiario(dados, prisma)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO" });
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(0);
  });

  it("LEGACY-QUIRK(D5): beneficiário de 80 anos com status A fica S", async () => {
    const anoNasc = Math.trunc(hoje().data / 10000) - 80;
    await prisma.beneficiario.update({ where: { numCpf: CPF_S0 }, data: { dtNascimento: anoNasc * 10000 + 101, sitBeneficiario: "A" } });
    const r = await alterarBeneficiario(await formAlteracao(CPF_S0, { sitBeneficiario: "A" }), prisma);
    expect(r).toMatchObject({ ok: true, mensagem: "BENEFICIARIO ALTERADO COM SUCESSO", status: "S", suspensoPorIdade: true });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).sitBeneficiario).toBe("S");
  });

  it("campo imutável alterado → erro, nada gravado", async () => {
    const antes = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } });
    for (const over of <Record<string, string>[]>[{ dtNascimento: "19850413" }, { sexo: "M" }, { codPrograma: "PP01" }, { codRegiao: "2" }, { nis: "" }]) {
      const r = await alterarBeneficiario(await formAlteracao(CPF_S0, { nomeCompleto: "OUTRO NOME", ...over }), prisma);
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(/^Campo não editável na alteração:/);
    }
    expect(await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).toEqual(antes);
  });

  it("versão desatualizada → erro de concorrência, nada gravado", async () => {
    const dados = await formAlteracao(CPF_S0, { nomeCompleto: "PRIMEIRA" });
    expect((await alterarBeneficiario(dados, prisma)).ok).toBe(true);
    const r = await alterarBeneficiario({ ...dados, nomeCompleto: "SEGUNDA" }, prisma);
    expect(r).toEqual({ ok: false, mensagem: "O beneficiário foi alterado por outra operação. Recarregue a página e tente novamente." });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).nomeCompleto).toBe("PRIMEIRA");
  });

  it("validação legada precede a busca: nome vazio → NOME OBRIGATORIO", async () => {
    expect(await alterarBeneficiario(await formAlteracao(CPF_S0, { nomeCompleto: "" }), prisma)).toEqual({
      ok: false,
      mensagem: "NOME OBRIGATORIO",
    });
  });
});

describe("listarBeneficiarios", () => {
  it("busca por nome (sem distinguir maiúsculas) ou CPF", async () => {
    expect((await listarBeneficiarios({ q: "silva" }, prisma)).itens.map((b) => b.nomeCompleto)).toEqual(["MARIA APARECIDA DA SILVA"]);
    const cpf = CPF_S1;
    expect((await listarBeneficiarios({ q: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` }, prisma)).itens.map((b) => b.numCpf)).toEqual([cpf]);
    expect((await listarBeneficiarios({ q: cpf }, prisma)).itens.map((b) => b.numCpf)).toEqual([cpf]);
    expect((await listarBeneficiarios({ q: "ninguem-assim" }, prisma)).total).toBe(0);
  });

  it("CPF parcial não busca por CPF (evita enumeração com a máscara da lista)", async () => {
    expect((await listarBeneficiarios({ q: CPF_S1.slice(0, 10) }, prisma)).total).toBe(0);
    expect((await listarBeneficiarios({ q: CPF_S1.slice(6) }, prisma)).total).toBe(0);
    expect((await listarBeneficiarios({ q: "123" }, prisma)).total).toBe(0);
  });

  it("pagina de 10 em 10", async () => {
    for (let i = 0; i < 7; i++) {
      await incluirBeneficiario(inclusao({ numCpf: completaDv(`90000000${i}`), nomeCompleto: `ZE ${i}` }), prisma);
    }
    const p1 = await listarBeneficiarios({ pagina: 1 }, prisma);
    expect(p1).toMatchObject({ total: 12, totalPaginas: 2, pagina: 1 });
    expect(p1.itens).toHaveLength(10);
    expect((await listarBeneficiarios({ pagina: 2 }, prisma)).itens).toHaveLength(2);
    expect((await listarBeneficiarios({ pagina: 99 }, prisma)).pagina).toBe(2);
  });
});

describe("alterarBeneficiarioAction", () => {
  it("CPF do formulário diferente do beneficiário da rota → recusado, nada gravado", async () => {
    const antesA = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } });
    const antesB = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S1 } });
    const fd = new FormData();
    const campos: Record<string, string> = {
      numCpf: CPF_S1,
      nomeCompleto: "INVASOR",
      dtNascimento: String(antesB.dtNascimento),
      sexo: antesB.sexo,
      codPrograma: antesB.codPrograma,
      codRegiao: String(antesB.codRegiao),
      nis: antesB.nis ?? "",
      vlrRendaFamiliar: "1",
      numDependentes: "0",
      sitBeneficiario: "A",
      numVersao: String(antesB.numVersao),
    };
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    // H2: a rota leva a chave opaca de S0; o formulário tenta trocar para o CPF de S1.
    const chaveS0 = (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 }, select: { chavePublica: true } })).chavePublica;
    const r = await alterarBeneficiarioAction(chaveS0, null, fd);
    expect(r?.ok).toBe(false);
    expect(r?.erros?.numCpf).toBeTruthy();
    expect(await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).toEqual(antesA);
    expect(await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S1 } })).toEqual(antesB);
  });
});

// H2 (LGPD): o CPF nunca vai para a URL — rotas e filtros usam a chave opaca.
describe("H2 — chave opaca nas URLs", () => {
  const chaveDe = async (cpf: string) =>
    (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } })).chavePublica;
  const destino = async (p: Promise<void>) => {
    const e = await p.then(
      () => null,
      (err: unknown) => err as { url?: string },
    );
    return e?.url ?? null;
  };
  const dados = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const semCpf = (url: string | null, cpf: string) => {
    expect(url).not.toBeNull();
    expect(url).not.toContain(cpf);
    expect(url).not.toMatch(/\d{11}/);
  };

  it("busca da lista por CPF (com ou sem máscara) → ?benef=<chave>", async () => {
    const chave = await chaveDe(CPF_S1);
    for (const q of [CPF_S1, `${CPF_S1.slice(0, 3)}.${CPF_S1.slice(3, 6)}.${CPF_S1.slice(6, 9)}-${CPF_S1.slice(9)}`]) {
      const url = await destino(buscarBeneficiariosAction(dados({ q })));
      semCpf(url, CPF_S1);
      expect(url).toBe(`/beneficiarios?benef=${chave}`);
    }
  });

  it("busca por CPF inexistente → ?benef=nao-encontrado; por nome → ?q=; vazia → lista", async () => {
    const url = await destino(buscarBeneficiariosAction(dados({ q: CPF_NOVO })));
    semCpf(url, CPF_NOVO);
    expect(url).toBe("/beneficiarios?benef=nao-encontrado");
    expect(await destino(buscarBeneficiariosAction(dados({ q: " maria " })))).toBe("/beneficiarios?q=maria");
    expect(await destino(buscarBeneficiariosAction(dados({ q: "" })))).toBe("/beneficiarios");
  });

  it("filtro de pagamentos: CPF → ?benef=<chave>; incompleto/inexistente → marcadores; demais filtros mantidos", async () => {
    const chave = await chaveDe(CPF_S0);
    const url = await destino(filtrarPagamentosAction(dados({ cpf: CPF_S0, competencia: "1990-01", programa: "", situacao: "G" })));
    semCpf(url, CPF_S0);
    expect(url).toBe(`/pagamentos?benef=${chave}&competencia=1990-01&situacao=G`);
    expect(await destino(filtrarPagamentosAction(dados({ cpf: "012345" })))).toBe("/pagamentos?benef=cpf-incompleto");
    expect(await destino(filtrarPagamentosAction(dados({ cpf: CPF_NOVO })))).toBe("/pagamentos?benef=nao-encontrado");
    expect(await destino(filtrarPagamentosAction(dados({ cpf: "", competencia: "" })))).toBe("/pagamentos");
  });

  it("alteração com chave inexistente ou com o CPF no lugar da chave → não encontrado, nada gravado", async () => {
    const antes = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } });
    for (const chave of [CPF_S0, "00000000-0000-4000-8000-000000000000"]) {
      const r = await alterarBeneficiarioAction(chave, null, dados({ numCpf: CPF_S0, nomeCompleto: "OUTRO NOME" }));
      expect(r).toMatchObject({ ok: false, mensagens: ["BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO"] });
    }
    expect(await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_S0 } })).toEqual(antes);
  });
});

describe("H2 — resolução da chave opaca", () => {
  const chaveDe = async (cpf: string) =>
    (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } })).chavePublica;
  const INEXISTENTE = "00000000-0000-4000-8000-000000000000";

  it("cpfPorChave: válida → CPF; malformada, maiúsculas, CPF no lugar da chave ou inexistente → null", async () => {
    const chave = await chaveDe(CPF_S0);
    expect(await cpfPorChave(chave, prisma)).toBe(CPF_S0);
    for (const c of ["", "123", chave.toUpperCase(), CPF_S0, INEXISTENTE, `${chave} `, `${chave}0`]) {
      expect(await cpfPorChave(c, prisma), c).toBeNull();
    }
  });

  it("chavePorCpf: CPF existente → chave; malformado ou inexistente → null", async () => {
    expect(await chavePorCpf(CPF_S1, prisma)).toBe(await chaveDe(CPF_S1));
    for (const c of ["", "123", "123.456.780-62", CPF_NOVO, await chaveDe(CPF_S1)]) expect(await chavePorCpf(c, prisma), c).toBeNull();
  });

  it("incluir/alterar devolvem a chave gravada (sem releitura após o sucesso)", async () => {
    const r = await incluirBeneficiario(inclusao(), prisma);
    const chave = await chaveDe(CPF_NOVO);
    expect(r).toMatchObject({ ok: true, chavePublica: chave });
    const a = await alterarBeneficiario(await formAlteracao(CPF_NOVO, { municipio: "SANTOS" }), prisma);
    expect(a).toMatchObject({ ok: true, chavePublica: chave });
  });

  it("falha da base: resolvedores nunca lançam e o log não leva chave nem CPF", async () => {
    const chave = await chaveDe(CPF_S0);
    const busca = vi.spyOn(prisma.beneficiario, "findUnique").mockRejectedValue(new Error(`falha ${chave} ${CPF_S0}`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await resolverCpfPorChave(chave, "teste", prisma)).toEqual({ ok: false });
      expect(await resolverChavePorCpf(CPF_S0, "teste", prisma)).toEqual({ ok: false });
      expect(await cpfDoFiltro(chave, prisma)).toEqual({ tipo: "erro" });
      expect(log).toHaveBeenCalledWith("[beneficiarios] teste:", "Error", "");
      expect(JSON.stringify(log.mock.calls)).not.toContain(chave);
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_S0);
    } finally {
      busca.mockRestore();
      log.mockRestore();
    }
  });

  it("cpfDoFiltro: sem filtro, incompleto, erro, inexistente e CPF", async () => {
    expect(await cpfDoFiltro("", prisma)).toEqual({ tipo: "semFiltro" });
    expect(await cpfDoFiltro("cpf-incompleto", prisma)).toEqual({ tipo: "incompleto" });
    expect(await cpfDoFiltro("erro", prisma)).toEqual({ tipo: "erro" });
    for (const b of ["nao-encontrado", INEXISTENTE, CPF_S0]) expect(await cpfDoFiltro(b, prisma), b).toEqual({ tipo: "inexistente" });
    expect(await cpfDoFiltro(await chaveDe(CPF_S0), prisma)).toEqual({ tipo: "cpf", cpf: CPF_S0 });
  });
});

describe("H2 — ações e páginas com a chave (singleton @/server/db)", () => {
  const chaveDe = async (cpf: string) =>
    (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } })).chavePublica;
  const ERRO = "Erro inesperado ao processar a solicitação. Tente novamente.";
  const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
  const dados = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const destino = async (p: Promise<unknown>) => (await p.then(() => null, (e: { url?: string }) => e))?.url ?? null;
  /** Força falha na base usada pelas ações/páginas (singleton global). */
  async function comFalhaNaBase(f: () => Promise<void>) {
    await listarBeneficiarios({}); // garante o singleton criado
    const cliente = globalPrisma.prisma!;
    const busca = vi.spyOn(cliente.beneficiario, "findUnique").mockRejectedValue(new Error(`falha ${CPF_S0}`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await f();
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_S0);
    } finally {
      busca.mockRestore();
      log.mockRestore();
    }
  }

  it("GET /beneficiarios?q=<CPF> (com ou sem máscara) não busca nem ecoa: redireciona para ?benef=", async () => {
    const chave = await chaveDe(CPF_S1);
    const f = `${CPF_S1.slice(0, 3)}.${CPF_S1.slice(3, 6)}.${CPF_S1.slice(6, 9)}-${CPF_S1.slice(9)}`;
    for (const q of [CPF_S1, f, ` ${f} `]) {
      expect(await destino(BeneficiariosPage({ searchParams: Promise.resolve({ q }) }))).toBe(`/beneficiarios?benef=${chave}`);
    }
    expect(await destino(BeneficiariosPage({ searchParams: Promise.resolve({ q: CPF_NOVO, pagina: "2" }) }))).toBe(
      "/beneficiarios?benef=nao-encontrado",
    );
    // Nome (ou dígitos parciais) continua em ?q=: a página renderiza sem redirecionar.
    expect(await destino(BeneficiariosPage({ searchParams: Promise.resolve({ q: "maria" }) }))).toBeNull();
  });

  it("falha da base na busca/filtro → ?benef=erro (nunca o error boundary, nunca o CPF)", async () => {
    await comFalhaNaBase(async () => {
      expect(await destino(buscarBeneficiariosAction(dados({ q: CPF_S0 })))).toBe("/beneficiarios?benef=erro");
      expect(await destino(BeneficiariosPage({ searchParams: Promise.resolve({ q: CPF_S0 }) }))).toBe("/beneficiarios?benef=erro");
      expect(await destino(filtrarPagamentosAction(dados({ cpf: CPF_S0 })))).toBe("/pagamentos?benef=erro");
    });
  });

  it("falha da base ao resolver a chave na alteração → mensagem genérica", async () => {
    const chave = await chaveDe(CPF_S0);
    await comFalhaNaBase(async () => {
      expect(await alterarBeneficiarioAction(chave, null, dados({ numCpf: CPF_S0 }))).toEqual({ ok: false, mensagens: [ERRO] });
    });
  });

  it("filtro de pagamentos com o campo CPF vazio conserva o filtro vigente (campo oculto benef)", async () => {
    const chave = await chaveDe(CPF_S0);
    expect(await destino(filtrarPagamentosAction(dados({ cpf: "", benef: chave, competencia: "1990-02" })))).toBe(
      `/pagamentos?benef=${chave}&competencia=1990-02`,
    );
    // Um CPF digitado prevalece sobre o filtro vigente.
    expect(await destino(filtrarPagamentosAction(dados({ cpf: CPF_S1, benef: chave })))).toBe(`/pagamentos?benef=${await chaveDe(CPF_S1)}`);
  });

  it("elegibilidade pela chave (campo oculto): CPF resolvido no servidor; chave inexistente → BENEFICIARIO NAO ENCONTRADO", async () => {
    const ok = await verificarElegibilidadeAction(null, dados({ numCpf: "", benef: await chaveDe(CPF_S0), codPrograma: "PA01" }));
    expect(ok?.ok).toBe(true);
    expect(ok?.ok && ok.resultado.tipo).not.toBe("precondicao");
    const nao = await verificarElegibilidadeAction(null, dados({ numCpf: "", benef: "00000000-0000-4000-8000-000000000000", codPrograma: "PA01" }));
    expect(nao).toEqual({ ok: true, resultado: { tipo: "precondicao", mensagem: "BENEFICIARIO NAO ENCONTRADO" } });
  });
});
