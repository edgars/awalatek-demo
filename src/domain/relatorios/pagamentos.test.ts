import { describe, expect, it } from "vitest";
import {
  descricaoStatus,
  descricaoTipo,
  lerFiltrosRelatorioPagamentos,
  montarRelatorioPagamentos,
  normalizarFiltroPrograma,
  paginarRelatorioPagamentos,
  TITULO_RELATORIO_PAGAMENTOS,
  type LinhaRelatorio,
  type PagamentoLido,
} from "./pagamentos";

let seq = 0;
function pg(over: Partial<PagamentoLido> = {}): PagamentoLido {
  seq += 1;
  return {
    numPagamento: seq,
    numCpf: "01234567890",
    codPrograma: "P1",
    anoMesRef: 201101,
    vlrBruto: 10000,
    vlrDescontoTotal: 1000,
    vlrLiquido: 9000,
    vlrAbono: 100,
    tipoPgto: "N",
    sitPagamento: "G",
    beneficiario: { nomeCompleto: "MARIA APARECIDA DA SILVA", uf: "SP" },
    ...over,
  };
}

const ANO_2011 = { compIni: 201101, compFim: 201112, programa: "" };
const subtotais = (l: readonly LinhaRelatorio[]) => l.filter((x) => x.tipo === "subtotal");
const tipos = (l: readonly LinhaRelatorio[]) => l.map((x) => (x.tipo === "detalhe" ? `d:${x.codPrograma}` : `s:${x.codPrograma}`));

describe("RELPGT — filtros (FR-REL-01)", () => {
  it("RK-c1a8ff5dbe7b (RELPGT:83): competência > final encerra a leitura; < inicial não é lida", () => {
    const r = montarRelatorioPagamentos([pg({ anoMesRef: 201012 }), pg({ anoMesRef: 201101 }), pg({ anoMesRef: 201201 })], ANO_2011);
    expect(r.total.qtd).toBe(1);
    expect(r.linhas.filter((l) => l.tipo === "detalhe").map((l) => (l.tipo === "detalhe" ? l.competencia : 0))).toEqual([201101]);
  });

  it("RK-5a5f1426d63d (RELPGT:87): filtro de programa; vazio ou 0 = todos", () => {
    const filas = [pg({ codPrograma: "P1" }), pg({ codPrograma: "P2" }), pg({ codPrograma: "P1" })];
    const r = montarRelatorioPagamentos(filas, { ...ANO_2011, programa: "P1" });
    expect(tipos(r.linhas)).toEqual(["d:P1", "d:P1", "s:P1"]);
    expect(montarRelatorioPagamentos(filas, { ...ANO_2011, programa: "0" }).total.qtd).toBe(3);
    expect(montarRelatorioPagamentos(filas, { ...ANO_2011, programa: "" }).total.qtd).toBe(3);
    expect(normalizarFiltroPrograma(" 0000 ")).toBe("");
    expect(normalizarFiltroPrograma("pa01")).toBe("PA01");
  });
});

describe("RELPGT — corte de controle (FR-REL-02)", () => {
  it("RK-7c5773e59cfe (RELPGT:93): dois programas → subtotal de cada um e total 3", () => {
    const r = montarRelatorioPagamentos([pg({ codPrograma: "P1" }), pg({ codPrograma: "P1" }), pg({ codPrograma: "P2" })], ANO_2011);
    expect(tipos(r.linhas)).toEqual(["d:P1", "d:P1", "s:P1", "d:P2", "s:P2"]);
    expect(subtotais(r.linhas)).toEqual([
      { tipo: "subtotal", codPrograma: "P1", qtd: 2, bruto: 20000, liquido: 18000 },
      { tipo: "subtotal", codPrograma: "P2", qtd: 1, bruto: 10000, liquido: 9000 },
    ]);
    expect(r.total).toEqual({ qtd: 3, bruto: 30000, desconto: 3000, liquido: 27000, abono: 300 });
  });

  it("RK-7c5773e59cfe (RELPGT:93): tramos — o mesmo programa pode ter vários subtotais", () => {
    const r = montarRelatorioPagamentos(
      [pg({ anoMesRef: 201102, codPrograma: "P2" }), pg({ anoMesRef: 201101, codPrograma: "P2" }), pg({ anoMesRef: 201102, codPrograma: "P1" })],
      ANO_2011,
    );
    expect(subtotais(r.linhas).map((s) => s.codPrograma)).toEqual(["P2", "P1", "P2"]);
  });

  it("último programa de uma competência funde com o primeiro da seguinte", () => {
    const r = montarRelatorioPagamentos([pg({ anoMesRef: 201101, codPrograma: "P2" }), pg({ anoMesRef: 201102, codPrograma: "P2" })], ANO_2011);
    expect(subtotais(r.linhas)).toEqual([{ tipo: "subtotal", codPrograma: "P2", qtd: 2, bruto: 20000, liquido: 18000 }]);
  });

  it("RK-65a445d0bcfe (RELPGT:173): último subtotal só se houve registro; vazio → totais zero", () => {
    const r = montarRelatorioPagamentos([], ANO_2011);
    expect(r.linhas).toEqual([]);
    expect(r.paginas).toEqual([]);
    expect(r.total).toEqual({ qtd: 0, bruto: 0, desconto: 0, liquido: 0, abono: 0 });
    const um = montarRelatorioPagamentos([pg()], ANO_2011);
    expect(um.linhas.at(-1)).toEqual({ tipo: "subtotal", codPrograma: "P1", qtd: 1, bruto: 10000, liquido: 9000 });
  });
});

