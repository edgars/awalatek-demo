import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { aplicarPadroesAuditoria, montarRelatorioAuditoria, type EntradaRelatorioAuditoria } from "@/domain/relatorios/auditoria";
import { montarRelatorioPagamentos } from "@/domain/relatorios/pagamentos";
import { LIMITE_LINHAS_RELATORIO, MSG_LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { createPrismaClient } from "@/server/db";
import { relatorioAuditoria } from "@/server/relatorioAuditoria";
import { relatorioPagamentos } from "@/server/relatorios";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// H3 — volumen de los informes 7.1 y 7.3: tope de filas y filtros de auditoría empujados
// a la base con los mismos contadores que la lectura completa del período.

let dir: string;
let prisma: PrismaClient;
let urlOriginal: string | undefined;
const AGORA = new Date("2026-09-25T15:00:00Z");
const CPF = cpfComDv(BENEFICIARIOS_SEED[0].base);
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-relvol-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // Las páginas usan el cliente global: se apunta a esta base temporal.
  delete globalPrisma.prisma;
  urlOriginal = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  if (urlOriginal === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = urlOriginal;
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.pagamento.deleteMany();
  await prisma.auditoria.deleteMany(); // limpieza del test, no del código de producción
});

/** Informe completo (dentro do limite de linhas); falha o teste se o limite foi excedido. */
function completo<T extends { limiteExcedido: boolean }>(r: T): Extract<T, { limiteExcedido: false }> {
  if (r.limiteExcedido) throw new Error("limite de linhas excedido");
  return r as Extract<T, { limiteExcedido: false }>;
}

const PGTO = { numCpf: CPF, codPrograma: "PA01", vlrBruto: 100, vlrLiquido: 100, tipoPgto: "N", sitPagamento: "G", dtGeracao: 20110101, hrGeracao: 1 };

describe("tope de filas", () => {
  it("constante y mensaje literal", () => {
    expect(LIMITE_LINHAS_RELATORIO).toBe(20000);
    expect(MSG_LIMITE_LINHAS_RELATORIO).toBe("Consulta com mais de 20.000 registros. Refine o filtro.");
    expect(MSG_LIMITE_LINHAS_RELATORIO).toContain(LIMITE_LINHAS_RELATORIO.toLocaleString("pt-BR"));
  });

  it("7.1: consulta acima do limite → só a bandeira, sem detalhe nem totais; no limite → informe normal", async () => {
    await prisma.pagamento.createMany({ data: [1, 2, 3].map((n) => ({ ...PGTO, numPagamento: n, anoMesRef: 201101 })) });
    await prisma.pagamento.create({ data: { ...PGTO, numPagamento: 4, anoMesRef: 201103 } });
    const f = { compIni: 201101, compFim: 201112, programa: "" };

    expect(await relatorioPagamentos(f, prisma, AGORA, { limite: 3 })).toEqual({ limiteExcedido: true, filtros: f, dataEmissao: 20260925 });

    const noLimite = completo(await relatorioPagamentos(f, prisma, AGORA, { limite: 4 }));
    expect(noLimite.total.qtd).toBe(4);
    // Mesmo resultado que sem limite explícito (padrão 20.000).
    expect(await relatorioPagamentos(f, prisma, AGORA)).toEqual(noLimite);

    // Outro período cabe.
    expect((await relatorioPagamentos({ ...f, compIni: 201102 }, prisma, AGORA, { limite: 3 })).limiteExcedido).toBe(false);
    await expect(relatorioPagamentos(f, prisma, AGORA, { limite: -1 })).rejects.toThrow();
  });

  it("7.1: refinar pelo programa reduz a consulta abaixo do limite", async () => {
    await prisma.pagamento.createMany({
      data: [1, 2, 3, 4].map((n) => ({ ...PGTO, numPagamento: n, anoMesRef: 201101, codPrograma: n === 4 ? "PP01" : "PA01" })),
    });
    const f = { compIni: 201101, compFim: 201112, programa: "" };
    expect((await relatorioPagamentos(f, prisma, AGORA, { limite: 2 })).limiteExcedido).toBe(true);
    const pp = completo(await relatorioPagamentos({ ...f, programa: "PP01" }, prisma, AGORA, { limite: 2 }));
    expect(pp.total.qtd).toBe(1);
  });

  it("7.3: candidatos acima do limite → só a bandeira (sem resumo fictício)", async () => {
    await prisma.auditoria.createMany({ data: [1, 2, 3, 4].map((n) => evento(n, { codAcao: n === 4 ? "EX" : "IN" })) });
    const e = { ...VAZIA, dtIni: 20110101, dtFim: 20111231 };
    // 3 candidatos (o EX é descartado na base) → limite 2 excedido; limite 3 não.
    const acima = await relatorioAuditoria(e, prisma, AGORA, { limite: 2 });
    expect(acima).toEqual({ limiteExcedido: true, filtros: { ...e, saida: "T" }, dataEmissao: 20260925 });
    const ok = completo(await relatorioAuditoria(e, prisma, AGORA, { limite: 3 }));
    expect(ok.resumo).toMatchObject({ total: 4, exibidos: 3, filtrados: 1 });
    // Refinar pela ação reduz a consulta.
    expect((await relatorioAuditoria({ ...e, acao: "EX" }, prisma, AGORA, { limite: 2 })).limiteExcedido).toBe(false);
    await expect(relatorioAuditoria(e, prisma, AGORA, { limite: -1 })).rejects.toThrow();
  });

  it("página 7.1: limite excedido mostra a mensagem literal (limite real, 20.001 pagamentos)", async () => {
    const n = LIMITE_LINHAS_RELATORIO + 1;
    for (let i = 0; i < n; i += 5000) {
      await prisma.pagamento.createMany({ data: Array.from({ length: Math.min(5000, n - i) }, (_, k) => ({ ...PGTO, anoMesRef: 199001, numPagamento: 100000 + i + k })) });
    }
    const { default: Pagina } = await import("@/app/relatorios/pagamentos/page");
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ compIni: "199001", compFim: "199001" }) }));
    expect(html).toContain(MSG_LIMITE_LINHAS_RELATORIO);
    expect(html).not.toContain("<table");
  });

  it("página 7.3: limite excedido mostra a mensagem literal (limite real, 20.001 eventos)", async () => {
    const n = LIMITE_LINHAS_RELATORIO + 1;
    for (let i = 0; i < n; i += 5000) {
      await prisma.auditoria.createMany({ data: Array.from({ length: Math.min(5000, n - i) }, (_, k) => evento(i + k + 1, { dtEvento: 19900115 })) });
    }
    const { default: Pagina } = await import("@/app/relatorios/auditoria/page");
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ dtIni: "19900101", dtFim: "19900131" }) }));
    expect(html).toContain(MSG_LIMITE_LINHAS_RELATORIO);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("RESUMO AUDITORIA");
  });
});

