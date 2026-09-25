import { describe, expect, it } from "vitest";
import {
  anoAtualDe,
  avaliarElegibilidade,
  entradaElegibilidadeSchema,
  idadeElegibilidade,
  linhasResultado,
  MAX_MOTIVOS_VALELEG,
  MENSAGENS_VALELEG as M,
  type BeneficiarioElegibilidade,
  type ProgramaElegibilidade,
} from "./elegibilidade";

// Story 3.1 — VALELEG: una prueba por rama y por RK (29 reglas).

const ANO = 2026;

/** Beneficiario activo, 41 años, renta 500,00, 1 dependiente, docs OK, con NIS. */
function benef(over: Partial<BeneficiarioElegibilidade> = {}): BeneficiarioElegibilidade {
  return {
    dtNascimento: 19850412,
    sitBeneficiario: "A",
    vlrRendaFamiliar: 50000,
    numDependentes: 1,
    codRegiao: 1,
    nis: "10000000001",
    documentosOk: "S",
    ...over,
  };
}

/** Programa activo de tipo T sin límites ni código específico. */
function prog(over: Partial<ProgramaElegibilidade> = {}): ProgramaElegibilidade {
  return { sitPrograma: "A", tipoPrograma: "T", codElegibilidade: null, rendaMaxPercap: 0, idadeMin: 0, idadeMax: 0, ...over };
}

const motivos = (b: BeneficiarioElegibilidade, p: ProgramaElegibilidade) => {
  const r = avaliarElegibilidade(b, p, ANO);
  if (r.tipo !== "avaliado") throw new Error(`esperado avaliado, veio ${r.tipo}`);
  return r.motivos;
};

const ELEGIVEL = { tipo: "avaliado", elegivel: true, mensagem: M.elegivel, motivos: [] };

describe("FR-ELG-01 — ano, idade e precondições", () => {
  it("RK-ba073668b27b (VALELEG:59): ano atual = *DATN / 10000", () => {
    expect(anoAtualDe(20260925)).toBe(2026);
    expect(anoAtualDe(20001231)).toBe(2000);
  });

  it("RK-80016581d919 / RK-8c8b79c28087 (VALELEG:72-73): idade = ano atual − ano de nascimento, sem mês/dia", () => {
    expect(idadeElegibilidade(19851231, 2026)).toBe(41);
    expect(idadeElegibilidade(19850101, 2026)).toBe(41);
    // A idade por ano entra nas regras: nascido em 31/12/1966 já tem 60 para o tipo P.
    expect(motivos(benef({ dtNascimento: 19661231 }), prog({ tipoPrograma: "P" }))).toEqual([]);
  });

  it("RK-d1fd785bcf1c (VALELEG:81): beneficiário inexistente → BENEFICIARIO NAO ENCONTRADO (corta, antes do programa)", () => {
    expect(avaliarElegibilidade(null, prog(), ANO)).toEqual({ tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado });
    expect(avaliarElegibilidade(null, null, ANO)).toEqual({ tipo: "precondicao", mensagem: M.beneficiarioNaoEncontrado });
  });

  it("RK-994493fceb7b (VALELEG:94): programa inexistente → PROGRAMA NAO ENCONTRADO", () => {
    expect(avaliarElegibilidade(benef({ codRegiao: 99 }), null, ANO)).toEqual({ tipo: "precondicao", mensagem: M.programaNaoEncontrado });
  });

  it("RK-74d42c778166 (VALELEG:99): programa com status ≠ A → PROGRAMA INATIVO e nada mais avaliado", () => {
    for (const sit of ["I", "E", "", "a"]) {
      const r = avaliarElegibilidade(benef({ sitBeneficiario: "S", codRegiao: 99 }), prog({ sitPrograma: sit, tipoPrograma: "X" }), ANO);
      expect(r).toEqual({ tipo: "precondicao", mensagem: M.programaInativo });
    }
  });
});

describe("FR-ELG-02 — região 99 (LEGACY-QUIRK D12)", () => {
  it("RK-86ee7c50f9f4 (VALELEG:107): região 99 → elegível sem nenhuma outra verificação", () => {
    const r = avaliarElegibilidade(
      benef({ codRegiao: 99, sitBeneficiario: "C", documentosOk: "N", nis: null, numDependentes: 0, dtNascimento: 20200101, vlrRendaFamiliar: 999999 }),
      prog({ tipoPrograma: "Z", idadeMin: 18, idadeMax: 20, rendaMaxPercap: 100, codElegibilidade: "RD" }),
      ANO,
    );
    expect(r).toEqual({ tipo: "regiaoEspecial", elegivel: true, mensagem: M.regiaoEspecial });
  });

  it("outra região segue a avaliação normal", () => {
    expect(avaliarElegibilidade(benef({ codRegiao: 98 }), prog(), ANO)).toEqual(ELEGIVEL);
  });
});

