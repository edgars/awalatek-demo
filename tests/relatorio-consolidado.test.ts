import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Beneficiario, PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { createPrismaClient } from "@/server/db";
import { relatorioConsolidado } from "@/server/relatorioConsolidado";
import * as modulo from "@/server/relatorioConsolidado";
import RelatorioConsolidadoPage from "@/app/relatorios/consolidado/page";
import { ERRO_INESPERADO } from "@/app/relatorios/consolidado/falha";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Informe consolidado mensual (story 7.2) contra una base SQLite temporal.

let dir: string;
let prisma: PrismaClient;
let modeloBenef: Omit<Beneficiario, "id">;
const REGIOES = [3, 7, 12, 18, 22, 99] as const;
const cpfRegiao = (r: number) => completaDv(`7720000${String(r).padStart(2, "0")}`);
const AGORA = new Date("2026-09-25T15:00:00Z");

function pagamento(numPagamento: number, numCpf: string, over: Record<string, unknown> = {}) {
  return {
    numPagamento,
    numCpf,
    codPrograma: "PA01",
    anoMesRef: 201101,
    vlrBruto: 10000,
    vlrLiquido: 9500,
    vlrDescontoTotal: 500,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 20110101,
    hrGeracao: 101500,
    ...over,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-consol-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
  const modelo = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpfComDv(BENEFICIARIOS_SEED[0].base) } });
  const { id: _id, ...dados } = modelo;
  void _id;
  modeloBenef = { ...dados, nis: null };
  for (const r of REGIOES) {
    await prisma.beneficiario.create({ data: { ...dados, nis: null, numCpf: cpfRegiao(r), codRegiao: r } });
  }
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Configuração explícita: os testes existentes rodam em modo legado mesmo com
  // SIFAP_QUIRKS_CORRIGIDOS=ALL no ambiente; os de correção a sobrescrevem.
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  await prisma.pagamento.deleteMany();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("relatorioConsolidado", () => {
  it("sem pagamentos → todas as linhas em zero e data de emissão", async () => {
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.competencia).toBe(201101);
    expect(r.dataEmissao).toBe(20260925);
    expect(r.regioes.map((x) => x.nome)).toEqual(["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE"]);
    expect(r.regioes.every((x) => x.qtd === 0 && x.bruto === 0 && x.desconto === 0 && x.liquido === 0)).toBe(true);
    expect(r.status.map((x) => x.nome)).toEqual(["GERADO", "PAGO", "CANCELADO", "DEVOLVIDO", "ESTORNADO"]);
    expect(r.status.every((x) => x.qtd === 0 && x.bruto === 0)).toBe(true);
    expect(r.total).toEqual({ qtd: 0, bruto: 0, desconto: 0, liquido: 0 });
  });

  it("agrupa por região do beneficiário (D10), status desconhecido → GERADO, outra competência excluída", async () => {
    let n = 1;
    for (const r of REGIOES) {
      await prisma.pagamento.create({ data: pagamento(n++, cpfRegiao(r), { sitPagamento: r === 99 ? "X" : "P" }) });
    }
    await prisma.pagamento.create({ data: pagamento(n++, cpfRegiao(3), { anoMesRef: 201102, vlrBruto: 99999 }) });

    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.regioes.map((x) => [x.nome, x.qtd, x.bruto, x.desconto, x.liquido])).toEqual([
      ["NORTE", 1, 10000, 500, 9500],
      ["NORDESTE", 1, 10000, 500, 9500],
      ["SUDESTE", 1, 10000, 500, 9500],
      ["SUL", 1, 10000, 500, 9500],
      ["CENTRO-OESTE", 2, 20000, 1000, 19000],
    ]);
    expect(r.status.map((x) => [x.codigo, x.qtd, x.bruto])).toEqual([
      ["G", 1, 10000],
      ["P", 5, 50000],
      ["C", 0, 0],
      ["D", 0, 0],
      ["E", 0, 0],
    ]);
    expect(r.total).toEqual({ qtd: 6, bruto: 60000, desconto: 3000, liquido: 57000 });
  });

  it("pagamento de CPF sem beneficiário → CENTRO-OESTE", async () => {
    // A FK impede o caso na base; ele é simulado desligando as FKs só neste teste.
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    try {
      await prisma.pagamento.create({ data: pagamento(50, completaDv("772999999")) });
    } finally {
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    }
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.regioes[4]).toEqual({ nome: "CENTRO-OESTE", qtd: 1, bruto: 10000, desconto: 500, liquido: 9500 });
    expect(r.total.qtd).toBe(1);
  });

  it("somente leitura: o módulo não exporta escritas", () => {
    expect(Object.keys(modulo).sort()).toEqual(["LOTE_CPFS", "relatorioConsolidado"]);
  });
});

