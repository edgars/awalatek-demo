import { describe, expect, it } from "vitest";
import {
  descontoRegistradoSchema,
  errosDoDesconto,
  MAX_DESCONTOS,
  MENSAGENS_DESCONTOS,
  mensagemGravados,
  ROTULOS_TIPO_DESCONTO,
  TIPOS_DESCONTO,
  validarDescontosRegistrados,
  validarLimiteDescontos,
} from "./descontosRegistrados";

const linha = (over: Record<string, string> = {}) => ({
  tipoDesconto: "J",
  vlrDesconto: "2500",
  pctDesconto: "0.00",
  dtInicioDsct: "20260101",
  dtFimDsct: "0",
  numProcesso: "123",
  ...over,
});

describe("domínio de tipos (D15)", () => {
  it("usa o domínio do código C/I/J/S/P/A com rótulos pt-BR", () => {
    expect(TIPOS_DESCONTO).toEqual(["C", "I", "J", "S", "P", "A"]);
    expect(ROTULOS_TIPO_DESCONTO).toEqual({
      C: "Contribuição",
      I: "Imposto",
      J: "Judicial",
      S: "Sindical",
      P: "Pensão alimentícia",
      A: "Administrativo",
    });
  });
});

describe("limite (ADR-008)", () => {
  it("permite até 8 e rejeita 9", () => {
    expect(MAX_DESCONTOS).toBe(8);
    expect(validarLimiteDescontos(8)).toBeNull();
    expect(validarLimiteDescontos(9)).toBe("Limite de 8 descontos excedido (máx. 8).");
  });

  it("9 filas → só a mensagem de limite", () => {
    const r = validarDescontosRegistrados(Array.from({ length: 9 }, () => linha()));
    expect(r).toEqual({ ok: false, mensagens: ["Limite de 8 descontos excedido (máx. 8)."], erros: {} });
  });
});