describe("FR-ELG-03 — status do beneficiário", () => {
  it("RK-9a4651f7dd24 (VALELEG:116): status A não gera motivo; status fora de A/S/C/D/I também não", () => {
    expect(motivos(benef({ sitBeneficiario: "A" }), prog())).toEqual([]);
    expect(motivos(benef({ sitBeneficiario: "X" }), prog())).toEqual([]);
    expect(motivos(benef({ sitBeneficiario: "" }), prog())).toEqual([]);
  });

  it("RK-7c608b834e79 (VALELEG:117): S → BENEFICIARIO SUSPENSO", () => {
    expect(motivos(benef({ sitBeneficiario: "S" }), prog())).toEqual([M.suspenso]);
  });

  it("RK-fc541e8adcfc (VALELEG:122): C ou D → BENEFICIARIO CANCELADO/DESLIGADO", () => {
    expect(motivos(benef({ sitBeneficiario: "C" }), prog())).toEqual([M.canceladoDesligado]);
    expect(motivos(benef({ sitBeneficiario: "D" }), prog())).toEqual([M.canceladoDesligado]);
  });

  it("RK-4ff3d6cc6794 (VALELEG:127): I → BENEFICIARIO INATIVO", () => {
    expect(motivos(benef({ sitBeneficiario: "I" }), prog())).toEqual([M.inativo]);
  });
});

describe("FR-ELG-04 — limites do programa", () => {
  it("RK-06883f7fa2f7 (VALELEG:139): idade mínima 0 = sem limite", () => {
    expect(motivos(benef({ dtNascimento: 20250101 }), prog({ tipoPrograma: "A", idadeMin: 0 }))).toEqual([]);
  });

  it("RK-2cb07a956769 (VALELEG:140): idade < mínimo → IDADE INFERIOR AO MINIMO DO PROGRAMA (igual ao mínimo passa)", () => {
    expect(motivos(benef(), prog({ idadeMin: 42 }))).toEqual([M.idadeInferior]);
    expect(motivos(benef(), prog({ idadeMin: 41 }))).toEqual([]);
  });

  it("RK-dd82bfe9d500 (VALELEG:146): idade máxima 0 = sem limite", () => {
    expect(motivos(benef({ dtNascimento: 19200101 }), prog({ tipoPrograma: "A", idadeMax: 0 }))).toEqual([]);
  });

  it("RK-50e8ebafa202 (VALELEG:147): idade > máximo → IDADE SUPERIOR AO MAXIMO DO PROGRAMA (igual ao máximo passa)", () => {
    expect(motivos(benef(), prog({ idadeMax: 40 }))).toEqual([M.idadeSuperior]);
    expect(motivos(benef(), prog({ idadeMax: 41 }))).toEqual([]);
  });

  it("RK-5f1dcae4ccb7 (VALELEG:157): renda máxima 0 = sem limite", () => {
    expect(motivos(benef({ vlrRendaFamiliar: 5_000_000 }), prog({ rendaMaxPercap: 0 }))).toEqual([]);
  });

  it("RK-4c6d057f4ecb (VALELEG:158): renda > teto (centavos) → RENDA FAMILIAR ACIMA DO TETO DO PROGRAMA", () => {
    expect(motivos(benef({ vlrRendaFamiliar: 21801 }), prog({ rendaMaxPercap: 21800 }))).toEqual([M.rendaAcimaTeto]);
    expect(motivos(benef({ vlrRendaFamiliar: 21800 }), prog({ rendaMaxPercap: 21800 }))).toEqual([]);
  });
});

