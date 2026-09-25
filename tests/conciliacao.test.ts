import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { conciliarRetornoAction } from "@/app/conciliacao/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { conciliarRetorno } from "@/server/conciliacao";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";
import { arquivoRetorno, linhaControle, linhaDetalhe, type DetalheCnab } from "./fixtures/cnab240";

// Story 6.1 — conciliación del retorno CNAB 240 (BATCHCON) contra una base SQLite temporal.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // PA01
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base); // PP01
const COMP = 199201;
const AGORA = new Date("2026-09-25T13:45:10Z");
const MOMENTO = hoje(AGORA);
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

async function pagamento(numPagamento: number, vlrLiquido: number, extra: Record<string, unknown> = {}) {
  return prisma.pagamento.create({
    data: {
      numPagamento,
      numCpf: CPF_MARIA,
      codPrograma: "PA01",
      anoMesRef: COMP,
      vlrBruto: vlrLiquido,
      vlrLiquido,
      sitPagamento: "G",
      dtGeracao: 19920105,
      hrGeracao: 100000,
      usrInclusao: "BATCH",
      ...extra,
    },
  });
}

const det = (numDoc: number, valor: number, extra: Partial<DetalheCnab> = {}): DetalheCnab => ({ cpf: CPF_MARIA, numDoc, valor, ...extra });
const conciliar = (conteudo: string) => conciliarRetorno({ competencia: COMP, conteudo }, { db: prisma, agora: AGORA });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-batchcon-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  await seed(prisma);
});

