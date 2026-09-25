import { describe, expect, it } from "vitest";
import {
  descricaoStatus,
  entradaConsultaSchema,
  MAX_HISTORICO,
  montarFicha,
  MSG_BENEFICIARIO_NAO_ENCONTRADO,
  MSG_NENHUM_PAGAMENTO,
  MSG_TIPO_BUSCA_INVALIDO,
  resolverBusca,
  selecionarHistorico,
  type PagamentoConsulta,
} from "./consulta";

const CPF = "12345678909";

function pgto(numPagamento: number, extra: Partial<PagamentoConsulta> = {}): PagamentoConsulta {
  return { numPagamento, numCpf: CPF, anoMesRef: 202500 + ((numPagamento - 1) % 12) + 1, vlrBruto: 10000 + numPagamento, vlrLiquido: 9000 + numPagamento, sitPagamento: "G", tipoPgto: "N", ...extra };
}

describe("consulta — tipo de busca (FR-CON-01)", () => {
  it("RK-9d9bab8eef93 (CONSBENF:72): tela única substitui MAP e tela alternativa — caminho padrão", () => {
    const e = entradaConsultaSchema.parse({ tipo: "C", valor: "123.456.789-09" });
    expect(resolverBusca(e.tipo, e.valor)).toEqual({ ok: true, tipo: "C", numCpf: CPF });
  });

  it("RK-98c65e845b23 (CONSBENF:80): tipo em branco → C (CPF)", () => {
    expect(resolverBusca("", CPF)).toEqual({ ok: true, tipo: "C", numCpf: CPF });
    expect(resolverBusca(" ", "1234567890")).toEqual({ ok: true, tipo: "C", numCpf: "01234567890" });
  });

  it("RK-7ede98209218 (CONSBENF:86): C → CPF, N → NIS, outro → TIPO BUSCA INVALIDO", () => {
    expect(resolverBusca("C", CPF)).toEqual({ ok: true, tipo: "C", numCpf: CPF });
    expect(resolverBusca("N", "10000000001")).toEqual({ ok: true, tipo: "N", nis: "10000000001" });
    expect(resolverBusca("N", "123")).toEqual({ ok: true, tipo: "N", nis: "00000000123" });
    expect(resolverBusca("X", CPF)).toEqual({ ok: false, mensagem: "TIPO BUSCA INVALIDO" });
    expect(resolverBusca("c", CPF)).toEqual({ ok: false, mensagem: MSG_TIPO_BUSCA_INVALIDO });
    expect(MSG_TIPO_BUSCA_INVALIDO).toBe("TIPO BUSCA INVALIDO");
  });

  it("#TIPO-BUSCA é A1: só a 1.ª posição conta", () => {
    expect(resolverBusca("NX", "10000000001")).toEqual({ ok: true, tipo: "N", nis: "10000000001" });
  });

  it("RK-7b5ef292a4dd (CONSBENF:100): mensagem literal de não encontrado", () => {
    expect(MSG_BENEFICIARIO_NAO_ENCONTRADO).toBe("BENEFICIARIO NAO ENCONTRADO");
  });
});

describe("consulta — descrição do status (FR-CON-02)", () => {
  it("RK-bbda5babb7d9 (CONSBENF:110): A/S/C/I/D e outro → DESCONHECIDO", () => {
    expect(["A", "S", "C", "I", "D"].map(descricaoStatus)).toEqual(["ATIVO", "SUSPENSO", "CANCELADO", "INATIVO", "DESLIGADO"]);
    expect(descricaoStatus("X")).toBe("DESCONHECIDO");
    expect(descricaoStatus("")).toBe("DESCONHECIDO");
  });
});

describe("consulta — histórico de pagamentos (FR-CON-03)", () => {
  it("RK-e17f09d66201 (CONSBENF:152): só pagamentos do CPF consultado", () => {
    const h = selecionarHistorico(CPF, [pgto(1), pgto(2, { numCpf: "01234567890" }), pgto(3)]);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual([10001, 10003]);
    expect(h.mensagem).toBeNull();
  });

  it("RK-0550647253b2 (CONSBENF:156): até 12 — os PRIMEIROS 12 por numPagamento (LEGACY-QUIRK D21)", () => {
    const pagos = Array.from({ length: 14 }, (_, i) => pgto(14 - i)); // fora de ordem
    const h = selecionarHistorico(CPF, pagos);
    expect(MAX_HISTORICO).toBe(12);
    expect(h.linhas).toHaveLength(12);
    expect(h.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 10001 + i));
  });

  it("linhas com competência, bruto, líquido, status e tipo", () => {
    const h = selecionarHistorico(CPF, [pgto(5, { anoMesRef: 202609, vlrBruto: 60000, vlrLiquido: 57500, sitPagamento: "P", tipoPgto: "D" })]);
    expect(h.linhas).toEqual([{ anoMesRef: 202609, vlrBruto: 60000, vlrLiquido: 57500, sitPagamento: "P", tipoPgto: "D" }]);
  });

  it("RK-95a55083feb2 (CONSBENF:166): sem pagamentos → NENHUM PAGAMENTO ENCONTRADO", () => {
    expect(selecionarHistorico(CPF, [])).toEqual({ linhas: [], mensagem: "NENHUM PAGAMENTO ENCONTRADO" });
    expect(selecionarHistorico(CPF, [pgto(1, { numCpf: "01234567890" })]).mensagem).toBe(MSG_NENHUM_PAGAMENTO);
  });
});

describe("consulta — ficha (FR-CON-01, FR-CON-04)", () => {
  const base = {
    nomeCompleto: "FULANO DE TAL",
    dtNascimento: 19800101,
    sexo: "M",
    logradouro: "RUA A, 1",
    municipio: "SAO PAULO",
    uf: "SP",
    cep: 1001000,
    sitBeneficiario: "X",
    codPrograma: "PA01",
    vlrRendaFamiliar: 120000,
    numDependentes: 2,
    codRegiao: 1,
    nis: "10000000001",
    dtCadastro: 20250101,
  };

  it("CPF sai só mascarado, com a descrição do status", () => {
    const f = montarFicha({ ...base, numCpf: "01234567890" });
    expect(f.cpfMascarado).toBe("012.***.***-**");
    expect(f.statusDescricao).toBe("DESCONHECIDO");
    expect(f).not.toHaveProperty("numCpf");
    expect(JSON.stringify(f)).not.toContain("01234567890");
    expect(montarFicha({ ...base, numCpf: CPF }).cpfMascarado).toBe("***.***.789-09");
  });
});
