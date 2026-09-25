import { describe, expect, it } from "vitest";
import { LINHA_INICIAL, MAX_LINHAS, paginar, precisaNovaPagina } from "./paginacao";

const n = (k: number) => Array.from({ length: k }, (_, i) => i + 1);

describe("paginação 66 linhas", () => {
  it("constantes do legado", () => {
    expect(MAX_LINHAS).toBe(66);
    expect(LINHA_INICIAL).toBe(99);
  });

  it("quebra quando #LINHA >= #MAX-LINHAS - 5", () => {
    expect(precisaNovaPagina(60)).toBe(false);
    expect(precisaNovaPagina(61)).toBe(true);
    expect(precisaNovaPagina(99)).toBe(true);
  });

  it("sem itens → sem páginas (sem cabeçalho)", () => {
    expect(paginar([], { linhaAposCabecalho: 6 })).toEqual([]);
  });

  it("cabeçalho em 6 → 55 detalhes por página", () => {
    const p = paginar(n(111), { linhaAposCabecalho: 6 });
    expect(p.map((x) => x.length)).toEqual([55, 55, 1]);
  });

  it("linha inicial configurável: cabeçalho em 7 → 54 por página (RELAUDIT)", () => {
    const p = paginar(n(60), { linhaAposCabecalho: 7 });
    expect(p.map((x) => x.length)).toEqual([54, 6]);
  });

  it("itens sem verificação não abrem página e somam suas linhas", () => {
    // 10 detalhes, 1 bloco de 3 que não verifica, depois detalhes.
    type I = { k: "d" | "s" };
    const itens: I[] = [...Array.from({ length: 10 }, () => ({ k: "d" as const })), { k: "s" }, ...Array.from({ length: 50 }, () => ({ k: "d" as const }))];
    const p = paginar(itens, { linhaAposCabecalho: 6, linhasDe: (i) => (i.k === "d" ? 1 : 3), verificaQuebra: (i) => i.k === "d" });
    // 6 + 10 + 3 = 19; cabem mais 42 detalhes (19 + 42 = 61) → página 1 com 53 itens.
    expect(p.map((x) => x.length)).toEqual([53, 8]);
  });
});