describe("7.1: filtro de programa empurrado à base ≡ leitura completa do período", () => {
  // Códigos gravados com espaços e minúsculas (o domínio compara trim + maiúsculas) e
  // códigos que contêm o filtro sem serem iguais a ele.
  const CODIGOS = ["PA01", " PA01", "PA01 ", "pa01", "Pa01", "PP01", "PA0", "XPA01", "PA011", "PT01", "0"];
  const FILTROS = ["", "0", "PA01", "pa01", " PA01 ", "PP01", "PA0", "PT01", "ZZ99", "P_01", "P%"];

  beforeEach(async () => {
    const rnd = prng(99);
    const escolhe = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    await prisma.pagamento.createMany({
      data: Array.from({ length: 800 }, (_, i) => ({ ...PGTO, numPagamento: i + 1, anoMesRef: escolhe([201012, 201101, 201106, 201112, 201201]), codPrograma: escolhe(CODIGOS), vlrBruto: Math.floor(rnd() * 100000) })),
    });
  });

  it.each(FILTROS)("programa %j", async (programa) => {
    const f = { compIni: 201101, compFim: 201112, programa };
    const filas = await prisma.pagamento.findMany({
      where: { anoMesRef: { gte: f.compIni, lte: f.compFim } },
      select: { numPagamento: true, numCpf: true, codPrograma: true, anoMesRef: true, vlrBruto: true, vlrDescontoTotal: true, vlrLiquido: true, vlrAbono: true, tipoPgto: true, sitPagamento: true, beneficiario: { select: { nomeCompleto: true, uf: true } } },
    });
    const { limiteExcedido: _l, filtros: _f, dataEmissao: _d, ...obtido } = completo(await relatorioPagamentos(f, prisma, AGORA));
    void _l;
    void _f;
    void _d;
    expect(obtido).toEqual(montarRelatorioPagamentos(filas, f));
  });
});

describe("esquema: premissas dos pré-filtros", () => {
  it("codAcao, usrEvento e tipoEntidade são NOT NULL (o pré-filtro não perde linhas NULL)", async () => {
    const colunas = await prisma.$queryRawUnsafe<{ name: string; notnull: number | bigint }[]>(`PRAGMA table_info("Auditoria")`);
    for (const c of ["codAcao", "usrEvento", "tipoEntidade", "dtEvento"]) {
      expect(Number(colunas.find((x) => x.name === c)?.notnull), c).toBe(1);
    }
    const pgto = await prisma.$queryRawUnsafe<{ name: string; notnull: number | bigint }[]>(`PRAGMA table_info("Pagamento")`);
    for (const c of ["codPrograma", "anoMesRef"]) expect(Number(pgto.find((x) => x.name === c)?.notnull), c).toBe(1);
  });
});

