import { describe, expect, it } from "vitest";
import {
  aplicarPadroesAuditoria,
  COLUNAS_CABECALHO_AUDITORIA,
  dataCalendarioValida,
  descricaoAcao,
  formatarHoraAuditoria,
  lerFiltrosRelatorioAuditoria,
  LINHA_APOS_CABECALHO_RELAUDIT,
  MENSAGENS_RELATORIO_AUDITORIA,
  montarRelatorioAuditoria,
  motivoFiltro,
  paginarRelatorioAuditoria,
  ROTULOS_RESUMO_AUDITORIA,
  saidaEfetiva,
  validarFiltrosRelatorioAuditoria,
  type EntradaRelatorioAuditoria,
  type EventoAuditoriaLido,
  type FiltrosRelatorioAuditoria,
} from "./auditoria";

let seq = 0;
function ev(over: Partial<EventoAuditoriaLido> = {}): EventoAuditoriaLido {
  seq += 1;
  return {
    numAuditoria: seq,
    dtEvento: 20110315,
    hrEvento: 101500,
    usrEvento: "BATCH",
    codAcao: "IN",
    tipoEntidade: "BENEFICIARIO",
    idEntidade: "01234567890",
    desAcao: "INCLUSAO DE BENEFICIARIO",
    ...over,
  };
}

const VAZIA: EntradaRelatorioAuditoria = { dtIni: 0, dtFim: 0, acao: "", usuario: "", tabela: "", saida: "" };
const HOJE = 20260925;
const F2011: FiltrosRelatorioAuditoria = { dtIni: 20110101, dtFim: 20111231, acao: "", usuario: "", tabela: "", saida: "T" };

describe("RELAUDIT — defaults (FR-AUD-01)", () => {
  it("RK-b4fe11eb2c22 (RELAUDIT:80): saída em branco → T; informada é mantida", () => {
    expect(aplicarPadroesAuditoria(VAZIA, HOJE).saida).toBe("T");
    expect(aplicarPadroesAuditoria({ ...VAZIA, saida: " " }, HOJE).saida).toBe("T");
    expect(aplicarPadroesAuditoria({ ...VAZIA, saida: "I" }, HOJE).saida).toBe("I");
  });

  it("RK-d99bee200be3 (RELAUDIT:84): data inicial 0 → 19970101", () => {
    expect(aplicarPadroesAuditoria(VAZIA, HOJE).dtIni).toBe(19970101);
    expect(aplicarPadroesAuditoria({ ...VAZIA, dtIni: 20100101 }, HOJE).dtIni).toBe(20100101);
  });

  it("RK-819d962f567a (RELAUDIT:87): data final 0 → hoje", () => {
    expect(aplicarPadroesAuditoria(VAZIA, HOJE).dtFim).toBe(HOJE);
    expect(aplicarPadroesAuditoria({ ...VAZIA, dtFim: 20101231 }, HOJE).dtFim).toBe(20101231);
  });

  it("sem filtros: período 19970101–hoje, saída T", () => {
    const r = montarRelatorioAuditoria([ev({ dtEvento: 19961231 }), ev({ dtEvento: 19970101 }), ev({ dtEvento: HOJE }), ev({ dtEvento: HOJE + 1 })], aplicarPadroesAuditoria(VAZIA, HOJE));
    expect(r.saida).toBe("T");
    expect(r.resumo.total).toBe(2);
    expect(r.linhas.map((l) => l.dtEvento)).toEqual([19970101, HOJE]);
  });
});

describe("RELAUDIT — período (FR-AUD-02)", () => {
  it("RK-713713b19064 (RELAUDIT:93): evento antes da data inicial não é lido nem contado", () => {
    const r = montarRelatorioAuditoria([ev({ dtEvento: 20101231 }), ev({ dtEvento: 20110101 })], F2011);
    expect(r.resumo).toMatchObject({ total: 1, exibidos: 1, filtrados: 0 });
  });

  it("RK-aae01121639f (RELAUDIT:96): evento depois da data final encerra a leitura; limites inclusivos", () => {
    const r = montarRelatorioAuditoria([ev({ dtEvento: 20120101 }), ev({ dtEvento: 20111231 }), ev({ dtEvento: 20110101 })], F2011);
    expect(r.resumo.total).toBe(2);
    expect(r.linhas.map((l) => l.dtEvento)).toEqual([20110101, 20111231]);
  });

  it("ordem de leitura dtEvento → hrEvento → numAuditoria", () => {
    const r = montarRelatorioAuditoria(
      [ev({ numAuditoria: 903, dtEvento: 20110102, hrEvento: 80000 }), ev({ numAuditoria: 902, dtEvento: 20110101, hrEvento: 90000 }), ev({ numAuditoria: 901, dtEvento: 20110101, hrEvento: 90000 }), ev({ numAuditoria: 900, dtEvento: 20110101, hrEvento: 235959 })],
      F2011,
    );
    expect(r.linhas.map((l) => l.numAuditoria)).toEqual([901, 902, 900, 903]);
  });

  it("período invertido: nada no intervalo", () => {
    const r = montarRelatorioAuditoria([ev()], { ...F2011, dtIni: 20111231, dtFim: 20110101 });
    expect(r.resumo).toMatchObject({ total: 0, exibidos: 0, filtrados: 0 });
  });
});