describe("FR-ELG-05 — regras por tipo de programa", () => {
  const A = prog({ tipoPrograma: "A" });

  it("RK-d9a36a3c8a42 (VALELEG:168): DECIDE pelo tipo; tipo desconhecido → TIPO PROGRAMA DESCONHECIDO", () => {
    expect(motivos(benef(), prog({ tipoPrograma: "X" }))).toEqual([M.tipoDesconhecido]);
    expect(motivos(benef(), prog({ tipoPrograma: "" }))).toEqual([M.tipoDesconhecido]);
    expect(motivos(benef(), prog({ tipoPrograma: "a" }))).toEqual([M.tipoDesconhecido]);
  });

  it("RK-e5d581584c6d (VALELEG:171): tipo A com renda ≤ 600,00 não gera motivo de renda, mesmo sem dependentes", () => {
    expect(motivos(benef({ vlrRendaFamiliar: 60000, numDependentes: 0 }), A)).toEqual([]);
  });

  it("RK-b63f2863cdab (VALELEG:172): tipo A com renda > 600,00 e sem dependentes → PROG ASSISTENCIAL: RENDA > 600 SEM DEPENDENTES", () => {
    expect(motivos(benef({ vlrRendaFamiliar: 60001, numDependentes: 0 }), A)).toEqual([M.assistencialRenda]);
    expect(motivos(benef({ vlrRendaFamiliar: 60001, numDependentes: 1 }), A)).toEqual([]);
  });

  it("RK-aa4425811246 (VALELEG:178): tipo A com documentos ≠ S → DOCUMENTACAO INCOMPLETA (independe da renda)", () => {
    expect(motivos(benef({ documentosOk: "N" }), A)).toEqual([M.documentacaoIncompleta]);
    expect(motivos(benef({ documentosOk: null }), A)).toEqual([M.documentacaoIncompleta]);
    expect(motivos(benef({ vlrRendaFamiliar: 90000, numDependentes: 0, documentosOk: "N" }), A)).toEqual([
      M.assistencialRenda,
      M.documentacaoIncompleta,
    ]);
    // Só o tipo A exige documentação.
    expect(motivos(benef({ documentosOk: "N" }), prog({ tipoPrograma: "T" }))).toEqual([]);
  });

  it("RK-093a02fbe84e (VALELEG:185): tipo P com idade < 60 → PROG PREVIDENCIARIO: IDADE < 60", () => {
    const P = prog({ tipoPrograma: "P" });
    expect(motivos(benef({ dtNascimento: 19760101 }), P)).toEqual([M.previdenciarioIdade]); // 50 anos
    expect(motivos(benef({ dtNascimento: 19660101 }), P)).toEqual([]); // 60 anos
  });

  it("RK-7aeaee84c79d (VALELEG:192): tipo T com idade < 16 ou > 65 → PROG TRABALHO: IDADE FORA DA FAIXA 16-65", () => {
    const T = prog({ tipoPrograma: "T" });
    expect(motivos(benef({ dtNascimento: 20110101 }), T)).toEqual([M.trabalhoIdade]); // 15
    expect(motivos(benef({ dtNascimento: 19600101 }), T)).toEqual([M.trabalhoIdade]); // 66
    expect(motivos(benef({ dtNascimento: 20100101 }), T)).toEqual([]); // 16
    expect(motivos(benef({ dtNascimento: 19610101 }), T)).toEqual([]); // 65
  });
});

describe("FR-ELG-06 — código de elegibilidade específico", () => {
  it("RK-0cfdfa24b877 (VALELEG:206): código vazio (null, '' ou espaços) não verifica NIS nem dependentes", () => {
    const b = benef({ nis: null, numDependentes: 0 });
    for (const cod of [null, "", "     "]) expect(motivos(b, prog({ codElegibilidade: cod }))).toEqual([]);
  });

  it("RK-3e570ba9c17c (VALELEG:226): posição 1 = R exige NIS; outra letra na posição 1 não", () => {
    expect(motivos(benef({ nis: null }), prog({ codElegibilidade: "R" }))).toEqual([M.nisNaoCadastrado]);
    expect(motivos(benef({ nis: null }), prog({ codElegibilidade: "XR" }))).toEqual([]);
    expect(motivos(benef({ nis: null }), prog({ codElegibilidade: "r" }))).toEqual([]);
  });

  it("RK-d7bb85d92636 (VALELEG:228): NIS = 0 (null, vazio ou zeros) → NIS NAO CADASTRADO; NIS preenchido passa", () => {
    const R = prog({ codElegibilidade: "R" });
    for (const nis of [null, "", "00000000000"]) expect(motivos(benef({ nis }), R)).toEqual([M.nisNaoCadastrado]);
    expect(motivos(benef({ nis: "10000000001" }), R)).toEqual([]);
  });

  it("RK-af932d091e75 (VALELEG:234): posição 2 = D exige dependentes; D na posição 1 não", () => {
    expect(motivos(benef({ numDependentes: 0 }), prog({ codElegibilidade: " D" }))).toEqual([M.requerDependentes]);
    expect(motivos(benef({ numDependentes: 0 }), prog({ codElegibilidade: "D" }))).toEqual([]);
  });

  it("RK-5f5731566730 (VALELEG:236): dependentes = 0 → PROGRAMA REQUER DEPENDENTES; com dependentes passa", () => {
    const RD = prog({ codElegibilidade: "RD" });
    expect(motivos(benef({ numDependentes: 0 }), RD)).toEqual([M.requerDependentes]);
    expect(motivos(benef({ numDependentes: 2 }), RD)).toEqual([]);
  });

  it("código RD sem NIS e sem dependentes → os dois motivos, na ordem", () => {
    expect(motivos(benef({ nis: null, numDependentes: 0 }), prog({ codElegibilidade: "RD" }))).toEqual([
      M.nisNaoCadastrado,
      M.requerDependentes,
    ]);
  });
});

