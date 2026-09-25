import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { inclusaoBeneficiarioSchema } from "@/domain/beneficiario/cadastro";
import { completaDv } from "@/domain/cpf";
import { inclusaoProgramaSchema } from "@/domain/programa";
import { registrarEvento } from "@/server/auditoria";
import { incluirBeneficiario } from "@/server/beneficiarios";
import { conciliarRetorno } from "@/server/conciliacao";
import { createPrismaClient } from "@/server/db";
import { incluirDependente } from "@/server/dependentes";
import { incluirPrograma } from "@/server/programas";
import { camposViolados, ehColisaoNumAuditoria, vazioParaNull, violaUnico } from "@/server/unicidade";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";
import { arquivoRetorno } from "./fixtures/cnab240";

// H1 — integridade: restrições do esquema, P2002 em inclusões concorrentes, colisão de
// numAuditoria e colunas únicas nullable (vazio → NULL). Base SQLite temporária.

let dir: string;
let url: string;
let prisma: PrismaClient;
/** Segundo cliente (outra conexão) para inclusões simultâneas. */
let outro: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const CPFS_SEED = BENEFICIARIOS_SEED.map((b) => cpfComDv(b.base));
const CPF_NOVO = completaDv("987654321");
const CPF_TITULAR = completaDv("555666777");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-integr-"));
  url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  outro = createPrismaClient(url);
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await outro?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_USER", "SIFAPUSR");
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  await prisma.auditoria.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.beneficiario.deleteMany({ where: { numCpf: { notIn: CPFS_SEED } } });
  await prisma.programaSocial.deleteMany({ where: { codPrograma: { notIn: ["PA01", "PP01", "PT01"] } } });
  await seed(prisma);
});

const programa = (codPrograma: string) =>
  inclusaoProgramaSchema.parse({
    codPrograma,
    nomePrograma: "Programa de Integridade",
    tipoPrograma: "A",
    vlrBase: "15000",
    codElegibilidade: "",
    dtInicio: "20260101",
    dtFim: "0",
    rendaMaxima: "0",
    idadeMin: "0",
    idadeMax: "0",
    fatorReajuste: "0.0450",
  });

