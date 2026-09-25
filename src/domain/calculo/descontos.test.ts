import { describe, expect, it } from "vitest";
import { dec } from "../money";
import {
  calcularDescontos,
  contribuicaoSocial,
  descontoVigente,
  valorDoDesconto,
  type DescontoCadastrado,
} from "./descontos";

const HOJE = 20260924;

function desconto(p: Partial<DescontoCadastrado> & Pick<DescontoCadastrado, "tipoDesconto">): DescontoCadastrado {
  return { occurrence: 1, vlrDesconto: 0, pctDesconto: "0.00", dtInicioDsct: 20260101, dtFimDsct: 0, ...p };
}

describe("FR-DSC-02 — contribuição progressiva (RK-83b28551c287, RK-70cdacb35c1a)", () => {
  it.each([
    ["500.00", "15"], // 3 %
    ["500.01", "25"], // 5 % → 25,0005 → 25,00
    ["1000.00", "50"],
    ["2000.00", "140"], // 7 %
    ["9999.99", "899.99"], // 9 % → 899,9991 → 899,99
    ["10000.00", "0"], // nenhum tramo
  ])("bruto %s → %s", (bruto, esperado) => {
    expect(contribuicaoSocial(dec(bruto)).toString()).toBe(esperado);
  });
});

describe("FR-DSC-04 — vigência (RK-e3256815c49a, RK-873a78f8fdfb)", () => {
  it("fim 0 = indefinido", () => expect(descontoVigente({ dtInicioDsct: 20200101, dtFimDsct: 0 }, HOJE)).toBe(true));
  it("fim < hoje → fora", () => expect(descontoVigente({ dtInicioDsct: 20200101, dtFimDsct: 20260923 }, HOJE)).toBe(false));
  it("fim = hoje → vigente", () => expect(descontoVigente({ dtInicioDsct: 20200101, dtFimDsct: HOJE }, HOJE)).toBe(true));
  it("início > hoje → fora", () => expect(descontoVigente({ dtInicioDsct: 20260925, dtFimDsct: 0 }, HOJE)).toBe(false));
  it("início = hoje → vigente", () => expect(descontoVigente({ dtInicioDsct: HOJE, dtFimDsct: 0 }, HOJE)).toBe(true));
});

describe("FR-DSC-05 — tipos (RK-5d6c495417bb … RK-62ff9a96f5f9)", () => {
  const bruto = dec("1234.57");
  it.each(["J", "P", "A"])("%s: valor fixo quando > 0", (tipo) => {
    expect(valorDoDesconto(desconto({ tipoDesconto: tipo, vlrDesconto: 12345, pctDesconto: "50.00" }), bruto)?.toString()).toBe(
      "123.45",
    );
  });
  it.each(["J", "P", "A"])("%s: senão bruto × pct/100, truncado", (tipo) => {
    // 1234,57 × 0,075 = 92,59275 → 92,59
    expect(valorDoDesconto(desconto({ tipoDesconto: tipo, pctDesconto: "7.50" }), bruto)?.toString()).toBe("92.59");
  });
  it("I: sempre percentual (ignora valor fixo)", () => {
    expect(valorDoDesconto(desconto({ tipoDesconto: "I", vlrDesconto: 99999, pctDesconto: "7.50" }), bruto)?.toString()).toBe(
      "92.59",
    );
  });
  it("S: 1 % do bruto (ignora valor e pct)", () => {
    // 12,3457 → 12,34
    expect(valorDoDesconto(desconto({ tipoDesconto: "S", vlrDesconto: 99999, pctDesconto: "9.00" }), bruto)?.toString()).toBe(
      "12.34",
    );
  });
  it.each(["C", "X", "j", ""])("tipo %j desconhecido → null (IGNORE)", (tipo) => {
    expect(valorDoDesconto(desconto({ tipoDesconto: tipo, vlrDesconto: 5000 }), bruto)).toBeNull();
  });
});

