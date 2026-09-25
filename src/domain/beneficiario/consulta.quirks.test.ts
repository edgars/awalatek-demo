import { describe, expect, it } from "vitest";
import { mascaraCpfConsulta } from "../cpf";
import { lerQuirks, QUIRKS_PADRAO } from "../quirks";
import {
  MAX_HISTORICO,
  montarFicha,
  MSG_NENHUM_PAGAMENTO,
  selecionarHistorico,
  TITULO_HISTORICO,
  TITULO_HISTORICO_RECENTES,
  tituloHistorico,
  type PagamentoConsulta,
} from "./consulta";

// Correcciones configurables del grupo C (consulta): D7 (máscara) y D21 (historial).

const LEGADO = QUIRKS_PADRAO;
const D7 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D7" });
const D21 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "D21" });
const TODOS = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "ALL" }); // ALL não inclui D7
const TODOS_D7 = lerQuirks({ SIFAP_QUIRKS_CORRIGIDOS: "ALL,D7" });
const CPF = "12345678909";

function pgto(numPagamento: number, extra: Partial<PagamentoConsulta> = {}): PagamentoConsulta {
  return {
    numPagamento,
    numCpf: CPF,
    anoMesRef: 202500 + numPagamento,
    vlrBruto: 10000 + numPagamento,
    vlrLiquido: 9000 + numPagamento,
    sitPagamento: "G",
    tipoPgto: "N",
    ...extra,
  };
}

describe("D7 — máscara da consulta", () => {
  it("legado (default e explícito): zero à esquerda → 3 primeiros dígitos", () => {
    expect(mascaraCpfConsulta("01234567890")).toBe("012.***.***-**");
    expect(mascaraCpfConsulta("01234567890", LEGADO)).toBe("012.***.***-**");
    expect(mascaraCpfConsulta("1234567890", LEGADO)).toBe("012.***.***-**");
    expect(mascaraCpfConsulta("12345678909", LEGADO)).toBe("***.***.789-09");
  });

  it("corrigido: sempre ***.***.XXX-XX (dígitos 7–9 e 10–11 do CPF de 11 com zeros)", () => {
    expect(mascaraCpfConsulta("01234567890", D7)).toBe("***.***.678-90");
    expect(mascaraCpfConsulta("1234567890", D7)).toBe("***.***.678-90");
    expect(mascaraCpfConsulta("00012345678", D7)).toBe("***.***.456-78");
    expect(mascaraCpfConsulta("", D7)).toBe("***.***.000-00");
    expect(mascaraCpfConsulta("12345678909", D7)).toBe("***.***.789-09");
    expect(mascaraCpfConsulta("10000000000", D7)).toBe("***.***.000-00");
    expect(mascaraCpfConsulta("123.456.789-09", D7)).toBe("***.***.789-09");
    expect(mascaraCpfConsulta("01234567890", TODOS_D7)).toBe("***.***.678-90");
  });

  it("ALL sem D7 explícito mantém a máscara legada (exige aprovação de auditoria)", () => {
    expect(mascaraCpfConsulta("01234567890", TODOS)).toBe("012.***.***-**");
  });

  it("outra correção ativa (D21) não altera a máscara legada", () => {
    expect(mascaraCpfConsulta("01234567890", D21)).toBe("012.***.***-**");
  });

  it("montarFicha aplica a configuração e não expõe o CPF", () => {
    const base = {
      nomeCompleto: "FULANO DE TAL",
      dtNascimento: 19800101,
      sexo: "M",
      logradouro: null,
      municipio: null,
      uf: null,
      cep: null,
      sitBeneficiario: "A",
      codPrograma: "PA01",
      vlrRendaFamiliar: 120000,
      numDependentes: 0,
      codRegiao: 1,
      nis: null,
      dtCadastro: 20250101,
      numCpf: "01234567890",
    };
    expect(montarFicha(base).cpfMascarado).toBe("012.***.***-**");
    const f = montarFicha(base, D7);
    expect(f.cpfMascarado).toBe("***.***.678-90");
    expect(JSON.stringify(f)).not.toContain("01234567890");
  });
});

