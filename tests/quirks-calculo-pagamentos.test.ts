import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calcularBeneficioAction } from "@/app/calculo/actions";
import { conciliarRetornoAction } from "@/app/conciliacao/actions";
import { corrigirPagamentosAction } from "@/app/correcao/actions";
import { recalcularDescontosAction } from "@/app/descontos/actions";
import { executarLoteAction } from "@/app/lote/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv, mascaraCpfLista } from "@/domain/cpf";
import { competenciaDaData } from "@/domain/calculo/motor";
import { hoje } from "@/domain/legacyDate";
import { createPrismaClient } from "@/server/db";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";
import { main as cliLote } from "../scripts/lote-pagamentos";
import { arquivoRetorno, type DetalheCnab } from "./fixtures/cnab240";

// Correcciones configurables del grupo B (D8, D9, D13, D17, D22, D23) a nivel de
// servidor: la acción lee SIFAP_QUIRKS_CORRIGIDOS una vez por solicitud y la
// configuración llega al dominio. Base SQLite temporal.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // PA01, único A do seed
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-quirks-b-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.stubEnv("DATABASE_URL", url);
  vi.stubEnv("SIFAP_USER", "OPERADR1");
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  await seed(prisma);
});

beforeEach(async () => {
  await prisma.pagamentoDesconto.deleteMany();
  await prisma.pagamento.deleteMany();
  await prisma.auditoria.deleteMany();
});

afterEach(() => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

function form(campos: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

let proximoNum = 1000;
async function pagamento(dados: {
  numCpf?: string;
  anoMesRef: number;
  vlrBruto: number;
  vlrLiquido?: number;
  vlrDescontoTotal?: number;
  numPagamento?: number;
  sitPagamento?: string;
  vlrCorrecao?: number;
  indCorrigido?: string;
}) {
  return prisma.pagamento.create({
    data: {
      numPagamento: dados.numPagamento ?? proximoNum++,
      numCpf: dados.numCpf ?? CPF_MARIA,
      codPrograma: "PA01",
      anoMesRef: dados.anoMesRef,
      vlrBruto: dados.vlrBruto,
      vlrLiquido: dados.vlrLiquido ?? dados.vlrBruto,
      vlrDescontoTotal: dados.vlrDescontoTotal ?? 0,
      sitPagamento: dados.sitPagamento ?? "G",
      vlrCorrecao: dados.vlrCorrecao ?? null,
      indCorrigido: dados.indCorrigido ?? null,
      dtGeracao: 20260901,
      hrGeracao: 100000,
      usrInclusao: "TESTE",
    },
  });
}

async function novoBeneficiario(base9: string, renda: number): Promise<string> {
  const numCpf = completaDv(base9);
  await prisma.beneficiario.create({
    data: {
      numCpf,
      nomeCompleto: `QUIRK TESTE ${base9}`,
      dtNascimento: 19900101,
      sexo: "F",
      codRegiao: 11,
      codPrograma: "PA01",
      dtCadastro: 20250101,
      sitBeneficiario: "A",
      vlrRendaFamiliar: renda,
      numDependentes: 0,
    },
  });
  return numCpf;
}

describe("configuração inválida → erro genérico, log sem PII, nada gravado", () => {
  it("todas as ações do grupo B", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D99");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const retorno = new File([arquivoRetorno([{ cpf: CPF_MARIA, numDoc: 1, valor: 100 }])], "r.ret");
      const resultados = [
        await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "202609" })),
        await executarLoteAction(),
        await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201112" })),
        await recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: "1" })),
        await conciliarRetornoAction(null, form({ competencia: "199201", arquivo: retorno })),
      ];
      for (const r of resultados) expect(r).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
      expect(await prisma.pagamento.count()).toBe(0);
      const logado = JSON.stringify(log.mock.calls);
      // O log nomeia a variável e o valor ofensivos (configuração, sem PII).
      expect(logado).toContain("configuração LEGACY-QUIRK inválida");
      expect(logado).toContain("SIFAP_QUIRKS_CORRIGIDOS");
      expect(logado).not.toContain(CPF_MARIA);
    } finally {
      log.mockRestore();
    }
  });
});