describe("RELAUDIT — exclusões (FR-AUD-03)", () => {
  it("RK-2e5c9f06f325 (RELAUDIT:105): EX nunca aparece e conta como filtrado", () => {
    const r = montarRelatorioAuditoria([ev({ codAcao: "EX" }), ev({ codAcao: "IN" })], F2011);
    expect(r.resumo).toMatchObject({ total: 2, exibidos: 1, filtrados: 1 });
    expect(r.linhas.map((l) => l.codAcao)).toEqual(["IN"]);
    expect(r.resumo.porAcao.outras).toBe(0);
  });

  it("EX é descartado antes de qualquer filtro (conta uma vez, mesmo sem casar os filtros)", () => {
    const e = ev({ codAcao: "EX", usrEvento: "OUTRO" });
    expect(motivoFiltro(e, { ...F2011, acao: "IN", usuario: "BATCH" })).toBe("EX");
    const r = montarRelatorioAuditoria([e], { ...F2011, acao: "EX" });
    expect(r.resumo).toMatchObject({ total: 1, exibidos: 0, filtrados: 1 });
  });
});

describe("RELAUDIT — filtros opcionais (FR-AUD-04)", () => {
  const eventos = () => [
    ev({ codAcao: "IN", usrEvento: "BATCH", tipoEntidade: "BENEFICIARIO" }),
    ev({ codAcao: "CO", usrEvento: "BATCH", tipoEntidade: "PAGAMENTO" }),
    ev({ codAcao: "IN", usrEvento: "MARIA", tipoEntidade: "PAGAMENTO" }),
    ev({ codAcao: "DV", usrEvento: "MARIA", tipoEntidade: "BENEFICIARIO" }),
  ];

  it("RK-b3ac1f6f4ede (RELAUDIT:111): ação em branco = todas", () => {
    expect(montarRelatorioAuditoria(eventos(), { ...F2011, acao: " " }).resumo).toMatchObject({ exibidos: 4, filtrados: 0 });
  });

  it("RK-be935d51d847 (RELAUDIT:112): ação informada filtra por igualdade (CO)", () => {
    const r = montarRelatorioAuditoria(eventos(), { ...F2011, acao: "CO" });
    expect(r.linhas.map((l) => l.codAcao)).toEqual(["CO"]);
    expect(r.resumo).toMatchObject({ total: 4, exibidos: 1, filtrados: 3 });
  });

  it("RK-78771795cd8b (RELAUDIT:119): usuário em branco = todos", () => {
    expect(montarRelatorioAuditoria(eventos(), { ...F2011, usuario: "" }).resumo.exibidos).toBe(4);
  });

  it("RK-bea2ff075a6c (RELAUDIT:120): usuário informado filtra por igualdade, sem espaços finais", () => {
    const r = montarRelatorioAuditoria([...eventos(), ev({ usrEvento: "BATCH  " })], { ...F2011, usuario: "BATCH" });
    expect(r.resumo).toMatchObject({ total: 5, exibidos: 3, filtrados: 2 });
    expect(montarRelatorioAuditoria(eventos(), { ...F2011, usuario: "BATCH  " }).resumo.exibidos).toBe(2);
  });

  it("RK-60326023cab9 (RELAUDIT:127): tabela em branco = todas", () => {
    expect(montarRelatorioAuditoria(eventos(), { ...F2011, tabela: "" }).resumo.exibidos).toBe(4);
  });

  it("RK-7f232f1dd913 (RELAUDIT:128): tabela informada filtra por igualdade", () => {
    const r = montarRelatorioAuditoria(eventos(), { ...F2011, tabela: "PAGAMENTO" });
    expect(r.linhas.map((l) => l.tabela)).toEqual(["PAGAMENTO", "PAGAMENTO"]);
    expect(r.resumo).toMatchObject({ exibidos: 2, filtrados: 2 });
  });

  it("filtros combinados: cada evento rejeitado conta uma única vez", () => {
    const r = montarRelatorioAuditoria(eventos(), { ...F2011, acao: "IN", usuario: "MARIA", tabela: "PAGAMENTO" });
    expect(r.resumo).toMatchObject({ total: 4, exibidos: 1, filtrados: 3 });
    expect(r.linhas[0]).toMatchObject({ codAcao: "IN", usuario: "MARIA", tabela: "PAGAMENTO" });
  });
});

