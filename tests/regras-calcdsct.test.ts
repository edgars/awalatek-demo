import { describe, expect, it } from "vitest";
import { calcularDescontos, type DescontoCadastrado } from "@/domain/calculo/descontos";

// Regras de CALCDSCT (FR-DSC-05) sem teste nominal: valor de cada tipo de desconto
// registrado. Cada teste recalcula os descontos de um pagamento com bruto 1.234,57
// e um único desconto, conferindo o item e o total gravado em centavos.
//
// Bruto 1.234,57: contribuição 7 % = 86,4199 → 86,41; teto 30 % = 370,371 → 370,37.

const HOJE = 20260924;
const BRUTO = 123457;
const CONTRIB = 8641;

function recalcular(d: Partial<DescontoCadastrado> & Pick<DescontoCadastrado, "tipoDesconto">) {
  const r = calcularDescontos({
    vlrBruto: BRUTO,
    dtHoje: HOJE,
    descontos: [{ occurrence: 1, vlrDesconto: 0, pctDesconto: "0.00", dtInicioDsct: 20260101, dtFimDsct: 0, ...d }],
  });
  expect(r.vlrContribuicao).toBe(CONTRIB);
  expect(r.vlrTeto).toBe(37037);
  expect(r.itens).toHaveLength(1);
  return { item: r.itens[0]?.vlrItem, total: r.vlrTotal };
}

describe("CALCDSCT — valor por tipo de desconto (FR-DSC-05)", () => {
  it("RK-5ebca43330fa (CALCDSCT:125): judicial 'J' com VLR-DSCT > 0 → valor fixo (ignora o percentual)", () => {
    expect(recalcular({ tipoDesconto: "J", vlrDesconto: 12345, pctDesconto: "50.00" })).toEqual({ item: 12345, total: CONTRIB + 12345 });
  });

  it("RK-7ae0930278f4 (CALCDSCT:128): judicial 'J' sem valor fixo → #VLR-BRUTO × (PCT / 100), truncado", () => {
    // 1.234,57 × 0,075 = 92,59275 → 92,59
    expect(recalcular({ tipoDesconto: "J", pctDesconto: "7.50" })).toEqual({ item: 9259, total: CONTRIB + 9259 });
  });

  it("RK-813b10f0a6b2 (CALCDSCT:135): pensão 'P' com VLR-DSCT > 0 → valor fixo", () => {
    expect(recalcular({ tipoDesconto: "P", vlrDesconto: 12345, pctDesconto: "50.00" })).toEqual({ item: 12345, total: CONTRIB + 12345 });
  });

  it("RK-eb8f0ba106d7 (CALCDSCT:138): pensão 'P' sem valor fixo → #VLR-BRUTO × (PCT / 100), truncado", () => {
    expect(recalcular({ tipoDesconto: "P", pctDesconto: "7.50" })).toEqual({ item: 9259, total: CONTRIB + 9259 });
  });

  it("RK-88bafd73a684 (CALCDSCT:144): imposto 'I' → sempre #VLR-BRUTO × (PCT / 100), mesmo com valor fixo", () => {
    expect(recalcular({ tipoDesconto: "I", vlrDesconto: 99999, pctDesconto: "7.50" })).toEqual({ item: 9259, total: CONTRIB + 9259 });
  });

  it("RK-a6687439e293 (CALCDSCT:149): sindical 'S' → #VLR-BRUTO × 0,01 (ignora valor fixo e percentual)", () => {
    // 1.234,57 × 0,01 = 12,3457 → 12,34
    expect(recalcular({ tipoDesconto: "S", vlrDesconto: 99999, pctDesconto: "50.00" })).toEqual({ item: 1234, total: CONTRIB + 1234 });
  });

  it("RK-43bd100339a0 (CALCDSCT:153): administrativo 'A' com VLR-DSCT > 0 → valor fixo", () => {
    expect(recalcular({ tipoDesconto: "A", vlrDesconto: 12345, pctDesconto: "50.00" })).toEqual({ item: 12345, total: CONTRIB + 12345 });
    // sem valor fixo cai no percentual (RK-62ff9a96f5f9)
    expect(recalcular({ tipoDesconto: "A", pctDesconto: "7.50" }).item).toBe(9259);
  });
});