describe("FR-ELG-07 — resultado", () => {
  it("RK-bd27c2ba8977 (VALELEG:213): sem motivos → BENEFICIARIO ELEGIVEL PARA O PROGRAMA", () => {
    expect(avaliarElegibilidade(benef(), prog(), ANO)).toEqual(ELEGIVEL);
  });

  it("RK-bd27c2ba8977 (VALELEG:213): com motivos → NAO ELEGIVEL - MOTIVOS: + lista na ordem de acumulação", () => {
    const r = avaliarElegibilidade(
      benef({ sitBeneficiario: "S", dtNascimento: 20150101, vlrRendaFamiliar: 90000 }),
      prog({ idadeMin: 18, rendaMaxPercap: 50000 }),
      ANO,
    );
    expect(r).toEqual({
      tipo: "avaliado",
      elegivel: false,
      mensagem: M.naoElegivel,
      motivos: [M.suspenso, M.idadeInferior, M.rendaAcimaTeto, M.trabalhoIdade],
    });
    expect(linhasResultado(r)).toEqual([
      "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:",
      "1 - BENEFICIARIO SUSPENSO",
      "2 - IDADE INFERIOR AO MINIMO DO PROGRAMA",
      "3 - RENDA FAMILIAR ACIMA DO TETO DO PROGRAMA",
      "4 - PROG TRABALHO: IDADE FORA DA FAIXA 16-65",
    ]);
  });

  it("todos os motivos de um programa coerente (7) cabem na tabela de 10, na ordem status → idade → renda → tipo → código", () => {
    const r = motivos(
      benef({ sitBeneficiario: "C", dtNascimento: 20200101, vlrRendaFamiliar: 90000, numDependentes: 0, documentosOk: "N", nis: null }),
      prog({ tipoPrograma: "A", idadeMin: 18, rendaMaxPercap: 50000, codElegibilidade: "RD" }),
    );
    expect(r).toEqual([
      M.canceladoDesligado,
      M.idadeInferior,
      M.rendaAcimaTeto,
      M.assistencialRenda,
      M.documentacaoIncompleta,
      M.nisNaoCadastrado,
      M.requerDependentes,
    ]);
    expect(r.length).toBeLessThanOrEqual(MAX_MOTIVOS_VALELEG);
  });

  it("linhasResultado: elegível e precondição → só a mensagem", () => {
    expect(linhasResultado(avaliarElegibilidade(benef(), prog(), ANO))).toEqual([M.elegivel]);
    expect(linhasResultado(avaliarElegibilidade(null, null, ANO))).toEqual([M.beneficiarioNaoEncontrado]);
  });
});

describe("entradaElegibilidadeSchema (borda)", () => {
  it("CPF só dígitos com zeros à esquerda; código do programa em maiúsculas, truncado a 4", () => {
    expect(entradaElegibilidadeSchema.parse({ numCpf: "012.345.678-90", codPrograma: " pa01 " })).toEqual({
      numCpf: "01234567890",
      codPrograma: "PA01",
    });
    expect(entradaElegibilidadeSchema.parse({ numCpf: "", codPrograma: "PT01XYZ" })).toEqual({
      numCpf: "00000000000",
      codPrograma: "PT01",
    });
  });
});
