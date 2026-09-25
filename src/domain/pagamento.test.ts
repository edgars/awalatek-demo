import { describe, expect, it } from "vitest";
import {
  lerFiltrosPagamentos,
  lerNumPagamento,
  MENSAGENS_PAGAMENTO,
  ROTULOS_TIPO_DESCONTO,
  rotuloDominio,
  rotuloSituacaoPagamento,
  rotuloTipoPagamento,
} from "./pagamento";

describe("rótulos de pagamento (D15)", () => {
  it("situação G/P/C/D/E", () => {
    expect(["G", "P", "C", "D", "E"].map(rotuloSituacaoPagamento)).toEqual([
      "G — Gerado",
      "P — Pago",
      "C — Cancelado",
      "D — Devolvido",
      "E — Estornado",
    ]);
    expect(rotuloSituacaoPagamento("X")).toBe("X");
  });

  it("tipo N/D/T", () => {
    expect(["N", "D", "T"].map(rotuloTipoPagamento)).toEqual(["N — Normal", "D — Décimo", "T — Terceiro"]);
    expect(rotuloTipoPagamento("Z")).toBe("Z");
  });

  it("tipo de desconto do código (C/I/J/S/P/A)", () => {
    expect(rotuloDominio(ROTULOS_TIPO_DESCONTO, "J")).toBe("J — Judicial");
    expect(rotuloDominio(ROTULOS_TIPO_DESCONTO, "IR")).toBe("IR");
  });

  it("mensagem literal de inexistente", () => {
    expect(MENSAGENS_PAGAMENTO.naoEncontrado).toBe("PAGAMENTO NAO ENCONTRADO");
  });
});

describe("filtros da lista", () => {
  it("vazios → sem filtro, página 1", () => {
    expect(lerFiltrosPagamentos({})).toEqual({ cpf: "", competencia: 0, programa: "", situacao: "", pagina: 1 });
  });

  it("CPF: 11 dígitos exatos, com ou sem máscara", () => {
    expect(lerFiltrosPagamentos({ cpf: "012.345.678-90" }).cpf).toBe("01234567890");
    expect(lerFiltrosPagamentos({ cpf: "01234567890" }).cpf).toBe("01234567890");
  });

  it("CPF incompleto ou com letras → null (nenhuma coincidência)", () => {
    expect(lerFiltrosPagamentos({ cpf: "012345" }).cpf).toBeNull();
    expect(lerFiltrosPagamentos({ cpf: "0123456789a0" }).cpf).toBeNull();
    expect(lerFiltrosPagamentos({ cpf: "   " }).cpf).toBe("");
  });

  it("competência AAAA-MM ou AAAAMM; inválida → ignorada", () => {
    expect(lerFiltrosPagamentos({ competencia: "2026-09" }).competencia).toBe(202609);
    expect(lerFiltrosPagamentos({ competencia: "202609" }).competencia).toBe(202609);
    expect(lerFiltrosPagamentos({ competencia: "2026-13" }).competencia).toBe(0);
    expect(lerFiltrosPagamentos({ competencia: "0000-01" }).competencia).toBe(0);
  });

  it("programa em maiúsculas; situação só G/P/C/D/E", () => {
    const f = lerFiltrosPagamentos({ programa: "pa01", situacao: "g" });
    expect(f.programa).toBe("PA01");
    expect(f.situacao).toBe("G");
    expect(lerFiltrosPagamentos({ situacao: "X" }).situacao).toBe("");
    expect(lerFiltrosPagamentos({ programa: "PA01'; --" }).programa).toBe("");
  });

  it("página inválida → 1; parâmetro repetido usa o primeiro", () => {
    expect(lerFiltrosPagamentos({ pagina: "abc" }).pagina).toBe(1);
    expect(lerFiltrosPagamentos({ pagina: "-3" }).pagina).toBe(1);
    expect(lerFiltrosPagamentos({ pagina: ["2", "5"] }).pagina).toBe(2);
  });
});

describe("número do pagamento na rota", () => {
  it("inteiro positivo", () => {
    expect(lerNumPagamento("42")).toBe(42);
    expect(lerNumPagamento("0")).toBeNull();
    expect(lerNumPagamento("abc")).toBeNull();
    expect(lerNumPagamento("1e3")).toBeNull();
    expect(lerNumPagamento("9999999999")).toBeNull();
  });
});