describe("CLI do lote — configuração inválida", () => {
  it("sai com código 2, sem tocar a base e sem PII no log", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const saida = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await cliLote({ SIFAP_QUIRKS_CORRIGIDOS: "D99" })).toBe(2);
      expect(await prisma.pagamento.count()).toBe(0);
      expect(saida).not.toHaveBeenCalled();
      const logado = JSON.stringify(erro.mock.calls);
      expect(logado).toContain("configuração LEGACY-QUIRK inválida");
      expect(logado).toContain("SIFAP_QUIRKS_CORRIGIDOS");
      expect(logado).not.toContain(CPF_MARIA);
    } finally {
      erro.mockRestore();
      saida.mockRestore();
    }
  });
});

describe("D8 — cálculo individual e lote com a mesma configuração", () => {
  it("legado (lista vazia): MARIA 09/2026 → 122,20", async () => {
    const r = await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "202609" }));
    expect(r).toMatchObject({ ok: true, resumo: { vlrBruto: 12220, vlrLiquido: 12220 } });
  });

  it("D8: não reaplica o reajuste → 150,00 × 1,35 × 1,05 × 0,55 = 116,94 (sem × 1,045)", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D8");
    const r = await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: "202609" }));
    expect(r).toMatchObject({ ok: true, resumo: { vlrBruto: 11694, vlrDesconto: 0, vlrLiquido: 11694 } });
    if (!r?.ok) return;
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: r.resumo.numPagamento } })).toMatchObject({
      vlrBruto: 11694,
      vlrLiquido: 11694,
    });
  });

  it("D8: o lote grava o mesmo valor que o individual", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const lote = await executarLoteAction();
      expect(lote).toMatchObject({ ok: true, resumo: { gerados: 1, vlrTotalBruto: 11694 } });
      const comp = competenciaDaData(hoje().data);
      const p = await prisma.pagamento.findFirstOrThrow({ where: { numCpf: CPF_MARIA, anoMesRef: comp } });
      const ind = await calcularBeneficioAction(null, form({ numCpf: CPF_MARIA, competencia: String(comp) }));
      expect(ind).toMatchObject({ ok: true, resumo: { vlrBruto: p.vlrBruto, vlrLiquido: p.vlrLiquido } });
    } finally {
      log.mockRestore();
    }
  });
});

describe("D17 — renda > 9.999,99 no lote", () => {
  async function cenario(lista: string) {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", lista);
    // Ordem por CPF: MARIA → B1 renda 500,00 (0,85) → B2 renda 20.000,00 (sem faixa).
    const b1 = await novoBeneficiario("500000001", 50000);
    const b2 = await novoBeneficiario("500000002", 2000000);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const lote = await executarLoteAction();
      expect(lote).toMatchObject({ ok: true, resumo: { gerados: 3, erros: 0 } });
      const comp = competenciaDaData(hoje().data);
      const p2 = await prisma.pagamento.findFirstOrThrow({ where: { numCpf: b2, anoMesRef: comp } });
      const ind = await calcularBeneficioAction(null, form({ numCpf: b2, competencia: String(comp) }));
      return { p2, ind, lote, b2 };
    } finally {
      log.mockRestore();
      await prisma.pagamento.deleteMany({ where: { numCpf: { in: [b1, b2] } } });
      await prisma.beneficiario.deleteMany({ where: { numCpf: { in: [b1, b2] } } });
    }
  }

  it("legado: o lote arrasta o fator 0,85 (bruto > 0) e diverge do individual (0)", async () => {
    const { p2, ind, lote } = await cenario("");
    expect(lote).toMatchObject({ ok: true, resumo: { beneficiosZero: 0, avisosBeneficioZero: [] } });
    expect(p2.vlrBruto).toBeGreaterThan(0);
    expect(ind).toMatchObject({ ok: true, resumo: { vlrBruto: 0 } });
  });

  it("D17: o lote não arrasta → 0, igual ao individual; aviso BENEFICIO ZERO contado no resumo", async () => {
    const { p2, ind, lote, b2 } = await cenario("D17");
    expect(lote).toMatchObject({
      ok: true,
      resumo: { gerados: 3, beneficiosZero: 1, avisosBeneficioZero: [`BENEFICIO ZERO: CPF=${mascaraCpfLista(b2)}`] },
    });
    expect(JSON.stringify(lote)).not.toContain(b2);
    expect(p2).toMatchObject({ vlrBruto: 0, vlrLiquido: 0 });
    expect(ind).toMatchObject({ ok: true, resumo: { vlrBruto: 0, vlrLiquido: 0 } });
  });
});