const beneficiario = (over: Record<string, string> = {}) =>
  inclusaoBeneficiarioSchema.parse({
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

/** Dados mínimos de um beneficiário gravado direto (sem regra de negócio). */
const benefDireto = (numCpf: string, extra: Partial<Prisma.BeneficiarioUncheckedCreateInput> = {}) => ({
  numCpf,
  nomeCompleto: "TESTE INTEGRIDADE",
  dtNascimento: 19800101,
  sexo: "F",
  codRegiao: 1,
  codPrograma: "PA01",
  dtCadastro: 20250101,
  sitBeneficiario: "A",
  vlrRendaFamiliar: 50000,
  ...extra,
});

const pgto = (numPagamento: number, numCpf = CPF_MARIA) => ({
  numPagamento,
  numCpf,
  codPrograma: "PA01",
  anoMesRef: 202601,
  vlrBruto: 100,
  vlrLiquido: 100,
  sitPagamento: "G",
  dtGeracao: 20260101,
  hrGeracao: 0,
});

const audit = (numAuditoria: number) => ({
  numAuditoria,
  dtEvento: 20260101,
  hrEvento: 0,
  codAcao: "IN",
  tipoEntidade: "TESTE",
  idEntidade: "1",
  usrEvento: "TESTE",
  desAcao: "TESTE",
});

/** Cliente que, só na 1.ª transação, faz `auditoria.aggregate` devolver um máximo defasado (leitura antiga). */
function comMaximoDefasado(): PrismaClient {
  let n = 0;
  return new Proxy(prisma, {
    get(alvo, prop, receptor) {
      if (prop !== "$transaction") return Reflect.get(alvo, prop, receptor);
      return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        const primeira = ++n === 1;
        return prisma.$transaction((tx) => {
          if (!primeira) return fn(tx);
          const auditoria = new Proxy(tx.auditoria, {
            get(a, p, r) {
              if (p === "aggregate") {
                return async (args: never) => {
                  const real = (await a.aggregate(args)) as { _max: { numAuditoria: number | null } };
                  return { _max: { numAuditoria: Math.max(0, (real._max.numAuditoria ?? 0) - 1) } };
                };
              }
              return Reflect.get(a, p, r);
            },
          });
          return fn(new Proxy(tx, { get: (t, p, r) => (p === "auditoria" ? auditoria : Reflect.get(t, p, r)) }));
        });
      };
    },
  });
}

describe("restrições únicas", () => {
  it("nis único; vários NULL permitidos", async () => {
    await prisma.beneficiario.create({ data: benefDireto(completaDv("700000001"), { nis: "20000000001" }) });
    await expect(prisma.beneficiario.create({ data: benefDireto(completaDv("700000002"), { nis: "20000000001" }) })).rejects.toMatchObject({ code: "P2002" });
    await prisma.beneficiario.create({ data: benefDireto(completaDv("700000003"), { nis: null }) });
    await prisma.beneficiario.create({ data: benefDireto(completaDv("700000004"), { nis: null }) });
  });

  it("numPagamento único", async () => {
    await prisma.pagamento.create({ data: pgto(9001) });
    const e = await prisma.pagamento.create({ data: pgto(9001) }).catch((x: unknown) => x);
    expect(violaUnico(e, "numPagamento")).toBe(true);
  });

  it("numAuditoria único", async () => {
    await prisma.auditoria.create({ data: audit(77) });
    const e = await prisma.auditoria.create({ data: audit(77) }).catch((x: unknown) => x);
    expect(ehColisaoNumAuditoria(e)).toBe(true);
  });

  it("(beneficiarioId, cpfDependente) único; vários NULL no mesmo titular permitidos", async () => {
    const t = await prisma.beneficiario.create({ data: benefDireto(completaDv("700000005")) });
    const dep = (occurrence: number, cpfDependente: string | null) => ({
      beneficiarioId: t.id,
      occurrence,
      nomeDependente: "DEP",
      dtNascDepend: 20150101,
      parentesco: "FI",
      cpfDependente,
    });
    await prisma.beneficiarioDependente.create({ data: dep(1, "11122233344") });
    const e = await prisma.beneficiarioDependente.create({ data: dep(2, "11122233344") }).catch((x: unknown) => x);
    expect(violaUnico(e, "cpfDependente")).toBe(true);
    await prisma.beneficiarioDependente.create({ data: dep(3, null) });
    await prisma.beneficiarioDependente.create({ data: dep(4, null) });
    // Mesmo CPF de dependente em outro titular: permitido.
    const t2 = await prisma.beneficiario.create({ data: benefDireto(completaDv("700000006")) });
    await prisma.beneficiarioDependente.create({ data: { ...dep(1, "11122233344"), beneficiarioId: t2.id } });
  });

  it("sem unique (numCpf, anoMesRef): dois pagamentos do mesmo CPF na competência são aceitos (CALCBENF)", async () => {
    await prisma.pagamento.create({ data: pgto(9101) });
    await prisma.pagamento.create({ data: pgto(9102) });
    expect(await prisma.pagamento.count({ where: { numCpf: CPF_MARIA, anoMesRef: 202601 } })).toBe(2);
  });
});

describe("cascatas e RESTRICT", () => {
  it("Programa → faixas e parâmetros regionais em cascata", async () => {
    const p = await prisma.programaSocial.create({
      data: {
        codPrograma: "PZ09",
        nomePrograma: "CASCATA",
        tipoPrograma: "A",
        dtCriacao: 20260101,
        vlrBaseIndividual: 100,
        fatorReajuste: "0.0000",
        fatorK: "1.000000",
        faixasCalculo: { create: [{ occurrence: 1, rendaInicio: 0, rendaFim: 100, vlrAdicional: 0, fatorMultiplicador: "1.0000", indAcumulativo: "N" }] },
        paramsRegionais: { create: [{ occurrence: 1, codRegiao: 1, fatorRegional: "1.0000", vlrComplementoReg: 0, indAtivoRegiao: "S" }] },
      },
    });
    await prisma.programaSocial.delete({ where: { id: p.id } });
    expect(await prisma.programaFaixaCalculo.count({ where: { programaId: p.id } })).toBe(0);
    expect(await prisma.programaParamRegional.count({ where: { programaId: p.id } })).toBe(0);
  });

  it("Pagamento → descontos aplicados em cascata", async () => {
    const p = await prisma.pagamento.create({
      data: { ...pgto(9201), descontos: { create: [{ occurrence: 1, tipoDesconto: "C", vlrDesconto: 10, pctDesconto: "0.00", dtInicioDsct: 20260101 }] } },
    });
    await prisma.pagamento.delete({ where: { id: p.id } });
    expect(await prisma.pagamentoDesconto.count({ where: { pagamentoId: p.id } })).toBe(0);
  });

  it("Beneficiário com pagamento não pode ser excluído (RESTRICT)", async () => {
    const cpf = completaDv("700000007");
    await prisma.beneficiario.create({ data: benefDireto(cpf) });
    await prisma.pagamento.create({ data: pgto(9301, cpf) });
    await expect(prisma.beneficiario.delete({ where: { numCpf: cpf } })).rejects.toBeTruthy();
    expect(await prisma.beneficiario.count({ where: { numCpf: cpf } })).toBe(1);
    expect(await prisma.pagamento.count({ where: { numCpf: cpf } })).toBe(1);
  });
});

describe("P2002 em inclusões concorrentes → mensagem legada de duplicado", () => {
  it("incluirPrograma: dois processos com o mesmo código → um inclui, o outro PROGRAMA JA CADASTRADO", async () => {
    const rs = await Promise.all([incluirPrograma(programa("PQ01"), prisma), incluirPrograma(programa("PQ01"), outro)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok)).toEqual([{ ok: false, mensagem: "PROGRAMA JA CADASTRADO" }]);
    expect(await prisma.programaSocial.count({ where: { codPrograma: "PQ01" } })).toBe(1);
  });

  it("incluirPrograma: verificação prévia perde a corrida (P2002 real no insert) → PROGRAMA JA CADASTRADO", async () => {
    await incluirPrograma(programa("PQ02"), prisma);
    // A leitura prévia não vê o programa (como se o outro processo gravasse logo depois dela).
    const corrida = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop !== "programaSocial") return Reflect.get(alvo, prop, receptor);
        const real = alvo.programaSocial;
        return new Proxy(real, { get: (m, p, r) => (p === "findUnique" ? async () => null : Reflect.get(m, p, r)) });
      },
    });
    expect(await incluirPrograma(programa("PQ02"), corrida)).toEqual({ ok: false, mensagem: "PROGRAMA JA CADASTRADO" });
    expect(await prisma.programaSocial.count({ where: { codPrograma: "PQ02" } })).toBe(1);
  });

  it("incluirBeneficiario: dois processos com o mesmo CPF → um inclui, o outro BENEFICIARIO JA CADASTRADO", async () => {
    const rs = await Promise.all([incluirBeneficiario(beneficiario(), prisma), incluirBeneficiario(beneficiario(), outro)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok)).toEqual([{ ok: false, mensagem: "BENEFICIARIO JA CADASTRADO" }]);
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(1);
  });

  it("incluirBeneficiario: verificação prévia perde a corrida (P2002 real no insert) → BENEFICIARIO JA CADASTRADO", async () => {
    await incluirBeneficiario(beneficiario(), prisma);
    let leituras = 0;
    // Só a 1.ª leitura (verificação prévia do CPF) não vê o registro; a releitura após o P2002 vê.
    const corrida = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop !== "beneficiario") return Reflect.get(alvo, prop, receptor);
        const real = alvo.beneficiario;
        return new Proxy(real, {
          get: (m, p, r) => (p === "findUnique" ? (args: never) => (++leituras === 1 ? Promise.resolve(null) : real.findUnique(args)) : Reflect.get(m, p, r)),
        });
      },
    });
    expect(await incluirBeneficiario(beneficiario(), corrida)).toEqual({ ok: false, mensagem: "BENEFICIARIO JA CADASTRADO" });
    expect(await prisma.beneficiario.count({ where: { numCpf: CPF_NOVO } })).toBe(1);
  });
});