describe("FR-DSC-03 — teto 30 % dentro do loop (RK-746a7b5738cf, RK-3cde6c2d52e2, RK-636a3924f593, RK-07b224be3337, RK-f27df0e84c50)", () => {
  it("teto = bruto × 0,30 truncado", () => {
    // 1234,57 × 0,30 = 370,371 → 370,37
    expect(calcularDescontos({ vlrBruto: 123457, descontos: [], dtHoje: HOJE }).vlrTeto).toBe(37037);
  });

  it("judicial não é limitado", () => {
    // contrib 50,00 + J 400,00 = 450,00 > teto 300,00, mas só houve J
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [desconto({ tipoDesconto: "J", pctDesconto: "40.00" })],
      dtHoje: HOJE,
    });
    expect(r.vlrTotal).toBe(45000);
    expect(r.itens[0]).toMatchObject({ vlrItem: 40000, vlrTotalApos: 45000, tetoAplicado: false });
  });

  it("LEGACY-QUIRK(D2): não judicial posterior recorta o total inclusive o judicial", () => {
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        desconto({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 40000 }),
        desconto({ occurrence: 2, tipoDesconto: "S" }),
      ],
      dtHoje: HOJE,
    });
    // 50 + 400 = 450 ; + 10 = 460 > 300 → 300
    expect(r.vlrTotal).toBe(30000);
    expect(r.itens[1]).toMatchObject({ vlrItem: 1000, vlrTotalApos: 30000, tetoAplicado: true });
  });

  it("não judicial ANTES do judicial: o judicial pode ultrapassar o teto depois", () => {
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        desconto({ occurrence: 1, tipoDesconto: "P", vlrDesconto: 29000 }), // 50 + 290 = 340 → 300
        desconto({ occurrence: 2, tipoDesconto: "J", vlrDesconto: 10000 }), // 300 + 100 = 400 (sem teto)
      ],
      dtHoje: HOJE,
    });
    expect(r.itens.map((i) => [i.vlrTotalApos, i.tetoAplicado])).toEqual([
      [30000, true],
      [40000, false],
    ]);
    expect(r.vlrTotal).toBe(40000);
  });

  it("tipo desconhecido também dispara o teto (NE 'J')", () => {
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        desconto({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 40000 }),
        desconto({ occurrence: 2, tipoDesconto: "X", vlrDesconto: 9900 }),
      ],
      dtHoje: HOJE,
    });
    expect(r.vlrTotal).toBe(30000);
    expect(r.itens[1]).toMatchObject({ aplicado: false, vlrItem: 0, tetoAplicado: true });
  });

  it("descontos fora de vigência não disparam o teto", () => {
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        desconto({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 40000 }),
        desconto({ occurrence: 2, tipoDesconto: "A", vlrDesconto: 5000, dtFimDsct: 20260923 }),
      ],
      dtHoje: HOJE,
    });
    expect(r.vlrTotal).toBe(45000);
    expect(r.foraDeVigencia).toEqual([2]);
    expect(r.itens).toHaveLength(1);
  });
});

describe("FR-DSC-06 — total truncado (RK-ed72fdc907a3, RK-462a16645319)", () => {
  it("cada item é truncado antes de acumular", () => {
    // bruto 333,33: contrib 3 % = 9,9999 → 9,99 ; S = 3,3333 → 3,33 ; I 0,50 % = 1,66665 → 1,66
    // total 14,98 (sem truncar por item seria 14,99985 → 14,99)
    const r = calcularDescontos({
      vlrBruto: 33333,
      descontos: [
        desconto({ occurrence: 1, tipoDesconto: "S" }),
        desconto({ occurrence: 2, tipoDesconto: "I", pctDesconto: "0.50" }),
      ],
      dtHoje: HOJE,
    });
    expect(r.vlrContribuicao).toBe(999);
    expect(r.itens.map((i) => i.vlrItem)).toEqual([333, 166]);
    expect(r.vlrTotal).toBe(1498);
  });

  it("processa na ordem de occurrence, independentemente da ordem recebida", () => {
    const r = calcularDescontos({
      vlrBruto: 100000,
      descontos: [
        desconto({ occurrence: 2, tipoDesconto: "S" }),
        desconto({ occurrence: 1, tipoDesconto: "J", vlrDesconto: 40000 }),
      ],
      dtHoje: HOJE,
    });
    expect(r.itens.map((i) => i.occurrence)).toEqual([1, 2]);
    expect(r.vlrTotal).toBe(30000);
  });

  it("rejeita centavos não inteiros", () => {
    expect(() => calcularDescontos({ vlrBruto: 1.5, descontos: [], dtHoje: HOJE })).toThrow();
  });
});