describe("RELAUDIT — descrição e contagem por ação (FR-AUD-05)", () => {
  it("RK-6a74a1f56dab (RELAUDIT:137): IN/AL/CO/CN/DV e desconhecida → OUTRA", () => {
    expect(["IN", "AL", "CO", "CN", "DV", "ZZ", ""].map(descricaoAcao)).toEqual(["INCLUSAO", "ALTERACAO", "CONCILIACAO", "CONSULTA", "DIVERGENCIA", "OUTRA", "OUTRA"]);
  });

  it("resumo conta só os exibidos por ação", () => {
    const r = montarRelatorioAuditoria(
      [ev({ codAcao: "IN" }), ev({ codAcao: "IN" }), ev({ codAcao: "AL" }), ev({ codAcao: "CO" }), ev({ codAcao: "CN" }), ev({ codAcao: "DV" }), ev({ codAcao: "ZZ" }), ev({ codAcao: "EX" }), ev({ codAcao: "AL", usrEvento: "X" })],
      { ...F2011, usuario: "BATCH" },
    );
    expect(r.resumo).toEqual({
      total: 9,
      exibidos: 7,
      filtrados: 2,
      porAcao: { inclusao: 2, alteracao: 1, consulta: 1, conciliacao: 1, divergencia: 1, outras: 1 },
    });
    expect(r.linhas.find((l) => l.codAcao === "ZZ")?.acaoDesc).toBe("OUTRA");
  });

  it("rótulos literais do resumo", () => {
    expect(Object.values(ROTULOS_RESUMO_AUDITORIA)).toEqual([
      "RESUMO AUDITORIA",
      "TOTAL REGISTROS....:",
      "EXIBIDOS...........:",
      "FILTRADOS..........:",
      "POR TIPO ACAO:",
      "  INCLUSOES........:",
      "  ALTERACOES.......:",
      "  CONSULTAS........:",
      "  CONCILIACOES.....:",
      "  DIVERGENCIAS.....:",
      "  OUTRAS...........:",
    ]);
  });
});

describe("RELAUDIT — saída e paginação (FR-AUD-06)", () => {
  it("hora HH:MM:SS com zeros à esquerda", () => {
    expect(formatarHoraAuditoria(90503)).toBe("09:05:03");
    expect(formatarHoraAuditoria(0)).toBe("00:00:00");
    expect(formatarHoraAuditoria(235959)).toBe("23:59:59");
  });

  it("RK-4e229cab081e (RELAUDIT:169): saída T sem descrição; I com descrição; outro valor ≠ T → I", () => {
    const e = ev({ hrEvento: 90503, usrEvento: "BATCH   ", desAcao: "CONCILIADO OK" });
    const t = montarRelatorioAuditoria([e], F2011);
    expect(t.linhas[0]).toEqual({
      numAuditoria: e.numAuditoria,
      dtEvento: 20110315,
      hora: "09:05:03",
      usuario: "BATCH",
      codAcao: "IN",
      acaoDesc: "INCLUSAO",
      tabela: "BENEFICIARIO",
      chave: "01234567890",
      descricao: null,
    });
    const i = montarRelatorioAuditoria([e], { ...F2011, saida: "I" });
    expect(i.saida).toBe("I");
    expect(i.linhas[0]?.descricao).toBe("CONCILIADO OK");
    expect(saidaEfetiva("X")).toBe("I");
    expect(saidaEfetiva("T")).toBe("T");
  });

  it("RK-9ec291e3f4e5 (RELAUDIT:164): 60 eventos → páginas de 54 + 6; 54 → 1 página; 0 → nenhuma", () => {
    const n = (k: number) => Array.from({ length: k }, () => ev());
    expect(montarRelatorioAuditoria(n(60), F2011).paginas.map((p) => p.length)).toEqual([54, 6]);
    expect(paginarRelatorioAuditoria(n(54)).map((p) => p.length)).toEqual([54]);
    expect(paginarRelatorioAuditoria(n(109)).map((p) => p.length)).toEqual([54, 54, 1]);
    expect(paginarRelatorioAuditoria([])).toEqual([]);
  });

  it("RK-7083ebf609a1 (RELAUDIT:210): cabeçalho deixa #LINHA = 7; colunas T (100 guiões) e I (120, DESCRICAO)", () => {
    expect(LINHA_APOS_CABECALHO_RELAUDIT).toBe(7);
    expect(COLUNAS_CABECALHO_AUDITORIA.T.guioes).toBe(100);
    expect(COLUNAS_CABECALHO_AUDITORIA.I.guioes).toBe(120);
    expect(COLUNAS_CABECALHO_AUDITORIA.T.colunas).toBe("DATA       HORA     USUARIO  ACAO" + " ".repeat(20) + "TABELA          CHAVE");
    expect(COLUNAS_CABECALHO_AUDITORIA.I.colunas.endsWith("CHAVE               DESCRICAO")).toBe(true);
  });
});

