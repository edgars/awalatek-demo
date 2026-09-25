import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { aplicarPadroesAuditoria, montarRelatorioAuditoria, type EntradaRelatorioAuditoria } from "@/domain/relatorios/auditoria";
import { LIMITE_LINHAS_RELATORIO, MSG_LIMITE_LINHAS_RELATORIO } from "@/domain/relatorios/paginacao";
import { createPrismaClient } from "@/server/db";
import { relatorioAuditoria } from "@/server/relatorioAuditoria";
import { relatorioPagamentos } from "@/server/relatorios";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// H3 — volumen de los informes 7.1 y 7.3: tope de filas y filtros de auditoría empujados
// a la base con los mismos contadores que la lectura completa del período.

let dir: string;
let prisma: PrismaClient;
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
  await prisma.pagamento.deleteMany();
  await prisma.auditoria.deleteMany(); // limpieza del test, no del código de producción
});

describe("tope de filas", () => {
  it("constante y mensaje literal", () => {
    expect(LIMITE_LINHAS_RELATORIO).toBe(20000);
    expect(MSG_LIMITE_LINHAS_RELATORIO).toBe("Período com mais de 20.000 registros. Refine o filtro.");
    expect(MSG_LIMITE_LINHAS_RELATORIO).toContain(LIMITE_LINHAS_RELATORIO.toLocaleString("pt-BR"));
  });

  it("7.1: período acima do limite → sem detalhe; no limite → informe normal", async () => {
    const base = { numCpf: CPF, codPrograma: "PA01", vlrBruto: 100, vlrLiquido: 100, tipoPgto: "N", sitPagamento: "G", dtGeracao: 20110101, hrGeracao: 1 };
    await prisma.pagamento.createMany({ data: [1, 2, 3].map((n) => ({ ...base, numPagamento: n, anoMesRef: 201101 })) });
    await prisma.pagamento.create({ data: { ...base, numPagamento: 4, anoMesRef: 201103 } });
    const f = { compIni: 201101, compFim: 201112, programa: "" };

    const acima = await relatorioPagamentos(f, prisma, AGORA, { limite: 3 });
    expect(acima.limiteExcedido).toBe(true);
    expect(acima.linhas).toEqual([]);
    expect(acima.paginas).toEqual([]);

    const noLimite = await relatorioPagamentos(f, prisma, AGORA, { limite: 4 });
    expect(noLimite.limiteExcedido).toBe(false);
    expect(noLimite.total.qtd).toBe(4);
    // Mesmo resultado que sem limite explícito (padrão 20.000).
    expect(await relatorioPagamentos(f, prisma, AGORA)).toEqual(noLimite);

    // O período (não o filtro de programa) é o que se conta: outro período cabe.
    expect((await relatorioPagamentos({ ...f, compIni: 201102 }, prisma, AGORA, { limite: 3 })).limiteExcedido).toBe(false);
    await expect(relatorioPagamentos(f, prisma, AGORA, { limite: -1 })).rejects.toThrow();
  });

  it("7.3: candidatos acima do limite → sem detalhe, total do período preservado", async () => {
    await prisma.auditoria.createMany({ data: [1, 2, 3, 4].map((n) => evento(n, { codAcao: n === 4 ? "EX" : "IN" })) });
    const e = { ...VAZIA, dtIni: 20110101, dtFim: 20111231 };
    // 3 candidatos (o EX é descartado na base) → limite 2 excedido; limite 3 não.
    const acima = await relatorioAuditoria(e, prisma, AGORA, { limite: 2 });
    expect(acima.limiteExcedido).toBe(true);
    expect(acima.linhas).toEqual([]);
    expect(acima.resumo.total).toBe(4);
    const ok = await relatorioAuditoria(e, prisma, AGORA, { limite: 3 });
    expect(ok.limiteExcedido).toBe(false);
    expect(ok.resumo).toMatchObject({ total: 4, exibidos: 3, filtrados: 1 });
  });

  it("páginas: limite excedido mostra a mensagem literal (limite real, 20.001 pagamentos)", async () => {
    const base = { numCpf: CPF, codPrograma: "PA01", vlrBruto: 1, vlrLiquido: 1, tipoPgto: "N", sitPagamento: "G", dtGeracao: 20110101, hrGeracao: 1, anoMesRef: 199001 };
    const n = LIMITE_LINHAS_RELATORIO + 1;
    for (let i = 0; i < n; i += 5000) {
      await prisma.pagamento.createMany({ data: Array.from({ length: Math.min(5000, n - i) }, (_, k) => ({ ...base, numPagamento: 100000 + i + k })) });
    }
    const { default: Pagina } = await import("@/app/relatorios/pagamentos/page");
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ compIni: "199001", compFim: "199001" }) }));
    expect(html).toContain(MSG_LIMITE_LINHAS_RELATORIO);
    expect(html).not.toContain("<table");
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
  async function completo(entrada: EntradaRelatorioAuditoria) {
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
    const { dataEmissao: _d, limiteExcedido, ...semExtras } = r;
    void _d;
    expect(limiteExcedido).toBe(false);
    expect(semExtras).toEqual(await completo(entrada));
  });

  it("os dados exercitam as armadilhas (há filtrados por EX e por cada filtro)", async () => {
    const r = await completo({ ...VAZIA, acao: "IN", usuario: "BATCH", tabela: "BENEFICIARIO" });
    expect(r.resumo.exibidos).toBeGreaterThan(0);
    expect(r.resumo.filtrados).toBeGreaterThan(r.resumo.exibidos);
  });
});
