import { describe, expect, it } from "vitest";
import {
  acaoSituacaoDisponivel,
  alteracaoProgramaSchema,
  calcularFatorK,
  calcularVlrBaseAjustado,
  decidirValorBase,
  MENSAGENS_ALTERACAO_PROGRAMA,
  mensagemSituacao,
  textoConfirmacaoSituacao,
  transicaoSituacao,
} from "./programa";

// Story 1.2 — alteração e situação do programa (funcionalidade nova, fora do legado).

describe("alteracaoProgramaSchema", () => {
  const base = {
    nomePrograma: "PROGRAMA TESTE",
    tipoPrograma: "A",
    vlrBase: "",
    codElegibilidade: "",
    dtInicio: "20260101",
    dtFim: "0",
    rendaMaxima: "0",
    idadeMin: "0",
    idadeMax: "0",
    fatorReajuste: "0.045",
    numVersao: "3",
  };

  it("valor base vazio = não informado; código não faz parte do esquema", () => {
    const r = alteracaoProgramaSchema.parse({ ...base, codPrograma: "XXXX" });
    expect(r.vlrBase).toBeUndefined();
    expect(r.numVersao).toBe(3);
    expect(r.fatorReajuste).toBe("0.0450");
    expect("codPrograma" in r).toBe(false);
    expect(alteracaoProgramaSchema.parse({ ...base, vlrBase: "0" }).vlrBase).toBe(0);
  });

  it("reutiliza as mensagens da inclusão", () => {
    const r = alteracaoProgramaSchema.safeParse({
      ...base,
      nomePrograma: "",
      tipoPrograma: "X",
      vlrBase: "-1",
      idadeMax: "1000",
      dtFim: "20261399",
    });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toEqual(
      expect.arrayContaining([
        "Nome: obrigatório",
        "Tipo: informe A, P ou T",
        "Valor base: não pode ser negativo",
        "Idade máxima: máximo 3 dígitos",
        "Data fim: data inválida",
      ]),
    );
  });

  it("versão ausente → mensagem de conflito", () => {
    const r = alteracaoProgramaSchema.safeParse({ ...base, numVersao: "" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe(MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada);
  });
});

describe("decidirValorBase", () => {
  const atual = { fatorReajuste: "0.0450", fatorK: "1.015624", vlrBaseIndividual: 15234 };

  it("sem valor base e mesmo fator → não recalcula (sem duplo FATOR-K)", () => {
    expect(decidirValorBase(atual, { fatorReajuste: "0.0450" })).toEqual({ ok: true, recalculado: false });
    expect(decidirValorBase(atual, { fatorReajuste: "0.045" })).toEqual({ ok: true, recalculado: false });
  });

  it("valor base informado → mesmo cálculo da inclusão (D8)", () => {
    // FATOR-K = 1 + 0,05 × 0,347215 = 1,017360 (N5.6); 200,00 × 1,017360 = 203,47 (truncado)
    expect(decidirValorBase(atual, { vlrBase: 20000, fatorReajuste: "0.0500" })).toEqual({
      ok: true,
      recalculado: true,
      fatorK: "1.017360",
      vlrBaseIndividual: 20347,
    });
    expect(decidirValorBase(atual, { vlrBase: 15000, fatorReajuste: "0.0450" })).toMatchObject({
      vlrBaseIndividual: calcularVlrBaseAjustado(15000, calcularFatorK("0.0450")),
    });
  });

  it("fator mudou sem valor base → exige o valor base", () => {
    expect(decidirValorBase(atual, { fatorReajuste: "0.1000" })).toEqual({
      ok: false,
      campo: "vlrBase",
      mensagem: MENSAGENS_ALTERACAO_PROGRAMA.valorBaseObrigatorio,
    });
  });

  it("acima do Int32 → recusado", () => {
    expect(decidirValorBase(atual, { vlrBase: 2_147_483_647, fatorReajuste: "0.0450" })).toMatchObject({ ok: false, campo: "vlrBase" });
  });
});

describe("transicaoSituacao", () => {
  it("desativar A → I; reativar I → A", () => {
    expect(transicaoSituacao("A", "desativar")).toEqual({ ok: true, nova: "I", descricao: "PROGRAMA DESATIVADO" });
    expect(transicaoSituacao("I", "reativar")).toEqual({ ok: true, nova: "A", descricao: "PROGRAMA REATIVADO" });
  });

  it("transições inválidas", () => {
    expect(transicaoSituacao("I", "desativar")).toEqual({ ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.jaInativo });
    expect(transicaoSituacao("E", "desativar")).toEqual({ ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.somenteAtivoDesativa });
    expect(transicaoSituacao("A", "reativar")).toEqual({ ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.jaAtivo });
    expect(transicaoSituacao("E", "reativar")).toEqual({ ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.encerradoNaoReativa });
  });

  it("ação oferecida pela UI e texto de confirmação", () => {
    expect(acaoSituacaoDisponivel("A")).toBe("desativar");
    expect(acaoSituacaoDisponivel("I")).toBe("reativar");
    expect(acaoSituacaoDisponivel("E")).toBeNull();
    expect(textoConfirmacaoSituacao("PA01", "desativar")).toBe(
      "Desativar o programa PA01? Beneficiários deste programa deixam de ser pagos no lote e são inelegíveis (PROGRAMA INATIVO).",
    );
    expect(mensagemSituacao("PA01", "I")).toBe("Programa PA01 desativado.");
    expect(mensagemSituacao("PA01", "A")).toBe("Programa PA01 reativado.");
  });
});