describe("descontoRegistradoSchema", () => {
  it("converte J com valor fixo e processo", () => {
    expect(descontoRegistradoSchema.parse(linha())).toEqual({
      tipoDesconto: "J",
      vlrDesconto: 2500,
      pctDesconto: "0.00",
      dtInicioDsct: 20260101,
      dtFimDsct: 0,
      numProcesso: "123",
    });
  });

  it("S sem valor nem percentual é válido; processo vazio → null; percentual vazio → 0.00", () => {
    expect(descontoRegistradoSchema.parse(linha({ tipoDesconto: "s", vlrDesconto: "0", pctDesconto: "", numProcesso: "  " }))).toMatchObject({
      tipoDesconto: "S",
      pctDesconto: "0.00",
      numProcesso: null,
    });
  });

  it("percentual N3.2 normalizado", () => {
    expect(descontoRegistradoSchema.parse(linha({ tipoDesconto: "I", vlrDesconto: "0", pctDesconto: "7.5" })).pctDesconto).toBe("7.50");
    expect(descontoRegistradoSchema.safeParse(linha({ pctDesconto: "1.234" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ pctDesconto: "1000" })).success).toBe(false);
  });

  it("trunca o nº do processo em 20 caracteres", () => {
    const r = descontoRegistradoSchema.parse(linha({ numProcesso: "0123456789012345678901234" }));
    expect(r.numProcesso).toBe("01234567890123456789");
  });

  it("tipo com mais de 1 caractere é recusado (não truncado)", () => {
    expect(descontoRegistradoSchema.safeParse(linha({ tipoDesconto: "JX" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ tipoDesconto: "Judicial" })).success).toBe(false);
  });

  it("tipo fora do domínio → erro", () => {
    const r = descontoRegistradoSchema.safeParse(linha({ tipoDesconto: "X" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Tipo: informe C, I, J, S, P ou A");
    expect(descontoRegistradoSchema.safeParse(linha({ tipoDesconto: "" })).success).toBe(false);
  });

  it("valor acima de Int32, negativo ou inválido → erro", () => {
    expect(descontoRegistradoSchema.safeParse(linha({ vlrDesconto: "2147483648" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ vlrDesconto: "-1" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ vlrDesconto: "invalido" })).success).toBe(false);
  });

  it("data início obrigatória e datas válidas", () => {
    const r = descontoRegistradoSchema.safeParse(linha({ dtInicioDsct: "0" }));
    expect(r.error?.issues.map((i) => i.message)).toContain("Data início: obrigatória");
    expect(descontoRegistradoSchema.safeParse(linha({ dtFimDsct: "20261340" })).success).toBe(false);
  });

  it("datas fora do calendário real são recusadas", () => {
    expect(descontoRegistradoSchema.safeParse(linha({ dtInicioDsct: "20260231" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ dtFimDsct: "20250229" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ dtFimDsct: "20260431" })).success).toBe(false);
    expect(descontoRegistradoSchema.safeParse(linha({ dtInicioDsct: "20240229" })).success).toBe(true);
  });

  it("aceita entrada já tipada (números e processo null)", () => {
    const r = descontoRegistradoSchema.safeParse({
      tipoDesconto: "S",
      vlrDesconto: 0,
      pctDesconto: "0.00",
      dtInicioDsct: 20260101,
      dtFimDsct: 0,
      numProcesso: null,
    });
    expect(r.success && r.data.numProcesso).toBeNull();
  });
});

describe("validações cruzadas", () => {
  it("J sem processo → erro no campo numProcesso", () => {
    const r = validarDescontosRegistrados([linha({ numProcesso: "" })]);
    expect(r).toEqual({
      ok: false,
      mensagens: [`Desconto 1 — ${MENSAGENS_DESCONTOS.processoObrigatorio}`],
      erros: { "0.numProcesso": MENSAGENS_DESCONTOS.processoObrigatorio },
    });
  });

  it("I com valor 0 e percentual 0 → erro", () => {
    const r = validarDescontosRegistrados([linha({ tipoDesconto: "I", vlrDesconto: "0", pctDesconto: "0" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros).toEqual({ "0.vlrDesconto": MENSAGENS_DESCONTOS.valorOuPercentual });
  });

  it("I só com valor fixo → exige percentual (o cálculo ignora o valor)", () => {
    const r = validarDescontosRegistrados([linha({ tipoDesconto: "I", vlrDesconto: "1000", pctDesconto: "0" })]);
    expect(r).toEqual({
      ok: false,
      mensagens: [`Desconto 1 — ${MENSAGENS_DESCONTOS.impostoSemPercentual}`],
      erros: { "0.pctDesconto": MENSAGENS_DESCONTOS.impostoSemPercentual },
    });
    expect(validarDescontosRegistrados([linha({ tipoDesconto: "I", vlrDesconto: "0", pctDesconto: "5" })]).ok).toBe(true);
  });

  it("percentual > 0 basta", () => {
    expect(validarDescontosRegistrados([linha({ tipoDesconto: "P", vlrDesconto: "0", pctDesconto: "10" })]).ok).toBe(true);
  });

  it("datas invertidas → erro; fim igual ao início ou 0 → ok", () => {
    const r = validarDescontosRegistrados([linha({ dtInicioDsct: "20260101", dtFimDsct: "20251231" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagens).toEqual([`Desconto 1 — ${MENSAGENS_DESCONTOS.datasInvertidas}`]);
    expect(validarDescontosRegistrados([linha({ dtFimDsct: "20260101" })]).ok).toBe(true);
    expect(validarDescontosRegistrados([linha({ dtFimDsct: "" })]).ok).toBe(true);
  });

  it("mensagens por fila com o número da fila", () => {
    const r = validarDescontosRegistrados([linha(), linha({ tipoDesconto: "S", vlrDesconto: "0" }), linha({ numProcesso: "" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensagens).toEqual([`Desconto 3 — ${MENSAGENS_DESCONTOS.processoObrigatorio}`]);
      expect(Object.keys(r.erros)).toEqual(["2.numProcesso"]);
    }
  });

  it("errosDoDesconto acumula na ordem", () => {
    expect(
      errosDoDesconto({ tipoDesconto: "J", vlrDesconto: 0, pctDesconto: "0.00", dtInicioDsct: 20260201, dtFimDsct: 20260101, numProcesso: null }).map(
        ([c]) => c,
      ),
    ).toEqual(["numProcesso", "vlrDesconto", "dtFimDsct"]);
  });

  it("dois descontos válidos", () => {
    const r = validarDescontosRegistrados([linha(), linha({ tipoDesconto: "S", vlrDesconto: "0", numProcesso: "" })]);
    expect(r.ok && r.filas).toHaveLength(2);
    expect(mensagemGravados(2)).toBe("Descontos gravados (2).");
  });
});