beforeEach(async () => {
  await prisma.auditoria.deleteMany();
  await prisma.pagamento.deleteMany();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("conciliarRetorno", () => {
  it("00 → P + data + banco 1 + código; auditoria CO de BATCH", async () => {
    await pagamento(1, 10000);
    const r = await conciliar(arquivoRetorno([det(1, 10000, { dtPgto: "25092026" })]));
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ lidos: 5, detalhes: 1, conciliados: 1, divergentes: 0, naoEncontrados: 0, auditoria: 1, mensagens: [] });
    const p = await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } });
    // TODO(review) replicado: a data é gravada sem conversão.
    expect(p).toMatchObject({ sitPagamento: "P", dtPagamento: 25092026, codBanco: "1", codRetornoBanco: "00" });
    expect(p).toMatchObject({ dtConciliacao: null, sitConciliacao: null, vlrConciliado: null });
    const [a] = await prisma.auditoria.findMany();
    expect(a).toMatchObject({
      codAcao: "CO",
      usrEvento: "BATCH",
      tipoEntidade: "PAGAMENTO",
      idEntidade: "1",
      desAcao: "CONCILIADO COD RET=00",
      valorAnterior: null,
      valorPosterior: null,
      dtEvento: MOMENTO.data,
      hrEvento: MOMENTO.hora,
    });
  });

  it("01 → D e 02 → E, sem data nem banco; CO", async () => {
    await pagamento(1, 10000);
    await pagamento(2, 20000);
    const r = await conciliar(arquivoRetorno([det(1, 10000, { codRet: "01" }), det(2, 20000, { codRet: "02" })]));
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 2, auditoria: 2 } });
    const ps = await prisma.pagamento.findMany({ orderBy: { numPagamento: "asc" } });
    expect(ps.map((p) => [p.sitPagamento, p.dtPagamento, p.codBanco, p.codRetornoBanco])).toEqual([
      ["D", null, null, "01"],
      ["E", null, null, "02"],
    ]);
    expect((await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } })).map((a) => a.desAcao)).toEqual([
      "CONCILIADO COD RET=01",
      "CONCILIADO COD RET=02",
    ]);
  });

  it("código desconhecido → sem update, mensagem, conta como conciliado, CO", async () => {
    await pagamento(1, 10000);
    const r = await conciliar(arquivoRetorno([det(1, 10000, { codRet: "99" })]));
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ conciliados: 1, auditoria: 1 });
    expect(r.resumo.mensagens).toEqual([`COD RETORNO DESCONHECIDO: 99 CPF=${CPF_MARIA}`]);
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({ sitPagamento: "G", codRetornoBanco: null });
    expect(await prisma.auditoria.findMany()).toMatchObject([{ codAcao: "CO", desAcao: "CONCILIADO COD RET=99" }]);
  });

  it("divergente (100,00 × 100,02) → sem update, DV com valores; 0,01 exato concilia", async () => {
    await pagamento(1, 10000);
    await pagamento(2, 10000);
    const r = await conciliar(arquivoRetorno([det(1, 10002), det(2, 10001)]));
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ conciliados: 1, divergentes: 1, auditoria: 2 });
    expect(r.resumo.mensagens).toEqual([`DIVERGENCIA: CPF=${CPF_MARIA} SIFAP=100.00 BANCO=100.02`]);
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({ sitPagamento: "G", codRetornoBanco: null });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 2 } })).toMatchObject({ sitPagamento: "P" });
    const [dv] = await prisma.auditoria.findMany({ where: { codAcao: "DV" } });
    expect(dv).toMatchObject({
      idEntidade: "1",
      usrEvento: "BATCH",
      tipoEntidade: "PAGAMENTO",
      desAcao: "DIVERGENCIA VALOR SIFAP X BANCO",
      valorAnterior: "100.00",
      valorPosterior: "100.02",
    });
  });

  it("não encontrado (doc inexistente, CPF distinto, outra competência) → contador, sem auditoria", async () => {
    await pagamento(1, 10000);
    await pagamento(2, 10000, { anoMesRef: 199202 });
    const r = await conciliar(arquivoRetorno([det(99, 10000), det(1, 10000, { cpf: CPF_JOSE }), det(2, 10000)]));
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ conciliados: 0, naoEncontrados: 3, auditoria: 0, lidos: 7 });
    expect(r.resumo.mensagens).toEqual([
      `NAO ENCONTRADO: CPF=${CPF_MARIA} DOC=0000000099`,
      `NAO ENCONTRADO: CPF=${CPF_JOSE} DOC=0000000001`,
      `NAO ENCONTRADO: CPF=${CPF_MARIA} DOC=0000000002`,
    ]);
    expect(await prisma.auditoria.count()).toBe(0);
    expect(await prisma.pagamento.count({ where: { sitPagamento: "G" } })).toBe(2);
  });

  it("só header/trailer → lidos contados, 0 conciliados, 0 detalhes", async () => {
    const r = await conciliar([linhaControle("0"), linhaControle("1"), linhaControle("5"), linhaControle("9")].join("\n") + "\n\n");
    expect(r).toMatchObject({ ok: true, resumo: { lidos: 4, detalhes: 0, conciliados: 0, auditoria: 0 } });
  });

  it("momento único: os 3 eventos com a mesma data/hora e numeração sequencial", async () => {
    for (const n of [1, 2, 3]) await pagamento(n, 10000);
    await conciliar(arquivoRetorno([det(1, 10000), det(2, 50000), det(3, 10000, { codRet: "01" })]));
    const eventos = await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } });
    expect(eventos.map((e) => [e.numAuditoria, e.codAcao, e.dtEvento, e.hrEvento])).toEqual([
      [1, "CO", MOMENTO.data, MOMENTO.hora],
      [2, "DV", MOMENTO.data, MOMENTO.hora],
      [3, "CO", MOMENTO.data, MOMENTO.hora],
    ]);
  });

  it("duas execuções simultâneas → a segunda recebe 'Conciliação já em execução.'", async () => {
    await pagamento(1, 10000);
    const conteudo = arquivoRetorno([det(1, 10000)]);
    const [a, b] = await Promise.all([conciliar(conteudo), conciliar(conteudo)]);
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, mensagem: "Conciliação já em execução." });
    // O cadeado é liberado ao terminar.
    expect((await conciliar(conteudo)).ok).toBe(true);
  });

  it("linha curta não aborta; linhas vazias finais não contam", async () => {
    await pagamento(1, 10000);
    const curta = linhaDetalhe(det(1, 10000)).slice(0, 200); // sem código de retorno
    const r = await conciliar(`${linhaControle("0")}\n${curta}\n\n`);
    if (!r.ok) throw new Error(r.mensagem);
    expect(r.resumo).toMatchObject({ lidos: 2, conciliados: 1, auditoria: 1 });
    expect(r.resumo.mensagens).toEqual([`COD RETORNO DESCONHECIDO: CPF=${CPF_MARIA}`]);
  });

  it("erro inesperado no 2.º detalhe → para, o 1.º fica gravado, resumo parcial; só nome/código no log", async () => {
    await pagamento(1, 10000);
    await pagamento(2, 10000);
    await pagamento(3, 10000);
    let chamadas = 0;
    const falhaNoSegundo = new Proxy(prisma, {
      get(alvo, prop, receptor) {
        if (prop !== "$transaction") return Reflect.get(alvo, prop, receptor);
        return (...args: unknown[]) => {
          chamadas += 1;
          if (chamadas === 2) return Promise.reject(Object.assign(new Error(`dados ${CPF_MARIA}`), { code: "P9999" }));
          return (alvo.$transaction as (...a: unknown[]) => unknown)(...args);
        };
      },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await conciliarRetorno(
        { competencia: COMP, conteudo: arquivoRetorno([det(1, 10000), det(2, 10000), det(3, 10000)]) },
        { db: falhaNoSegundo, agora: AGORA },
      );
      expect(r).toMatchObject({
        ok: false,
        mensagem: "CONCILIACAO INTERROMPIDA: ERRO INESPERADO",
        resumo: { lidos: 4, detalhes: 2, conciliados: 1, auditoria: 1, divergentes: 0, naoEncontrados: 0 },
      });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]).toEqual(["[conciliacao] erro inesperado:", "Error", "P9999"]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_MARIA);
    } finally {
      log.mockRestore();
    }
    const ps = await prisma.pagamento.findMany({ orderBy: { numPagamento: "asc" } });
    expect(ps.map((p) => p.sitPagamento)).toEqual(["P", "G", "G"]);
    expect(await prisma.auditoria.findMany()).toMatchObject([{ idEntidade: "1", codAcao: "CO" }]);
    // O cadeado foi liberado.
    expect((await conciliar(arquivoRetorno([det(2, 10000)]))).ok).toBe(true);
  });

  it("o mesmo pagamento duas vezes no arquivo (00 e depois 01) → situação final D, dois CO", async () => {
    await pagamento(1, 10000);
    const r = await conciliar(arquivoRetorno([det(1, 10000, { codRet: "00" }), det(1, 10000, { codRet: "01" })]));
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 2, auditoria: 2 } });
    // O 00 gravou data e banco; o 01 só troca situação e código (não limpa os demais).
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({
      sitPagamento: "D",
      codRetornoBanco: "01",
      dtPagamento: 25092026,
      codBanco: "1",
    });
    expect((await prisma.auditoria.findMany({ orderBy: { numAuditoria: "asc" } })).map((a) => [a.codAcao, a.desAcao])).toEqual([
      ["CO", "CONCILIADO COD RET=00"],
      ["CO", "CONCILIADO COD RET=01"],
    ]);
  });

  it("arquivo só com CR e linhas em branco no meio → todas lidas", async () => {
    await pagamento(1, 10000);
    const conteudo = [linhaControle("0"), "", "   ", linhaDetalhe(det(1, 10000)), linhaControle("9")].join("\r") + "\r";
    expect(await conciliar(conteudo)).toMatchObject({ ok: true, resumo: { lidos: 5, detalhes: 1, conciliados: 1 } });
  });
});

