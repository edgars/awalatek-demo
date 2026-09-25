import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { lerQuirks, QUIRKS_PADRAO } from "@/domain/quirks";
import { consolidar } from "@/domain/relatorios/consolidado";
import { TabelasConsolidado } from "./TabelasConsolidado";

// Tabela "Por região" da tela 4.19 nos dois modos de D10 (a versão imprimível usa a mesma tabela).

function linhasRegiao(html: string): string[] {
  const bloco = html.slice(html.indexOf('id="bloco-regiao"'), html.indexOf('id="bloco-situacao"'));
  return [...bloco.matchAll(/<th[^>]*scope="row"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1] ?? "");
}

const pagos = [
  { anoMesRef: 201101, codRegiao: 22, vlrBruto: 10000, vlrDescontoTotal: 100, vlrLiquido: 9900, sitPagamento: "G" },
  { anoMesRef: 201101, codRegiao: 99, vlrBruto: 20000, vlrDescontoTotal: 200, vlrLiquido: 19800, sitPagamento: "G" },
];

describe("TabelasConsolidado — linhas de região", () => {
  it("legado: 5 linhas, sem NAO CLASSIFICADA", () => {
    const html = renderToStaticMarkup(createElement(TabelasConsolidado, { r: consolidar(201101, pagos, QUIRKS_PADRAO) }));
    expect(linhasRegiao(html)).toEqual(["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE"]);
    expect(html).not.toContain("NAO CLASSIFICADA");
  });

  it("CORRECAO(D10): 6 linhas, a sexta NAO CLASSIFICADA com o pagamento da região 99", () => {
    const r = consolidar(201101, pagos, lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D10" }));
    const html = renderToStaticMarkup(createElement(TabelasConsolidado, { r }));
    expect(linhasRegiao(html)).toEqual(["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE", "NAO CLASSIFICADA"]);
    const linha = html.slice(html.indexOf("NAO CLASSIFICADA"));
    expect(linha.slice(0, linha.indexOf("</tr>"))).toContain("R$ 200,00");
  });
});