describe("relatorioConsolidado — lotes de CPFs", () => {
  const COMP = 201201;

  async function criar(prefixo: string, cods: readonly number[], inicio: number) {
    const cpfs = cods.map((_, i) => completaDv(`${prefixo}${String(i).padStart(9 - prefixo.length, "0")}`));
    await prisma.beneficiario.deleteMany({ where: { numCpf: { in: cpfs } } });
    await prisma.beneficiario.createMany({
      data: cods.map((codRegiao, i) => ({ ...modeloBenef, numCpf: cpfs[i] ?? "", codRegiao })),
    });
    await prisma.pagamento.createMany({
      data: cpfs.map((cpf, i) => pagamento(inicio + i, cpf, { anoMesRef: COMP })),
    });
    return cpfs;
  }

  const qtdPorRegiao = (r: Awaited<ReturnType<typeof relatorioConsolidado>>) => r.regioes.map((x) => x.qtd);

  it("lote de 3 com 8 beneficiários → cada um na sua região (nenhum sobra em CENTRO-OESTE)", async () => {
    const cods = [1, 2, 6, 7, 11, 16, 17, 20] as const;
    await criar("7731", cods, 1000);
    const r = await relatorioConsolidado(COMP, prisma, { agora: AGORA, loteCpfs: 3 });
    expect(qtdPorRegiao(r)).toEqual([2, 2, 1, 3, 0]);
    expect(r.total.qtd).toBe(8);
    // Mesmo resultado com o lote padrão.
    const padrao = await relatorioConsolidado(COMP, prisma, { agora: AGORA });
    expect(padrao.regioes).toEqual(r.regioes);
  });

  it("501 CPFs com o lote padrão (500) → segundo lote também resolvido", async () => {
    const cods = Array.from({ length: 501 }, (_, i) => [1, 6, 11, 16][i % 4] as number);
    await criar("774", cods, 2000);
    const r = await relatorioConsolidado(COMP, prisma, { agora: AGORA });
    expect(qtdPorRegiao(r)).toEqual([126, 125, 125, 125, 0]);
    expect(r.total.qtd).toBe(501);
  });

  it("lote inválido → erro", async () => {
    await expect(relatorioConsolidado(COMP, prisma, { loteCpfs: 0 })).rejects.toThrow();
  });
});

describe("relatorioConsolidado — correções configuráveis (SIFAP_QUIRKS_CORRIGIDOS)", () => {
  async function criarPorRegiao() {
    let n = 1;
    for (const r of REGIOES) await prisma.pagamento.create({ data: pagamento(n++, cpfRegiao(r), { vlrBruto: 10000 + r }) });
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    try {
      await prisma.pagamento.create({ data: pagamento(n++, completaDv("772999999")) });
    } finally {
      await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    }
  }

  it("CORRECAO(D10): 22 → CENTRO-OESTE; 99 e inexistente → NAO CLASSIFICADA (6 linhas)", async () => {
    await criarPorRegiao();
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D10");
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    expect(r.regioes.map((x) => [x.nome, x.qtd])).toEqual([
      ["NORTE", 1],
      ["NORDESTE", 1],
      ["SUDESTE", 1],
      ["SUL", 1],
      ["CENTRO-OESTE", 1],
      ["NAO CLASSIFICADA", 2],
    ]);
    expect(r.regioes[5]).toEqual({ nome: "NAO CLASSIFICADA", qtd: 2, bruto: 10099 + 10000, desconto: 1000, liquido: 19000 });
    expect(r.total.qtd).toBe(7);
  });

  it("CORRECAO(D11): bruto de região/geral = soma do bruto cru (fecha com o total por status)", async () => {
    await criarPorRegiao();
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D11");
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA });
    const cru = REGIOES.reduce((s, x) => s + 10000 + x, 0) + 10000;
    expect(r.total.bruto).toBe(cru);
    expect(r.status.reduce((s, x) => s + x.bruto, 0)).toBe(cru);
    // Só D11: continuam 5 linhas, com 22/99/inexistente em CENTRO-OESTE.
    expect(r.regioes).toHaveLength(5);
    expect(r.regioes[4]?.qtd).toBe(3);
  });

  it("configuração explícita prevalece sobre o ambiente", async () => {
    await criarPorRegiao();
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL");
    const r = await relatorioConsolidado(201101, prisma, { agora: AGORA, quirks: { corrigidos: new Set() } });
    expect(r.regioes).toHaveLength(5);
  });

  it("página: configuração inválida → mensagem genérica e log de configuração sem dados", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D99");
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const el = await RelatorioConsolidadoPage({ searchParams: Promise.resolve({ competencia: "201101" }) });
      expect(JSON.stringify(el)).toContain(ERRO_INESPERADO);
      expect(erroLog).toHaveBeenCalledWith(expect.stringContaining("configuração LEGACY-QUIRK inválida"));
    } finally {
      erroLog.mockRestore();
    }
  });

  it("configuração inválida → erro de configuração", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D99");
    await expect(relatorioConsolidado(201101, prisma, { agora: AGORA })).rejects.toThrow(/configuração LEGACY-QUIRK inválida/);
  });
});