describe("numAuditoria máx.+1 com colisão", () => {
  it("registrarEvento: leitura defasada do máximo → P2002 real → repete e grava máx.+1", async () => {
    await prisma.auditoria.create({ data: audit(1) });
    await prisma.auditoria.create({ data: audit(2) });
    const e = await registrarEvento({ acao: "IN", tabela: "TESTE", chave: "X", usuario: "SIFAPUSR", descricao: "COLISAO" }, comMaximoDefasado());
    expect(e.numAuditoria).toBe(3);
    expect(await prisma.auditoria.count()).toBe(3);
  });

  it("registrarEvento: P2002 em outro campo não é repetido", async () => {
    let chamadas = 0;
    const db = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop !== "$transaction") return Reflect.get(alvo, prop, receptor);
        return () => {
          chamadas++;
          return Promise.reject({ code: "P2002", meta: { target: ["outroCampo"] } });
        };
      },
    });
    await expect(registrarEvento({ acao: "IN", tabela: "T", chave: "X", usuario: "U", descricao: "D" }, db)).rejects.toMatchObject({ code: "P2002" });
    expect(chamadas).toBe(1);
  });

  it("conciliação: colisão de numAuditoria dentro da transação do registro → repete o registro", async () => {
    await prisma.auditoria.create({ data: audit(1) });
    await prisma.pagamento.create({ data: { ...pgto(1), anoMesRef: 199201, vlrBruto: 10000, vlrLiquido: 10000 } });
    const r = await conciliarRetorno(
      { competencia: 199201, conteudo: arquivoRetorno([{ cpf: CPF_MARIA, numDoc: 1, valor: 10000 }]) },
      { db: comMaximoDefasado() },
    );
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 1, auditoria: 1 } });
    const eventos = await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } });
    expect(eventos.map((ev) => [ev.numAuditoria, ev.codAcao])).toEqual([
      [1, "IN"],
      [2, "CO"],
    ]);
  });

  it("ehColisaoNumAuditoria / camposViolados reconhecem meta do adapter e meta.target", () => {
    const adapter = (fields: string[]) => ({ code: "P2002", meta: { driverAdapterError: { cause: { constraint: { fields } } } } });
    expect(ehColisaoNumAuditoria(adapter(["numAuditoria"]))).toBe(true);
    expect(ehColisaoNumAuditoria({ code: "P2002", meta: { target: "Auditoria_numAuditoria_key" } })).toBe(true);
    expect(ehColisaoNumAuditoria(adapter(["numPagamento"]))).toBe(false);
    expect(ehColisaoNumAuditoria({ code: "P2003", meta: { target: ["numAuditoria"] } })).toBe(false);
    expect(camposViolados(null)).toBeNull();
    expect(camposViolados({ code: "P2002" })).toEqual([]);
  });
});

