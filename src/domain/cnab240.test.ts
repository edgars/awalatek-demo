import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { arquivoRetorno, linhaControle, linhaDetalhe } from "../../tests/fixtures/cnab240";
import {
  acumularDecisao,
  atualizacaoPorCodigo,
  chaveAuditoria,
  decidirConciliacao,
  descricaoConciliado,
  diferencaCentavos,
  ehDivergente,
  linhasArquivo,
  mensagemCodigoDesconhecido,
  mensagemDivergencia,
  mensagemNaoEncontrado,
  novoResumo,
  numPgtoPesquisavel,
  pagamentoCorresponde,
  parseLinhaCnab,
  ROTULOS_RESUMO,
  TITULO_RESUMO,
  valorN92,
  type PagamentoConciliacao,
  type RegistroCnab,
} from "./cnab240";

// Story 6.1 — BATCHCON: parse CNAB 240, decisión de conciliación, mensajes y resumen.

const CPF = "01234567890";
const COMP = 199201;

function reg(over: Partial<Parameters<typeof linhaDetalhe>[0]> = {}): RegistroCnab {
  const r = parseLinhaCnab(linhaDetalhe({ cpf: CPF, numDoc: 96101, valor: 10000, ...over }));
  if (!r) throw new Error("não é detalhe");
  return r;
}

const pgto = (over: Partial<PagamentoConciliacao> = {}): PagamentoConciliacao => ({
  numPagamento: 96101,
  numCpf: CPF,
  anoMesRef: COMP,
  vlrLiquido: 10000,
  ...over,
});

describe("parseLinhaCnab (FR-CNB-01)", () => {
  it("RK-7747831dca9a — tipo ≠ '3' (header/trailer) → null", () => {
    for (const t of ["0", "1", "5", "9"] as const) expect(parseLinhaCnab(linhaControle(t))).toBeNull();
    expect(parseLinhaCnab(linhaDetalhe({ cpf: CPF, numDoc: 1, valor: 1, tipo: "4" }))).toBeNull();
    expect(parseLinhaCnab("")).toBeNull();
  });

  it("extrai os campos pelas posições 1-based (CPF 44, doc 74, valor 120, data 140, cód. 231)", () => {
    expect(reg({ dtPgto: "25092026", codRet: "01" })).toEqual({
      cnabCpf: CPF,
      cnabNumDoc: "0000096101",
      cpfNum: CPF,
      numPgto: 96101,
      vlrRetorno: 10000,
      dtPgto: 25092026, // TODO(review): gravada sem conversão
      codRet: "01",
    });
  });

  it("RK-1121c69fbbdb — valor em centavos ÷ 100 com 2 decimais exatos", () => {
    const r = reg({ valor: 12345 });
    expect(r.vlrRetorno).toBe(12345);
    expect(valorN92(r.vlrRetorno)).toBe("123.45");
    expect(valorN92(reg({ valor: 1 }).vlrRetorno)).toBe("0.01");
  });

  it("linha curta é completada com brancos (SUBSTR sobre o que houver), sem abortar", () => {
    const curta = linhaDetalhe({ cpf: CPF, numDoc: 96101, valor: 500 }).slice(0, 150);
    const r = parseLinhaCnab(curta);
    expect(r).toMatchObject({ numPgto: 96101, vlrRetorno: 500, codRet: "  " });
    const longa = linhaDetalhe({ cpf: CPF, numDoc: 96101, valor: 500 }) + "XYZ";
    expect(parseLinhaCnab(longa)).toMatchObject({ codRet: "00" });
  });

  it("CPF curto é normalizado a 11 dígitos; campos em branco/não numéricos → 0", () => {
    const linha = linhaDetalhe({ cpf: CPF, numDoc: 96101, valor: 500 });
    const cpfCurto = linha.slice(0, 43) + "  123456789" + linha.slice(54);
    expect(parseLinhaCnab(cpfCurto)?.cpfNum).toBe("00123456789");
    const docLixo = linha.slice(0, 73) + "ABC       " + linha.slice(83);
    expect(parseLinhaCnab(docLixo)?.numPgto).toBe(0);
  });
});

