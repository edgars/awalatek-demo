import { describe, expect, it } from "vitest";
import {
  calcularFatorK,
  calcularVlrBaseAjustado,
  faixaCalculoSchema,
  inclusaoProgramaSchema,
  MENSAGENS_PROGRAMA,
  mensagemInclusao,
  paramRegionalSchema,
  resultadoConsulta,
  validarLimiteFaixas,
  validarLimiteParamsRegionais,
  validarOperacao,
  verificarDuplicidade,
} from "./programa";

const entradaValida = {
  codPrograma: "px01",
  nomePrograma: "PROGRAMA TESTE",
  tipoPrograma: "A",
  vlrBase: "15000",
  codElegibilidade: "rd",
  dtInicio: "20260101",
  dtFim: "0",
  rendaMaxima: "0",
  idadeMin: "0",
  idadeMax: "0",
  fatorReajuste: "0.045",
};

describe("RK-d20a15a018e6 / RK-a1d8765eea49 — operação (CADPROG:51/56)", () => {
  it("operação diferente de I/C → OPERACAO INVALIDA", () => {
    expect(validarOperacao("X")).toEqual({ ok: false, mensagem: "OPERACAO INVALIDA" });
    expect(validarOperacao("")).toEqual({ ok: false, mensagem: "OPERACAO INVALIDA" });
    expect(validarOperacao("i")).toEqual({ ok: false, mensagem: "OPERACAO INVALIDA" });
  });

  it("C → consulta; I → inclusão", () => {
    expect(validarOperacao("C")).toEqual({ ok: true, operacao: "C", consulta: true });
    expect(validarOperacao("I")).toEqual({ ok: true, operacao: "I", consulta: false });
  });
});

describe("RK-7ca3bec5e5f6 — consulta (CADPROG:117)", () => {
  it("inexistente → PROGRAMA NAO ENCONTRADO", () => {
    expect(resultadoConsulta(null)).toEqual({ ok: false, mensagem: "PROGRAMA NAO ENCONTRADO" });
  });
  it("existente → devolve o programa", () => {
    expect(resultadoConsulta({ cod: "PA01" })).toEqual({ ok: true, programa: { cod: "PA01" } });
  });
});

describe("RK-1559882bffe4 — duplicidade (CADPROG:81)", () => {
  it("código existente → PROGRAMA JA CADASTRADO", () => {
    expect(verificarDuplicidade(true)).toBe("PROGRAMA JA CADASTRADO");
    expect(verificarDuplicidade(false)).toBeNull();
  });
});

describe("RK-275e4a632e83 / RK-bd6a7e52a48b — FATOR-K (CADPROG:87/88, D8)", () => {
  it("fatorK = 1.00 + fatorReajuste × 0.347215, truncado N5.6", () => {
    expect(calcularFatorK("0.0450")).toBe("1.015624"); // 1.015624675 → trunca
    expect(calcularFatorK("0.0000")).toBe("1.000000");
    expect(calcularFatorK("1.0000")).toBe("1.347215");
    expect(calcularFatorK("999.9999")).toBe("348.214965"); // 1 + 347.2149652785
  });

  it("vlrBase × fatorK truncado a centavos (N9.2)", () => {
    expect(calcularVlrBaseAjustado(15000, "1.015624")).toBe(15234); // 152.3436 → 152.34
    expect(calcularVlrBaseAjustado(15000, "1.000000")).toBe(15000);
    expect(calcularVlrBaseAjustado(99, "1.347215")).toBe(133); // 1.33374285 → 1.33
  });

  it("usa o FATOR-K já truncado na multiplicação", () => {
    // Com o K sem truncar (1.015624675) 1.000.000,00 daria 1.015.624,67; truncado dá 1.015.624,00.
    expect(calcularVlrBaseAjustado(100_000_000, calcularFatorK("0.0450"))).toBe(101_562_400);
  });

  it("mensagem literal com valor em R$", () => {
    expect(mensagemInclusao(15234)).toBe("PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ 152,34");
    expect(mensagemInclusao(15234).startsWith(MENSAGENS_PROGRAMA.incluidoSucesso)).toBe(true);
  });
});

describe("limites dos grupos (FR-PRG-04)", () => {
  it("máx. 5 faixas", () => {
    expect(validarLimiteFaixas(5)).toBeNull();
    expect(validarLimiteFaixas(6)).toMatch(/máx\. 5/);
  });
  it("máx. 6 parâmetros regionais", () => {
    expect(validarLimiteParamsRegionais(6)).toBeNull();
    expect(validarLimiteParamsRegionais(7)).toMatch(/máx\. 6/);
  });
});

describe("esquema de inclusão", () => {
  it("normaliza a entrada válida", () => {
    const r = inclusaoProgramaSchema.parse(entradaValida);
    expect(r).toMatchObject({
      codPrograma: "PX01",
      tipoPrograma: "A",
      vlrBase: 15000,
      codElegibilidade: "RD",
      dtInicio: 20260101,
      dtFim: 0,
      fatorReajuste: "0.0450",
    });
  });

  it("rejeita tipo fora de A/P/T no campo tipo", () => {
    const r = inclusaoProgramaSchema.safeParse({ ...entradaValida, tipoPrograma: "X" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["tipoPrograma"]);
  });

  it("rejeita código inválido, data inválida e fator com 5 casas", () => {
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, codPrograma: "PX-1" }).success).toBe(false);
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, codPrograma: "PX001" }).success).toBe(false);
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, dtInicio: "20261301" }).success).toBe(false);
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, fatorReajuste: "0.04501" }).success).toBe(false);
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, vlrBase: "-1" }).success).toBe(false);
  });

  it("valor acima do Int32 é recusado com mensagem clara", () => {
    expect(inclusaoProgramaSchema.safeParse({ ...entradaValida, vlrBase: "2147483647" }).success).toBe(true);
    const r = inclusaoProgramaSchema.safeParse({ ...entradaValida, vlrBase: "2147483648" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["vlrBase"]);
    expect(r.error?.issues[0]?.message).toBe("Valor base: valor acima do limite (máx. R$ 21.474.836,47)");
  });

  it("vazio → 0 / null", () => {
    const r = inclusaoProgramaSchema.parse({ ...entradaValida, codElegibilidade: "", fatorReajuste: "" });
    expect(r.codElegibilidade).toBeNull();
    expect(r.fatorReajuste).toBe("0.0000");
  });

  it("esquemas dos grupos", () => {
    expect(
      faixaCalculoSchema.parse({ rendaInicio: "0", rendaFim: "50000", fatorMultiplicador: "1.2", vlrAdicional: "1000", indAcumulativo: "S" }),
    ).toEqual({ rendaInicio: 0, rendaFim: 50000, fatorMultiplicador: "1.2000", vlrAdicional: 1000, indAcumulativo: "S" });
    expect(faixaCalculoSchema.safeParse({ rendaInicio: "0", rendaFim: "0", fatorMultiplicador: "1", vlrAdicional: "0", indAcumulativo: "X" }).success).toBe(false);
    expect(paramRegionalSchema.parse({ codRegiao: "3", fatorRegional: "1.1", vlrComplementoReg: "0", indAtivoRegiao: "N" }).codRegiao).toBe(3);
    expect(paramRegionalSchema.safeParse({ codRegiao: "100", fatorRegional: "1", vlrComplementoReg: "0", indAtivoRegiao: "S" }).success).toBe(false);
  });
});
