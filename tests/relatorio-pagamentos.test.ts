import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { relatorioPagamentos } from "@/server/relatorios";
import * as modulo from "@/server/relatorios";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Informe analítico de pagos (RELPGT, story 7.1) contra una base SQLite temporal.

let dir: string;
let prisma: PrismaClient;

/** Informe completo (dentro do limite de linhas); falha o teste se o limite foi excedido. */
function completo<T extends { limiteExcedido: boolean }>(r: T): Extract<T, { limiteExcedido: false }> {
  if (r.limiteExcedido) throw new Error("limite de linhas excedido");
  return r as Extract<T, { limiteExcedido: false }>;
}
const CPF_A = cpfComDv(BENEFICIARIOS_SEED[0].base); // MARIA, PA01
const CPF_B = cpfComDv(BENEFICIARIOS_SEED[1].base); // JOSE, PP01
const AGORA = new Date("2026-09-25T15:00:00Z");

function pagamento(numPagamento: number, over: Record<string, unknown> = {}) {
  return {
    numPagamento,
    numCpf: CPF_A,
    codPrograma: "PA01",
    anoMesRef: 201101,
    vlrBruto: 50000,
    vlrLiquido: 48500,
    vlrDescontoTotal: 1500,
    vlrAbono: 1000,
    tipoPgto: "N",
    sitPagamento: "G",
    dtGeracao: 20110101,
    hrGeracao: 101500,
    ...over,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-relpgt-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  await seed(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.pagamento.deleteMany();
});

const ANO_2011 = { compIni: 201101, compFim: 201112, programa: "" };

describe("falhaInesperada (relatório de pagamentos)", () => {
  it("devolve a mensagem genérica e só registra nome e código do erro, sem CPF", () => {
    const erro = Object.assign(new Error(`falha na consulta numCpf = ${CPF_A}`), { name: "PrismaClientKnownRequestError", code: "P2025" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(falhaInesperada("relatorio-pagamentos", "relatorio", erro)).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
      expect(spy).toHaveBeenCalledTimes(1);
      const args = JSON.stringify(spy.mock.calls[0]);
      expect(args).toContain("PrismaClientKnownRequestError");
      expect(args).toContain("P2025");
      expect(args).not.toContain(CPF_A);
      expect(args).not.toContain("falha na consulta");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("relatorioPagamentos", () => {
  it("lê o período em ordem competência → programa → nº, com corte, nome, UF e máscara", async () => {
    await prisma.pagamento.createMany({
      data: [
        pagamento(3, { anoMesRef: 201102, codPrograma: "PP01", numCpf: CPF_B, sitPagamento: "C", tipoPgto: "D" }),
        pagamento(2, { anoMesRef: 201102, codPrograma: "PA01" }),
        pagamento(1, { anoMesRef: 201101, codPrograma: "PP01", numCpf: CPF_B }),
        pagamento(4, { anoMesRef: 201012 }),
        pagamento(5, { anoMesRef: 201201 }),
      ],
    });
    const r = completo(await relatorioPagamentos(ANO_2011, prisma, AGORA));
    expect(r.linhas.map((l) => (l.tipo === "detalhe" ? `d${l.numPagamento}` : `s:${l.codPrograma}`))).toEqual(["d1", "s:PP01", "d2", "s:PA01", "d3", "s:PP01"]);
    expect(r.linhas[0]).toMatchObject({ cpfMascarado: "***.456.780-62", nome: "JOSE CARLOS PEREIRA", uf: "SP", statusDesc: "GERADO", tipoDesc: "NORMAL" });
    expect(r.linhas[4]).toMatchObject({ statusDesc: "CANCELAD", tipoDesc: "DECIMO" });
    expect(r.total).toEqual({ qtd: 3, bruto: 150000, desconto: 4500, liquido: 145500, abono: 3000 });
    expect(r.paginas).toHaveLength(1);
    expect(r.dataEmissao).toBe(20260925);
    expect(JSON.stringify(r)).not.toContain(CPF_A);
    expect(JSON.stringify(r)).not.toContain(CPF_B);
  });

  it("filtro de programa e período invertido", async () => {
    await prisma.pagamento.createMany({
      data: [pagamento(1), pagamento(2, { codPrograma: "PP01", numCpf: CPF_B }), pagamento(3)],
    });
    const r = completo(await relatorioPagamentos({ ...ANO_2011, programa: "PA01" }, prisma, AGORA));
    expect(r.total.qtd).toBe(2);
    expect(r.linhas.filter((l) => l.tipo === "subtotal")).toEqual([{ tipo: "subtotal", codPrograma: "PA01", qtd: 2, bruto: 100000, liquido: 97000 }]);
    const inv = completo(await relatorioPagamentos({ compIni: 201112, compFim: 201101, programa: "" }, prisma, AGORA));
    expect(inv.linhas).toEqual([]);
    expect(inv.total.qtd).toBe(0);
  });

  it("sem pagamentos → sem páginas e totais zero", async () => {
    const r = completo(await relatorioPagamentos(ANO_2011, prisma, AGORA));
    expect(r).toMatchObject({ linhas: [], paginas: [], total: { qtd: 0, bruto: 0, desconto: 0, liquido: 0, abono: 0 } });
  });

  it("60 pagamentos → página 1 com 55 e página 2 com 5", async () => {
    await prisma.pagamento.createMany({ data: Array.from({ length: 60 }, (_, i) => pagamento(i + 1)) });
    const r = completo(await relatorioPagamentos(ANO_2011, prisma, AGORA));
    expect(r.paginas.map((p) => p.filter((l) => l.tipo === "detalhe").length)).toEqual([55, 5]);
  });

  it("somente leitura: o módulo não exporta escrita e não altera a base", async () => {
    await prisma.pagamento.createMany({ data: [pagamento(1)] });
    const antes = await prisma.pagamento.findMany();
    await relatorioPagamentos(ANO_2011, prisma, AGORA);
    expect(await prisma.pagamento.findMany()).toEqual(antes);
    expect(Object.keys(modulo)).toContain("relatorioPagamentos");
    expect(Object.keys(modulo).filter((k) => /incluir|alterar|excluir|salvar|gravar|registrar|criar|atualizar/i.test(k))).toEqual([]);
  });
});
