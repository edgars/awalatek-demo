import { describe, expect, it } from "vitest";
import { linhaDetalhe } from "../../tests/fixtures/cnab240";
import {
  acumularDecisao,
  decidirConciliacao,
  mensagemDataPagamentoInvalida,
  normalizarDataPagamento,
  novoResumo,
  parseLinhaCnab,
  type PagamentoConciliacao,
  type RegistroCnab,
} from "./cnab240";
import { lerQuirks, QUIRKS_PADRAO } from "./quirks";

// D23 — data de pagamento do retorno BB (DDMMAAAA) nos dois modos.

const CPF = "01234567890";
const COMP = 199201;
const D23 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D23" });

function reg(over: Partial<Parameters<typeof linhaDetalhe>[0]> = {}): RegistroCnab {
  const r = parseLinhaCnab(linhaDetalhe({ cpf: CPF, numDoc: 96101, valor: 10000, ...over }));
  if (!r) throw new Error("não é detalhe");
  return r;
}

const pgto: PagamentoConciliacao = { numPagamento: 96101, numCpf: CPF, anoMesRef: COMP, vlrLiquido: 10000 };

describe("normalizarDataPagamento (CORRECAO D23)", () => {
  it.each([
    [25092026, 20260925], // DDMMAAAA do BB
    [10011992, 19920110],
    [29022024, 20240229], // bissexto
    [1012000, 20000101], // 01012000 sem o zero à esquerda
    [20260925, 20260925], // já AAAAMMDD (DDMMAAAA: mês 26 inválido)
    [20240229, 20240229],
  ])("%i → %i", (entrada, saida) => expect(normalizarDataPagamento(entrada)).toBe(saida));

  it.each([
    0,
    99999999,
    29022023, // 29/02 em ano não bissexto; como AAAAMMDD, mês 20
    31042026, // 31/04 não existe
    1011899, // 01/01/1899: ano < 1900; como AAAAMMDD, ano 0101
    123456789, // mais de 8 dígitos
    -1,
  ])("%i → inválida (null)", (entrada) => expect(normalizarDataPagamento(entrada)).toBeNull());

  it("mensagem literal", () => {
    expect(mensagemDataPagamentoInvalida(96101)).toBe("DATA PAGAMENTO INVALIDA: DOC=96101");
  });
});

describe("decidirConciliacao — D23", () => {
  it("legado: grava DDMMAAAA sem conversão, sem aviso (inclusive data inválida)", () => {
    expect(decidirConciliacao(reg({ dtPgto: "25092026" }), pgto, COMP, QUIRKS_PADRAO)).toEqual({
      tipo: "conciliado",
      numPagamento: 96101,
      atualizacao: { sitPagamento: "P", dtPagamento: 25092026, codBanco: "1", codRetornoBanco: "00" },
      mensagem: null,
    });
    const invalida = decidirConciliacao(reg({ dtPgto: "99999999" }), pgto, COMP);
    expect(invalida).toMatchObject({ atualizacao: { dtPagamento: 99999999 } });
    expect(invalida).not.toHaveProperty("avisoData");
  });

  it("corrigido: DDMMAAAA válida → AAAAMMDD", () => {
    expect(decidirConciliacao(reg({ dtPgto: "25092026" }), pgto, COMP, D23)).toEqual({
      tipo: "conciliado",
      numPagamento: 96101,
      atualizacao: { sitPagamento: "P", dtPagamento: 20260925, codBanco: "1", codRetornoBanco: "00" },
      mensagem: null,
    });
  });

  it("corrigido: AAAAMMDD válida → igual", () => {
    expect(decidirConciliacao(reg({ dtPgto: "20260925" }), pgto, COMP, D23)).toMatchObject({ atualizacao: { dtPagamento: 20260925 } });
  });

  it("corrigido: inválida → 0 + aviso; o resumo acumula o aviso", () => {
    const r = reg({ dtPgto: "31022026" });
    const d = decidirConciliacao(r, pgto, COMP, D23);
    expect(d).toEqual({
      tipo: "conciliado",
      numPagamento: 96101,
      atualizacao: { sitPagamento: "P", dtPagamento: 0, codBanco: "1", codRetornoBanco: "00" },
      mensagem: null,
      avisoData: "DATA PAGAMENTO INVALIDA: DOC=96101",
    });
    const resumo = novoResumo(COMP);
    acumularDecisao(resumo, r, d);
    expect(resumo).toMatchObject({ conciliados: 1, auditoria: 1, avisosDataPagamento: ["DATA PAGAMENTO INVALIDA: DOC=96101"] });
    expect(resumo.mensagens).toEqual(["DATA PAGAMENTO INVALIDA: DOC=96101"]);
  });

  it("corrigido: data em branco → 0 + aviso", () => {
    expect(decidirConciliacao(reg({ dtPgto: "        " }), pgto, COMP, D23)).toMatchObject({
      atualizacao: { dtPagamento: 0 },
      avisoData: "DATA PAGAMENTO INVALIDA: DOC=96101",
    });
  });

  it("corrigido: a normalização segue o status resultante (P), não o código literal", () => {
    // Só o status P grava dtPagamento; D (01), E (02) e código desconhecido (sem update) não.
    expect(decidirConciliacao(reg({ codRet: "00", dtPgto: "99999999" }), pgto, COMP, D23)).toMatchObject({
      atualizacao: { sitPagamento: "P", dtPagamento: 0 },
      avisoData: "DATA PAGAMENTO INVALIDA: DOC=96101",
    });
    const desconhecido = decidirConciliacao(reg({ codRet: "99", dtPgto: "99999999" }), pgto, COMP, D23);
    expect(desconhecido).toMatchObject({ atualizacao: null, mensagem: "COD RETORNO DESCONHECIDO: 99 CPF=01234567890" });
    expect(desconhecido).not.toHaveProperty("avisoData");
  });

  it("corrigido: códigos 01/02 não gravam data → sem aviso", () => {
    for (const codRet of ["01", "02"]) {
      const d = decidirConciliacao(reg({ dtPgto: "99999999", codRet }), pgto, COMP, D23);
      expect(d).not.toHaveProperty("avisoData");
    }
  });

  it("resumo legado começa sem avisos de data", () => {
    expect(novoResumo(COMP).avisosDataPagamento).toEqual([]);
  });
});
