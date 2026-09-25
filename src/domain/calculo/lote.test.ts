import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { competenciaDaData } from "./motor";
import {
  acumularGerado,
  acumularSelecao,
  deveRegistrarProgresso,
  linhasResumo,
  mensagemProgramaNaoEncontrado,
  mensagemProgresso,
  novoResumo,
  selecionarBeneficiario,
  type EntradaSelecao,
} from "./lote";

// Story 4.2 — reglas de selección del lote (BATCHPGT, FR-LOT-02/04).

const CPF = "01234567890";
const base: EntradaSelecao = {
  numCpf: CPF,
  cpfAnterior: null,
  sitBeneficiario: "A",
  codPrograma: "PA01",
  jaGerado: false,
  programa: { sitPrograma: "A" },
};

describe("selecionarBeneficiario (FR-LOT-02)", () => {
  it("ativo, sem pagamento na competência, programa ativo → calcular", () => {
    expect(selecionarBeneficiario(base)).toEqual({ acao: "calcular" });
  });

  it("RK-7d3e373f4754 (BATCHPGT:188) — CPF igual ao anterior → ignorado", () => {
    expect(selecionarBeneficiario({ ...base, cpfAnterior: CPF })).toEqual({ acao: "ignorar", motivo: "CPF_REPETIDO" });
    expect(selecionarBeneficiario({ ...base, cpfAnterior: "00000000000" })).toEqual({ acao: "calcular" });
  });

  it("RK-bf3826b5e614 (BATCHPGT:195) — status ≠ A → ignorado", () => {
    for (const sit of ["S", "C", "I", "D"]) {
      expect(selecionarBeneficiario({ ...base, sitBeneficiario: sit })).toEqual({ acao: "ignorar", motivo: "NAO_ATIVO" });
    }
  });

  it("RK-644073d95848 (BATCHPGT:203) / RK-684b2581729a (BATCHPGT:207) — já gerado na competência → ignorado", () => {
    expect(selecionarBeneficiario({ ...base, jaGerado: true })).toEqual({ acao: "ignorar", motivo: "JA_GERADO" });
  });

  it("RK-7f911d03a299 (BATCHPGT:220) — programa inexistente → erro com CPF mascarado", () => {
    expect(selecionarBeneficiario({ ...base, codPrograma: "ZZ99", programa: null })).toEqual({
      acao: "erro",
      mensagem: "ERRO: PROG NAO ENCONTRADO CPF=***.***.678-90 PROG=ZZ99",
    });
  });

  it("RK-4f462c2048b7 (BATCHPGT:227) — programa com status ≠ A → ignorado", () => {
    expect(selecionarBeneficiario({ ...base, programa: { sitPrograma: "I" } })).toEqual({ acao: "ignorar", motivo: "PROGRAMA_INATIVO" });
  });

  it("ordem do legado: duplicado > status > já gerado > programa inexistente > programa inativo", () => {
    expect(selecionarBeneficiario({ ...base, cpfAnterior: CPF, sitBeneficiario: "S", programa: null })).toMatchObject({ motivo: "CPF_REPETIDO" });
    expect(selecionarBeneficiario({ ...base, sitBeneficiario: "S", jaGerado: true, programa: null })).toMatchObject({ motivo: "NAO_ATIVO" });
    expect(selecionarBeneficiario({ ...base, jaGerado: true, programa: null })).toMatchObject({ motivo: "JA_GERADO" });
    expect(selecionarBeneficiario({ ...base, programa: null })).toMatchObject({ acao: "erro" });
  });
});

describe("competência do lote (FR-LOT-01)", () => {
  it("ano/mês da data de execução", () => {
    expect(competenciaDaData(20260901)).toBe(202609);
    expect(competenciaDaData(20261231)).toBe(202612);
  });
});

describe("progresso e resumo (FR-LOT-04)", () => {
  it("RK-69bb52067a2a (BATCHPGT:345) — registra a cada 1.000 gerados", () => {
    expect(deveRegistrarProgresso(0)).toBe(false);
    expect(deveRegistrarProgresso(999)).toBe(false);
    expect(deveRegistrarProgresso(1000)).toBe(true);
    expect(deveRegistrarProgresso(1001)).toBe(false);
    expect(deveRegistrarProgresso(2000)).toBe(true);
    expect(mensagemProgresso(1000, CPF)).toBe("PROCESSADOS: 1000 ULTIMO CPF: ***.***.678-90");
  });

  it("acumula gerados, ignorados e erros", () => {
    const r = novoResumo(202609);
    acumularGerado(r, { vlrBruto: 60000, vlrDesc: 1800, vlrLiq: 58200, vlrAbono: 0 });
    acumularGerado(r, { vlrBruto: 34303, vlrDesc: 0, vlrLiq: 34303, vlrAbono: 1833 });
    acumularSelecao(r, { acao: "ignorar", motivo: "NAO_ATIVO" });
    acumularSelecao(r, { acao: "erro", mensagem: mensagemProgramaNaoEncontrado(CPF, "ZZ99") });
    expect(r).toMatchObject({
      competencia: 202609,
      gerados: 2,
      ignorados: 1,
      erros: 1,
      vlrTotalBruto: 94303,
      vlrTotalDesconto: 1800,
      vlrTotalLiquido: 92503,
      vlrTotalAbono: 1833,
      mensagensErro: ["ERRO: PROG NAO ENCONTRADO CPF=***.***.678-90 PROG=ZZ99"],
    });
  });

  it("linhas do resumo com os rótulos literais do legado", () => {
    const r = { ...novoResumo(202609), processados: 5, gerados: 1, ignorados: 4, vlrTotalBruto: 12220, vlrTotalLiquido: 12220 };
    const linhas = linhasResumo(r);
    expect(linhas).toContain("COMPETENCIA......: 202609");
    expect(linhas).toContain("TOTAL PROCESSADOS: 5");
    expect(linhas).toContain("PAGTOS GERADOS...: 1");
    expect(linhas).toContain("IGNORADOS........: 4");
    expect(linhas).toContain("ERROS............: 0");
    expect(linhas).toContain("VLR TOTAL BRUTO..: 122.20");
    expect(linhas).toContain("VLR TOTAL DESC...: 0.00");
    expect(linhas).toContain("VLR TOTAL LIQUIDO: 122.20");
    expect(linhas).toContain("VLR TOTAL ABONO..: 0.00");
  });
});

// Rastreabilidade: as regras de seleção/progresso de BATCHPGT citadas em lote.ts
// (as de cálculo, FR-LOT-01/03, estão em motor.ts — ver rastreabilidade.test.ts).
const REGRAS_LOTE = [
  "RK-7d3e373f4754 (BATCHPGT:188)",
  "RK-bf3826b5e614 (BATCHPGT:195)",
  "RK-644073d95848 (BATCHPGT:203)",
  "RK-684b2581729a (BATCHPGT:207)",
  "RK-7f911d03a299 (BATCHPGT:220)",
  "RK-4f462c2048b7 (BATCHPGT:227)",
  "RK-69bb52067a2a (BATCHPGT:345)",
];

describe("rastreabilidade RK → lote.ts", () => {
  it(`cita as ${REGRAS_LOTE.length} regras com PROG:linha`, () => {
    const fonte = readFileSync(fileURLToPath(new URL("./lote.ts", import.meta.url)), "utf8");
    expect(REGRAS_LOTE.filter((r) => !fonte.includes(r))).toEqual([]);
  });
});