describe("linhasArquivo", () => {
  it("quebras de linha finais não contam; linhas vazias no meio contam", () => {
    expect(linhasArquivo(arquivoRetorno([{ cpf: CPF, numDoc: 1, valor: 1 }]))).toHaveLength(5);
    expect(linhasArquivo("A\n\nB\n\n\n")).toEqual(["A", "", "B"]);
    expect(linhasArquivo("")).toEqual([]);
    expect(linhasArquivo("﻿A\r\nB")).toEqual(["A", "B"]);
  });
});

describe("correspondência (FR-CNB-02)", () => {
  it("RK-3d6fe48b2bba — mesmo número, CPF e competência → encontrado", () => {
    expect(pagamentoCorresponde(pgto(), reg(), COMP)).toBe(true);
    expect(pagamentoCorresponde(pgto({ numCpf: "12345678062" }), reg(), COMP)).toBe(false);
    expect(pagamentoCorresponde(pgto({ anoMesRef: 199202 }), reg(), COMP)).toBe(false);
    expect(pagamentoCorresponde(null, reg(), COMP)).toBe(false);
  });

  it("RK-31d94b6dc065 — não encontrado → mensagem literal", () => {
    expect(decidirConciliacao(reg(), null, COMP)).toEqual({
      tipo: "nao-encontrado",
      mensagem: "NAO ENCONTRADO: CPF=01234567890 DOC=0000096101",
    });
    expect(decidirConciliacao(reg(), pgto({ anoMesRef: 199202 }), COMP).tipo).toBe("nao-encontrado");
  });

  it("número fora do intervalo de Int não é pesquisado", () => {
    expect(numPgtoPesquisavel(96101)).toBe(true);
    expect(numPgtoPesquisavel(0)).toBe(false);
    expect(numPgtoPesquisavel(9_999_999_999)).toBe(false);
  });
});

describe("divergência (FR-CNB-03)", () => {
  it("RK-8649d421b7d9 / RK-25bb549502ed / RK-46ead0f200b6 — diferença absoluta", () => {
    expect(diferencaCentavos(10000, 10002)).toBe(2);
    expect(diferencaCentavos(10002, 10000)).toBe(2);
    expect(diferencaCentavos(10000, 10000)).toBe(0);
  });

  it("RK-8c11d37225a3 — limite estrito: 0,01 concilia, 0,02 diverge", () => {
    expect(ehDivergente(1)).toBe(false);
    expect(ehDivergente(2)).toBe(true);
    expect(decidirConciliacao(reg({ valor: 10001 }), pgto(), COMP).tipo).toBe("conciliado");
    expect(decidirConciliacao(reg({ valor: 9999 }), pgto(), COMP).tipo).toBe("conciliado");
    expect(decidirConciliacao(reg({ valor: 10002 }), pgto(), COMP)).toEqual({
      tipo: "divergente",
      mensagem: "DIVERGENCIA: CPF=01234567890 SIFAP=100.00 BANCO=100.02",
      numPagamento: 96101,
      vlrLiquido: 10000,
      vlrRetorno: 10002,
    });
  });
});

describe("atualização por código de retorno (FR-CNB-04)", () => {
  it("RK-9af86fb5374c — 00 → P + data + banco 1; 01 → D; 02 → E; outro → null", () => {
    expect(atualizacaoPorCodigo("00", 20260925)).toEqual({ sitPagamento: "P", dtPagamento: 20260925, codBanco: "1", codRetornoBanco: "00" });
    expect(atualizacaoPorCodigo("01", 20260925)).toEqual({ sitPagamento: "D", codRetornoBanco: "01" });
    expect(atualizacaoPorCodigo("02", 20260925)).toEqual({ sitPagamento: "E", codRetornoBanco: "02" });
    expect(atualizacaoPorCodigo("99", 20260925)).toBeNull();
  });

  it("código desconhecido conta como conciliado, com mensagem e sem update", () => {
    expect(decidirConciliacao(reg({ codRet: "99" }), pgto(), COMP)).toEqual({
      tipo: "conciliado",
      numPagamento: 96101,
      atualizacao: null,
      mensagem: "COD RETORNO DESCONHECIDO: 99 CPF=01234567890",
    });
    expect(mensagemCodigoDesconhecido("  ", CPF)).toBe("COD RETORNO DESCONHECIDO: CPF=01234567890");
  });
});