describe("conciliarRetornoAction", () => {
  const form = (competencia: string, arquivo?: File) => {
    const f = new FormData();
    f.set("competencia", competencia);
    if (arquivo) f.set("arquivo", arquivo);
    return f;
  };
  const arquivo = (conteudo: string, nome = "retorno.ret") => new File([conteudo], nome, { type: "text/plain" });

  it("valida competência e arquivo (presença, extensão, 5 MB)", async () => {
    const ok = arquivo(arquivoRetorno([]));
    expect(await conciliarRetornoAction(null, form("199213", ok))).toMatchObject({ ok: false, campo: "competencia" });
    expect(await conciliarRetornoAction(null, form("199201"))).toMatchObject({ ok: false, campo: "arquivo" });
    expect(await conciliarRetornoAction(null, form("199201", arquivo("", "vazio.ret")))).toMatchObject({ ok: false, campo: "arquivo" });
    expect(await conciliarRetornoAction(null, form("199201", arquivo("x", "retorno.csv")))).toMatchObject({
      ok: false,
      campo: "arquivo",
      mensagem: "O arquivo de retorno deve ter extensão .ret ou .txt.",
    });
    const grande = arquivo("0".repeat(5 * 1024 * 1024 + 1), "grande.txt");
    expect(await conciliarRetornoAction(null, form("199201", grande))).toMatchObject({
      ok: false,
      campo: "arquivo",
      mensagem: "O arquivo de retorno excede o limite de 5 MB.",
    });
  });

  it("concilia e devolve o resumo com CPF mascarado", async () => {
    await pagamento(1, 10000);
    await pagamento(2, 10000);
    const conteudo = arquivoRetorno([det(1, 10000), det(2, 12000), det(3, 10000), det(1, 10000, { codRet: "77" })]);
    const r = await conciliarRetornoAction(null, form("199201", arquivo(conteudo, "RETORNO.TXT")));
    if (!r?.ok) throw new Error("falhou");
    expect(r.resumo).toMatchObject({ lidos: 8, conciliados: 2, divergentes: 1, naoEncontrados: 1, auditoria: 3, detalhes: 4 });
    expect(r.resumo.divergencias).toEqual([{ numPagamento: 2, cpf: "***.***.678-90", vlrSifap: 10000, vlrBanco: 12000 }]);
    expect(r.resumo.listaNaoEncontrados).toEqual([{ cpf: "***.***.678-90", documento: "0000000003" }]);
    expect(r.resumo.avisos).toEqual(["COD RETORNO DESCONHECIDO: 77 CPF=***.***.678-90"]);
    expect(JSON.stringify(r)).not.toContain(CPF_MARIA);
  });

  it("decodifica o upload como Latin-1: nome acentuado não desloca as posições", async () => {
    await pagamento(1, 10000);
    const conteudo = arquivoRetorno([det(1, 10000, { nome: "JOÃO DA CONCEIÇÃO", codRet: "02" })]);
    const bytes = Buffer.from(conteudo, "latin1");
    const r = await conciliarRetornoAction(null, form("199201", new File([bytes], "retorno.ret")));
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 1, naoEncontrados: 0, avisos: [] } });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({ sitPagamento: "E", codRetornoBanco: "02" });
  });
});