describe("RELPGT — descrições e máscara (FR-REL-03)", () => {
  it("RK-b0f53e1b01b3 (RELPGT:116): tipo N/D/T; outro → OUTRO", () => {
    expect(["N", "D", "T", "X", ""].map(descricaoTipo)).toEqual(["NORMAL", "DECIMO", "TERCEIRO", "OUTRO", "OUTRO"]);
  });

  it("RK-4fcb39638b68 (RELPGT:128): status truncados; outro → OUTRO", () => {
    expect(["G", "P", "C", "D", "E", "Z"].map(descricaoStatus)).toEqual(["GERADO", "PAGO", "CANCELAD", "DEVOLVID", "ESTORNAD", "OUTRO"]);
  });

  it("detalhe: status C, tipo X, CPF mascarado, nome 30 e UF", () => {
    const r = montarRelatorioPagamentos(
      [pg({ sitPagamento: "C", tipoPgto: "X", beneficiario: { nomeCompleto: "A".repeat(29) + "BCDEF", uf: "RJ" } })],
      ANO_2011,
    );
    const d = r.linhas[0];
    expect(d).toMatchObject({ statusDesc: "CANCELAD", tipoDesc: "OUTRO", cpfMascarado: "***.345.678-90", uf: "RJ" });
    expect(d?.tipo === "detalhe" && d.nome).toBe("A".repeat(29) + "B");
    expect(JSON.stringify(r)).not.toContain("01234567890");
  });

  it("beneficiário inexistente → nome e UF em branco", () => {
    const r = montarRelatorioPagamentos([pg({ beneficiario: null })], ANO_2011);
    expect(r.linhas[0]).toMatchObject({ nome: "", uf: "" });
  });
});

describe("RELPGT — paginação (FR-REL-04)", () => {
  it("RK-e6e70b3b6737 (RELPGT:144): 60 detalhes → página 1 com 55, página 2 com 5 (+ subtotal)", () => {
    const r = montarRelatorioPagamentos(Array.from({ length: 60 }, () => pg()), ANO_2011);
    expect(r.paginas).toHaveLength(2);
    expect(r.paginas[0]!.filter((l) => l.tipo === "detalhe")).toHaveLength(55);
    expect(r.paginas[1]!.filter((l) => l.tipo === "detalhe")).toHaveLength(5);
    expect(r.paginas[1]!.at(-1)?.tipo).toBe("subtotal");
  });

  it("RK-e6e70b3b6737 (RELPGT:144): subtotal soma 3 linhas e não verifica quebra", () => {
    // 10 P1 + subtotal (3) → linha 19; mais 42 P2 → linha 61 → 43º detalhe P2 vai à página 2.
    const r = montarRelatorioPagamentos([...Array.from({ length: 10 }, () => pg({ codPrograma: "P1" })), ...Array.from({ length: 50 }, () => pg({ codPrograma: "P2" }))], ANO_2011);
    expect(r.paginas[0]!.filter((l) => l.tipo === "detalhe")).toHaveLength(52);
    expect(r.paginas[0]!.filter((l) => l.tipo === "subtotal")).toHaveLength(1);
    expect(r.paginas[1]!.filter((l) => l.tipo === "detalhe")).toHaveLength(8);
  });

  it("subtotal com #LINHA já no limite fica na página corrente", () => {
    const linhas = montarRelatorioPagamentos(Array.from({ length: 55 }, () => pg()), ANO_2011).linhas;
    const p = paginarRelatorioPagamentos(linhas);
    expect(p).toHaveLength(1);
    expect(p[0]).toHaveLength(56);
  });

  it("título literal do cabeçalho", () => {
    expect(TITULO_RELATORIO_PAGAMENTOS).toBe("SIFAP - RELATORIO ANALITICO DE PAGAMENTOS");
  });
});

describe("filtros da tela", () => {
  it("competências AAAA-MM ou AAAAMM; inválidas → 0; programa 0 → todos", () => {
    expect(lerFiltrosRelatorioPagamentos({ compIni: "2011-01", compFim: "201112", programa: "0", pagina: "2" })).toEqual({
      compIni: 201101,
      compFim: 201112,
      programa: "",
      pagina: 2,
      impressao: false,
    });
    expect(lerFiltrosRelatorioPagamentos({ compIni: "2011-13", compFim: ["x"], programa: "pa01", pagina: "-1", impressao: "1" })).toEqual({
      compIni: 0,
      compFim: 0,
      programa: "PA01",
      pagina: 1,
      impressao: true,
    });
    expect(lerFiltrosRelatorioPagamentos({ programa: "<script>" }).programa).toBe("");
  });
});