describe("D9 — ano sem IPCA na correção retroativa", () => {
  it("legado: sem aviso e sem campo avisos", async () => {
    await pagamento({ anoMesRef: 202001, vlrBruto: 10000 });
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "202001", compFim: "202001" }));
    expect(r).toEqual({ ok: true, mensagem: "CORRECAO RETROATIVA FINALIZADA", qtdRegistros: 0, vlrTotal: 0, corrigidos: [] });
  });

  it("D9: aviso SEM INDICE IPCA; o pagamento não é marcado nem contado", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D9");
    const fora = await pagamento({ anoMesRef: 200912, vlrBruto: 10000 });
    const dentro = await pagamento({ anoMesRef: 201101, vlrBruto: 10000 });
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "200901", compFim: "201112" }));
    expect(r).toMatchObject({
      ok: true,
      qtdRegistros: 1,
      vlrTotal: 83,
      avisos: [`SEM INDICE IPCA: COMP=200912 PGTO=${fora.numPagamento}`],
    });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: fora.id } })).toMatchObject({ vlrCorrecao: null, indCorrigido: null });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: dentro.id } })).toMatchObject({ vlrCorrecao: 10083, indCorrigido: "S" });
  });
});

describe("D22 — leitura por CPF sem parada antecipada", () => {
  it("legado: competência > final lida antes encerra o recorrido", async () => {
    await pagamento({ anoMesRef: 201205, vlrBruto: 10000 });
    await pagamento({ anoMesRef: 201101, vlrBruto: 10000 });
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201112" }));
    expect(r).toMatchObject({ ok: true, qtdRegistros: 0 });
  });

  it("D22: corrige os pagamentos do período, em ordem de competência", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D22");
    const depois = await pagamento({ anoMesRef: 201205, vlrBruto: 10000 });
    const mar = await pagamento({ anoMesRef: 201103, vlrBruto: 10000 });
    const jan = await pagamento({ anoMesRef: 201101, vlrBruto: 10000 });
    const r = await corrigirPagamentosAction(null, form({ numCpf: CPF_MARIA, compIni: "201101", compFim: "201112" }));
    expect(r).toMatchObject({ ok: true, qtdRegistros: 2 });
    if (!r?.ok) return;
    expect(r.corrigidos.map((c) => [c.numPagamento, c.competencia])).toEqual([
      [jan.numPagamento, 201101],
      [mar.numPagamento, 201103],
    ]);
    expect(r).not.toHaveProperty("avisos");
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: depois.id } })).toMatchObject({ indCorrigido: null });
  });
});