describe("colunas únicas nullable: vazio → NULL antes de gravar", () => {
  it("vazioParaNull", () => {
    expect(vazioParaNull("")).toBeNull();
    expect(vazioParaNull("   ")).toBeNull();
    expect(vazioParaNull(null)).toBeNull();
    expect(vazioParaNull(undefined)).toBeNull();
    expect(vazioParaNull("12345678901")).toBe("12345678901");
  });

  it("incluirBeneficiario com nis '' (chamada direta) grava NULL; dois assim não colidem", async () => {
    const r1 = await incluirBeneficiario({ ...beneficiario(), nis: "" }, prisma);
    const r2 = await incluirBeneficiario({ ...beneficiario({ numCpf: completaDv("876543210") }), nis: "" }, prisma);
    expect([r1.ok, r2.ok]).toEqual([true, true]);
    const nis = await prisma.beneficiario.findMany({ where: { numCpf: { in: [CPF_NOVO, completaDv("876543210")] } }, select: { nis: true } });
    expect(nis).toEqual([{ nis: null }, { nis: null }]);
  });

  it("incluirDependente com cpfDependente '' (chamada direta) grava NULL; dois assim não colidem", async () => {
    await prisma.beneficiario.create({ data: benefDireto(CPF_TITULAR) });
    const dep = { nomeDependente: "FILHO", dtNascDepend: 20150310, parentesco: "FI", cpfDependente: "", docDependente: null, sexoDependente: "M" };
    const r1 = await incluirDependente(CPF_TITULAR, dep, prisma);
    const r2 = await incluirDependente(CPF_TITULAR, { ...dep, cpfDependente: "  " }, prisma);
    expect([r1.ok, r2.ok]).toEqual([true, true]);
    const deps = await prisma.beneficiarioDependente.findMany({ where: { beneficiario: { numCpf: CPF_TITULAR } }, select: { cpfDependente: true } });
    expect(deps).toEqual([{ cpfDependente: null }, { cpfDependente: null }]);
  });
});