const VAZIA: EntradaRelatorioAuditoria = { dtIni: 0, dtFim: 0, acao: "", usuario: "", tabela: "", saida: "T" };

function evento(n: number, over: Partial<{ dtEvento: number; hrEvento: number; codAcao: string; usrEvento: string; tipoEntidade: string }> = {}) {
  return {
    numAuditoria: n,
    dtEvento: 20110115,
    hrEvento: 100000 + n,
    codAcao: "IN",
    tipoEntidade: "BENEFICIARIO",
    idEntidade: String(n),
    usrEvento: "BATCH",
    desAcao: "EVENTO",
    ...over,
  };
}

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

describe("7.3: filtros empurrados à base ≡ leitura completa do período", () => {
  // Valores escolhidos para as armadilhas: espaços finais (campo A), minúsculas (LIKE do
  // SQLite ignora caixa), comodines de LIKE (% e _), prefixos ("MARIA" vs "MARIANA"),
  // espaço inicial (significativo) e EX com espaço final.
  const ACOES = ["IN", "IN ", "in", "AL", "CO", "CN", "DV", "EX", "EX ", "ex", "XX", "I"];
  const USUARIOS = ["BATCH", "BATCH  ", "batch", "MARIA", "MARIANA", " MARIA", "M%RIA", "MA_IA", "E2EUSER", "OPERADR1"];
  const TABELAS = ["BENEFICIARIO", "BENEFICIARIO ", "beneficiario", "PAGAMENTO", "PAG", "PROGRAMA_SOCIAL", "PROGRAMA%"];
  const DATAS = [20101231, 20110101, 20110615, 20111231, 20120101];

  beforeEach(async () => {
    const rnd = prng(424242);
    const escolhe = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    await prisma.auditoria.createMany({
      data: Array.from({ length: 1500 }, (_, i) =>
        evento(i + 1, { dtEvento: escolhe(DATAS), hrEvento: Math.floor(rnd() * 235959), codAcao: escolhe(ACOES), usrEvento: escolhe(USUARIOS), tipoEntidade: escolhe(TABELAS) }),
      ),
    });
  });

  /** Caminho anterior: lê todo o período e deixa o domínio filtrar e contar. */
  async function leituraCompleta(entrada: EntradaRelatorioAuditoria) {
    const filtros = aplicarPadroesAuditoria(entrada, 20260925);
    const eventos = await prisma.auditoria.findMany({
      where: { dtEvento: { gte: filtros.dtIni, lte: filtros.dtFim } },
      select: { numAuditoria: true, dtEvento: true, hrEvento: true, usrEvento: true, codAcao: true, tipoEntidade: true, idEntidade: true, desAcao: true },
    });
    return montarRelatorioAuditoria(filtros.dtIni <= filtros.dtFim ? eventos : [], filtros);
  }

  const CASOS: Partial<EntradaRelatorioAuditoria>[] = [
    {},
    { dtIni: 20110101, dtFim: 20111231 },
    { acao: "IN" },
    { acao: "EX" },
    { acao: "I" },
    { usuario: "MARIA" },
    { usuario: " MARIA" },
    { usuario: "M%RIA" },
    { usuario: "MA_IA" },
    { usuario: "BATCH" },
    { usuario: "batch" },
    { tabela: "BENEFICIARIO" },
    { tabela: "PAG" },
    { tabela: "PROGRAMA_SOCIAL" },
    { acao: "IN", usuario: "BATCH", tabela: "BENEFICIARIO", saida: "I" },
    { acao: "CO", usuario: "MARIANA", dtIni: 20110101, dtFim: 20110615 },
    { dtIni: 20120102, dtFim: 20121231 },
    { dtIni: 20111231, dtFim: 20110101 },
  ];

  it.each(CASOS.map((c) => [JSON.stringify(c), c] as const))("%s", async (_nome, caso) => {
    const entrada = { ...VAZIA, ...caso };
    const r = await relatorioAuditoria(entrada, prisma, AGORA);
    const { dataEmissao: _d, limiteExcedido: _l, ...semExtras } = completo(r);
    void _d;
    void _l;
    expect(semExtras).toEqual(await leituraCompleta(entrada));
  });

  it("os dados exercitam as armadilhas (há filtrados por EX e por cada filtro)", async () => {
    const r = await leituraCompleta({ ...VAZIA, acao: "IN", usuario: "BATCH", tabela: "BENEFICIARIO" });
    expect(r.resumo.exibidos).toBeGreaterThan(0);
    expect(r.resumo.filtrados).toBeGreaterThan(r.resumo.exibidos);
  });
});