describe("D13 — CALCDSCT recalcula o líquido", () => {
  // Bruto 800,00: contribuição social 5 % = 40,00 + judicial fixo 50,00 = 90,00 (o total
  // do CALCDSCT inclui a contribuição; teto 30 % = 240,00 não corta) → líquido 710,00.
  async function preparar(extra: { sitPagamento?: string; vlrCorrecao?: number; indCorrigido?: string } = {}) {
    const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_MARIA } });
    await prisma.beneficiarioDesconto.deleteMany({ where: { beneficiarioId: b.id } });
    await prisma.beneficiarioDesconto.create({
      data: { beneficiarioId: b.id, occurrence: 1, tipoDesconto: "J", vlrDesconto: 5000, pctDesconto: "0.00", dtInicioDsct: 20250101, dtFimDsct: 0 },
    });
    return pagamento({ anoMesRef: 202609, vlrBruto: 80000, vlrLiquido: 77600, vlrDescontoTotal: 2400, ...extra });
  }
  const recalcular = (numPagamento: number) => recalcularDescontosAction(null, form({ numCpf: CPF_MARIA, numPagamento: String(numPagamento) }));

  it("legado: só o desconto muda; líquido intacto, sem liquidoRecalculado", async () => {
    const p = await preparar();
    const r = await recalcular(p.numPagamento);
    expect(r).toMatchObject({ ok: true, resumo: { vlrDesconto: 9000, vlrContribuicao: 4000, vlrLiquido: 77600 } });
    expect(r).not.toHaveProperty("resumo.liquidoRecalculado");
    expect(r).not.toHaveProperty("resumo.avisoLiquido");
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ vlrDescontoTotal: 9000, vlrLiquido: 77600 });
  });

  it("D13 (status G): grava vlrLiquido = 800,00 − 90,00 = 710,00 e o informa", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D13");
    const p = await preparar();
    const r = await recalcular(p.numPagamento);
    expect(r).toMatchObject({ ok: true, resumo: { vlrBruto: 80000, vlrContribuicao: 4000, vlrDesconto: 9000, vlrLiquido: 71000, liquidoRecalculado: true } });
    expect(r).not.toHaveProperty("resumo.avisoLiquido");
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ vlrDescontoTotal: 9000, vlrLiquido: 71000 });
  });

  it.each(["P", "D", "E", "C"])("D13 (status %s): líquido não é alterado; aviso LIQUIDO NAO RECALCULADO", async (sit) => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D13");
    const p = await preparar({ sitPagamento: sit });
    const r = await recalcular(p.numPagamento);
    expect(r).toMatchObject({
      ok: true,
      resumo: { vlrDesconto: 9000, vlrLiquido: 77600, avisoLiquido: `LIQUIDO NAO RECALCULADO: PAGAMENTO COM STATUS ${sit}` },
    });
    expect(r).not.toHaveProperty("resumo.liquidoRecalculado");
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ vlrDescontoTotal: 9000, vlrLiquido: 77600 });
  });

  it("D13 com correção IPCA (vlrCorrecao, S): o líquido parte do bruto ORIGINAL; a correção fica intacta", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D13");
    const p = await preparar({ vlrCorrecao: 80664, indCorrigido: "S" });
    const r = await recalcular(p.numPagamento);
    expect(r).toMatchObject({ ok: true, resumo: { vlrBruto: 80000, vlrDesconto: 9000, vlrLiquido: 71000, liquidoRecalculado: true } });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      vlrBruto: 80000,
      vlrLiquido: 71000,
      vlrCorrecao: 80664,
      indCorrigido: "S",
    });
  });
});

describe("D23 — data de pagamento do retorno", () => {
  const COMP = 199201;
  const det = (numDoc: number, extra: Partial<DetalheCnab> = {}): DetalheCnab => ({ cpf: CPF_MARIA, numDoc, valor: 10000, ...extra });
  const enviar = (detalhes: DetalheCnab[]) =>
    conciliarRetornoAction(null, form({ competencia: String(COMP), arquivo: new File([arquivoRetorno(detalhes)], "retorno.ret") }));

  it("legado: DDMMAAAA gravada sem conversão, sem avisos de data", async () => {
    await pagamento({ numPagamento: 1, anoMesRef: COMP, vlrBruto: 10000 });
    const r = await enviar([det(1, { dtPgto: "10011992" })]);
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 1, avisosDataPagamento: [] } });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({ dtPagamento: 10011992 });
  });

  it("D23: DDMMAAAA → AAAAMMDD; inválida → 0 + aviso no resultado", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D23");
    await pagamento({ numPagamento: 1, anoMesRef: COMP, vlrBruto: 10000 });
    await pagamento({ numPagamento: 2, anoMesRef: COMP, vlrBruto: 10000 });
    const r = await enviar([det(1, { dtPgto: "10011992" }), det(2, { dtPgto: "31021992" })]);
    expect(r).toMatchObject({ ok: true, resumo: { conciliados: 2, avisosDataPagamento: ["DATA PAGAMENTO INVALIDA: DOC=2"] } });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 1 } })).toMatchObject({ sitPagamento: "P", dtPagamento: 19920110 });
    expect(await prisma.pagamento.findUniqueOrThrow({ where: { numPagamento: 2 } })).toMatchObject({ sitPagamento: "P", dtPagamento: 0 });
    expect(JSON.stringify(r)).not.toContain(CPF_MARIA);
  });
});