describe("D21 — histórico de pagamentos", () => {
  const pagos = Array.from({ length: 14 }, (_, i) => pgto(14 - i)); // fora de ordem

  it("legado: os 12 PRIMEIROS por numPagamento, sem marca de ordem", () => {
    const h = selecionarHistorico(CPF, pagos, LEGADO);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 10001 + i));
    expect(h).not.toHaveProperty("maisRecentesPrimeiro");
    expect(selecionarHistorico(CPF, pagos)).toEqual(h);
  });

  it("corrigido: os 12 ÚLTIMOS (maior numPagamento), do mais recente ao mais antigo", () => {
    const h = selecionarHistorico(CPF, pagos, D21);
    expect(h.linhas).toHaveLength(MAX_HISTORICO);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 10014 - i));
    expect(h.maisRecentesPrimeiro).toBe(true);
    expect(h.mensagem).toBeNull();
  });

  it("corrigido: menos de 12 → todos, em ordem decrescente; ignora outro CPF", () => {
    const h = selecionarHistorico(CPF, [pgto(1), pgto(3), pgto(2, { numCpf: "01234567890" }), pgto(7)], D21);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual([10007, 10003, 10001]);
  });

  it("corrigido: exatamente 12 e 13 pagamentos", () => {
    const doze = Array.from({ length: 12 }, (_, i) => pgto(i + 1));
    expect(selecionarHistorico(CPF, doze, D21).linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 10012 - i));
    const h = selecionarHistorico(CPF, [...doze, pgto(13)], D21);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 10013 - i));
  });

  it("corrigido: sem pagamentos do CPF → NENHUM PAGAMENTO ENCONTRADO", () => {
    expect(selecionarHistorico(CPF, [], D21)).toEqual({ linhas: [], mensagem: MSG_NENHUM_PAGAMENTO, maisRecentesPrimeiro: true });
    expect(selecionarHistorico(CPF, [pgto(1, { numCpf: "01234567890" })], D21).mensagem).toBe(MSG_NENHUM_PAGAMENTO);
  });

  it("corrigido: pagamento de competência antiga inserido depois fica por último (ordem por competência)", () => {
    const tardio = pgto(20, { anoMesRef: 202001, vlrBruto: 1 }); // inserido por último, competência mais antiga
    const h = selecionarHistorico(CPF, [...Array.from({ length: 12 }, (_, i) => pgto(i + 1)), tardio], D21);
    expect(h.linhas.map((l) => l.anoMesRef)).toEqual(Array.from({ length: 12 }, (_, i) => 202512 - i));
    expect(h.linhas.map((l) => l.vlrBruto)).not.toContain(1);
    // Com menos de 12, o antigo aparece no fim.
    const poucos = selecionarHistorico(CPF, [pgto(1), tardio, pgto(2)], D21);
    expect(poucos.linhas.map((l) => l.anoMesRef)).toEqual([202502, 202501, 202001]);
    // Legado: ordem de inserção, o tardio entraria só se houvesse vaga.
    expect(selecionarHistorico(CPF, [tardio, pgto(1)], LEGADO).linhas.map((l) => l.anoMesRef)).toEqual([202501, 202001]);
  });

  it("corrigido: mesma competência → maior numPagamento primeiro", () => {
    const h = selecionarHistorico(CPF, [pgto(1, { anoMesRef: 202601 }), pgto(3, { anoMesRef: 202601 }), pgto(2, { anoMesRef: 202602 })], D21);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual([10002, 10003, 10001]);
  });

  it("título: legado sempre 'últimos 12'; corrigido só anuncia a ordem quando há linhas", () => {
    expect(TITULO_HISTORICO).toBe("Histórico de pagamentos (últimos 12)");
    expect(tituloHistorico(selecionarHistorico(CPF, pagos, LEGADO))).toBe(TITULO_HISTORICO);
    expect(tituloHistorico(selecionarHistorico(CPF, [], LEGADO))).toBe(TITULO_HISTORICO);
    expect(tituloHistorico(selecionarHistorico(CPF, pagos, D21))).toBe(TITULO_HISTORICO_RECENTES);
    expect(TITULO_HISTORICO_RECENTES).toBe("Histórico de pagamentos (últimos 12, do mais recente ao mais antigo)");
    expect(tituloHistorico(selecionarHistorico(CPF, [], D21))).toBe(TITULO_HISTORICO);
  });

  it("D7 sozinho não altera o histórico legado", () => {
    expect(selecionarHistorico(CPF, pagos, D7)).toEqual(selecionarHistorico(CPF, pagos, LEGADO));
  });
});