describe("mensagens e auditoria", () => {
  it("prefixos literais", () => {
    expect(mensagemNaoEncontrado("01234567890", "0000000007")).toBe("NAO ENCONTRADO: CPF=01234567890 DOC=0000000007");
    expect(mensagemDivergencia(CPF, 50, 123456)).toBe("DIVERGENCIA: CPF=01234567890 SIFAP=0.50 BANCO=1234.56");
    expect(descricaoConciliado("00")).toBe("CONCILIADO COD RET=00");
    expect(chaveAuditoria(96101)).toBe("96101");
  });
});

describe("resumo", () => {
  it("acumula contadores, listas e registros de auditoria", () => {
    const r = novoResumo(COMP);
    const casos: [RegistroCnab, PagamentoConciliacao | null][] = [
      [reg(), pgto()],
      [reg({ valor: 10002 }), pgto()],
      [reg({ codRet: "99" }), pgto()],
      [reg({ numDoc: 5 }), null],
    ];
    for (const [g, p] of casos) acumularDecisao(r, g, decidirConciliacao(g, p, COMP));
    expect(r).toMatchObject({ conciliados: 2, divergentes: 1, naoEncontrados: 1, auditoria: 3 });
    expect(r.mensagens).toEqual([
      "DIVERGENCIA: CPF=01234567890 SIFAP=100.00 BANCO=100.02",
      "COD RETORNO DESCONHECIDO: 99 CPF=01234567890",
      "NAO ENCONTRADO: CPF=01234567890 DOC=0000000005",
    ]);
    expect(r.divergencias).toEqual([{ numPagamento: 96101, cpf: CPF, vlrSifap: 10000, vlrBanco: 10002 }]);
    expect(r.listaNaoEncontrados).toEqual([{ cpf: CPF, documento: "0000000005" }]);
    expect(r.codigosDesconhecidos).toEqual([{ numPagamento: 96101, cpf: CPF, codRet: "99" }]);
  });

  it("título e rótulos literais do legado", () => {
    expect(TITULO_RESUMO).toBe("BATCHCON - RESUMO CONCILIACAO");
    expect(Object.values(ROTULOS_RESUMO)).toEqual([
      "REGISTROS LIDOS........:",
      "CONCILIADOS............:",
      "DIVERGENTES............:",
      "NAO ENCONTRADOS........:",
      "REGISTROS AUDITORIA....:",
    ]);
  });
});

describe("rastreabilidade", () => {
  it("as 9 RK de BATCHCON estão citadas em cnab240.ts", () => {
    const fonte = readFileSync(fileURLToPath(new URL("./cnab240.ts", import.meta.url)), "utf8");
    for (const rk of [
      "RK-7747831dca9a (BATCHCON:116)",
      "RK-1121c69fbbdb (BATCHCON:132)",
      "RK-3d6fe48b2bba (BATCHCON:140)",
      "RK-31d94b6dc065 (BATCHCON:146)",
      "RK-8649d421b7d9 (BATCHCON:155)",
      "RK-25bb549502ed (BATCHCON:156)",
      "RK-46ead0f200b6 (BATCHCON:157)",
      "RK-8c11d37225a3 (BATCHCON:160)",
      "RK-9af86fb5374c (BATCHCON:171)",
    ]) {
      expect(fonte).toContain(`// ${rk}`);
    }
  });
});