describe("filtros da tela /relatorios/auditoria", () => {
  const M = MENSAGENS_RELATORIO_AUDITORIA;

  it("sem parâmetros → defaults do legado", () => {
    const v = validarFiltrosRelatorioAuditoria(lerFiltrosRelatorioAuditoria({}), HOJE);
    expect(v).toEqual({ ok: true, filtros: { dtIni: 19970101, dtFim: HOJE, acao: "", usuario: "", tabela: "", saida: "T" } });
  });

  it("aceita AAAAMMDD e AAAA-MM-DD; 0 = vazio; ação e saída em maiúsculas", () => {
    const f = lerFiltrosRelatorioAuditoria({ dtIni: "2011-01-01", dtFim: "20111231", acao: "co", usuario: "BATCH  ", tabela: "PAGAMENTO", saida: "i", pagina: "2", impressao: "1" });
    expect(f).toEqual({ dtIni: 20110101, dtFim: 20111231, acao: "CO", usuario: "BATCH", tabela: "PAGAMENTO", saida: "I", pagina: 2, impressao: true });
    expect(lerFiltrosRelatorioAuditoria({ dtIni: "0" }).dtIni).toBe(0);
  });

  it("inválidos → erro no campo", () => {
    const v = validarFiltrosRelatorioAuditoria(
      lerFiltrosRelatorioAuditoria({ dtIni: "invalido", dtFim: "20111340", acao: "EX", usuario: "123456789", tabela: "X".repeat(16), saida: "Z" }),
      HOJE,
    );
    expect(v).toEqual({
      ok: false,
      erros: { dtIni: M.dataInvalida, dtFim: M.dataInvalida, acao: M.acaoInvalida, usuario: M.usuarioInvalido, tabela: M.tabelaInvalida, saida: M.saidaInvalida },
    });
  });

  it("período invertido (após defaults) → erro na data inicial", () => {
    expect(validarFiltrosRelatorioAuditoria(lerFiltrosRelatorioAuditoria({ dtIni: "20111231", dtFim: "20110101" }), HOJE)).toEqual({ ok: false, erros: { dtIni: M.periodoInvertido } });
    expect(validarFiltrosRelatorioAuditoria(lerFiltrosRelatorioAuditoria({ dtIni: "20300101" }), HOJE)).toEqual({ ok: false, erros: { dtIni: M.periodoInvertido } });
  });

  it("data de calendário real: 20110231, 2011-04-31 e 20110229 → Data inválida; 20120229 ok", () => {
    for (const d of ["20110231", "2011-04-31", "20110229"]) {
      expect(validarFiltrosRelatorioAuditoria(lerFiltrosRelatorioAuditoria({ dtIni: d }), HOJE)).toEqual({ ok: false, erros: { dtIni: M.dataInvalida } });
    }
    expect(lerFiltrosRelatorioAuditoria({ dtFim: "20120229" }).dtFim).toBe(20120229);
    expect(dataCalendarioValida(2000, 2, 29)).toBe(true);
    expect(dataCalendarioValida(1900, 2, 29)).toBe(false);
  });

  it("usuário e tabela: maiúsculas e só espaços finais descartados (iniciais contam)", () => {
    const f = lerFiltrosRelatorioAuditoria({ usuario: "batch  ", tabela: "pagamento" });
    expect([f.usuario, f.tabela]).toEqual(["BATCH", "PAGAMENTO"]);
    expect(lerFiltrosRelatorioAuditoria({ usuario: "  batch" }).usuario).toBe("  BATCH");
    const v = validarFiltrosRelatorioAuditoria(f, HOJE);
    if (!v.ok) throw new Error("esperado ok");
    const r = montarRelatorioAuditoria([ev({ usrEvento: "BATCH", tipoEntidade: "PAGAMENTO", dtEvento: 20110101 }), ev({ usrEvento: "MARIA", dtEvento: 20110101 })], v.filtros);
    expect(r.resumo).toMatchObject({ exibidos: 1, filtrados: 1 });
    // Espaço inicial é significativo (semântica de campo A): não casa com "BATCH".
    const v2 = validarFiltrosRelatorioAuditoria(lerFiltrosRelatorioAuditoria({ usuario: " batch" }), HOJE);
    if (!v2.ok) throw new Error("esperado ok");
    expect(montarRelatorioAuditoria([ev({ dtEvento: 20110101 })], v2.filtros).resumo.exibidos).toBe(0);
  });

  it("página inválida → 1", () => {
    expect(lerFiltrosRelatorioAuditoria({ pagina: "abc" }).pagina).toBe(1);
    expect(lerFiltrosRelatorioAuditoria({ pagina: ["3", "4"] }).pagina).toBe(3);
  });
});
