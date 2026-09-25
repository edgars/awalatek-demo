import { describe, expect, it } from "vitest";
import {
  campoDoErroDependente,
  continuarInclusao,
  cpfDuplicado,
  decidirInclusao,
  dependenteSchema,
  MENSAGENS_CADDEPEND,
  mensagemIncluido,
  normalizaCpfDependente,
  proximaOcorrencia,
  validarDadosDependente,
  verificarLimite,
  verificarTitular,
} from "./dependentes";

const M = MENSAGENS_CADDEPEND;
const ativo = (numDependentes = 0) => ({ sitBeneficiario: "A", numDependentes });
const dados = (over: Partial<{ nomeDependente: string; parentesco: string; cpfDependente: string | null }> = {}) => ({
  nomeDependente: "PEDRO",
  parentesco: "FI",
  cpfDependente: null,
  ...over,
});

describe("FR-DEP-01 — titular", () => {
  it("RK-6badeec05527 (CADDEPEND:51): titular inexistente", () => {
    expect(verificarTitular(null)).toBe("BENEFICIARIO NAO ENCONTRADO");
    expect(decidirInclusao(null, dados(), [])).toEqual({ ok: false, mensagens: [M.naoEncontrado] });
  });

  it("RK-7f25da1eeff3 (CADDEPEND:56): titular C ou D bloqueia; A, S, I permitem", () => {
    for (const s of ["C", "D"]) {
      expect(verificarTitular({ sitBeneficiario: s, numDependentes: 0 })).toBe(
        "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO",
      );
    }
    for (const s of ["A", "S", "I"]) expect(verificarTitular({ sitBeneficiario: s, numDependentes: 0 })).toBeNull();
  });
});

describe("FR-DEP-02 — limite (LEGACY-QUIRK D6)", () => {
  it("RK-728f8d2bc779 (CADDEPEND:63): corta em > 5 — permite chegar a 6", () => {
    expect(verificarLimite(0)).toBeNull();
    expect(verificarLimite(5)).toBeNull();
    expect(verificarLimite(6)).toBe("LIMITE DE DEPENDENTES ATINGIDO");
    expect(decidirInclusao(ativo(5), dados(), [])).toEqual({ ok: true, occurrence: 6, total: 6 });
    expect(decidirInclusao(ativo(6), dados(), [])).toEqual({ ok: false, mensagens: [M.limiteAtingido] });
  });

  it("limite é avaliado antes dos dados", () => {
    expect(decidirInclusao(ativo(6), dados({ nomeDependente: "", parentesco: "XX" }), [])).toEqual({
      ok: false,
      mensagens: [M.limiteAtingido],
    });
  });
});

describe("FR-DEP-03 — dados do dependente", () => {
  it("RK-cf0d5200aad9 (CADDEPEND:79): nome obrigatório", () => {
    expect(validarDadosDependente({ nomeDependente: "   ", parentesco: "FI" })).toEqual(["NOME DO DEPENDENTE OBRIGATORIO"]);
  });

  it("RK-bba959226637 (CADDEPEND:84): parentesco ∈ {FI, CO, IR, OU}", () => {
    for (const p of ["FI", "CO", "IR", "OU"]) expect(validarDadosDependente({ nomeDependente: "X", parentesco: p })).toEqual([]);
    for (const p of ["XX", "", "PA", "FILHO"]) {
      expect(validarDadosDependente({ nomeDependente: "X", parentesco: p })).toEqual(["PARENTESCO INVALIDO"]);
    }
  });

  it("RK-4dfeeb238cf7 (CADDEPEND:90): com erro não grava — ambos os mensagens", () => {
    expect(decidirInclusao(ativo(), dados({ nomeDependente: "", parentesco: "XX" }), [])).toEqual({
      ok: false,
      mensagens: [M.nomeObrigatorio, M.parentescoInvalido],
    });
  });

  it("com erro de dados o duplicado não é avaliado", () => {
    const r = decidirInclusao(ativo(1), dados({ nomeDependente: "", cpfDependente: "12345678909" }), [
      { occurrence: 1, cpfDependente: "12345678909" },
    ]);
    expect(r).toEqual({ ok: false, mensagens: [M.nomeObrigatorio] });
  });
});

describe("FR-DEP-04 — CPF duplicado", () => {
  const ocorrencias = [
    { occurrence: 1, cpfDependente: "12345678909" },
    { occurrence: 2, cpfDependente: null },
    { occurrence: 3, cpfDependente: "98765432100" },
  ];

  it("RK-d08414712f34 (CADDEPEND:97): CPF repetido entre as ocorrências 1..n", () => {
    expect(cpfDuplicado("12345678909", ocorrencias, 2)).toBe(true);
    // Ocorrência acima do contador não conta.
    expect(cpfDuplicado("98765432100", ocorrencias, 2)).toBe(false);
    expect(cpfDuplicado("98765432100", ocorrencias, 3)).toBe(true);
    // Sem CPF nunca é duplicado.
    expect(cpfDuplicado(null, ocorrencias, 3)).toBe(false);
  });

  it("RK-f8707d9be137 (CADDEPEND:105): com duplicado não grava", () => {
    expect(decidirInclusao(ativo(1), dados({ cpfDependente: "12345678909" }), ocorrencias)).toEqual({
      ok: false,
      mensagens: ["DEPENDENTE JA CADASTRADO (CPF DUPLICADO)"],
    });
  });

  it("normaliza o CPF do dependente a 11 dígitos; vazio ou zero → sem CPF", () => {
    expect(normalizaCpfDependente("123.456.789-09")).toBe("12345678909");
    expect(normalizaCpfDependente("1234567890")).toBe("01234567890");
    expect(normalizaCpfDependente("")).toBeNull();
    expect(normalizaCpfDependente("000.000.000-00")).toBeNull();
    expect(normalizaCpfDependente(null)).toBeNull();
  });
});

describe("FR-DEP-05 — inclusão em série", () => {
  it("ocorrência = numDependentes + 1 e mensagem com o total", () => {
    expect(proximaOcorrencia(0)).toBe(1);
    expect(proximaOcorrencia(3)).toBe(4);
    expect(decidirInclusao(ativo(0), dados(), [])).toEqual({ ok: true, occurrence: 1, total: 1 });
    expect(mensagemIncluido(2)).toBe("DEPENDENTE INCLUIDO - TOTAL: 2");
  });

  it("RK-db6fc93c9e4c (CADDEPEND:126): só S continua", () => {
    expect(M.incluirOutro).toBe("INCLUIR OUTRO DEPENDENTE? (S/N)");
    expect(continuarInclusao("S")).toBe(true);
    expect(continuarInclusao("s")).toBe(true);
    for (const r of ["N", "", "X", "SIM"]) expect(continuarInclusao(r)).toBe(false);
  });
});

describe("esquema zod do formulário", () => {
  const base = { nomeDependente: " pedro ", dtNascDepend: "20150310", parentesco: "fi", cpfDependente: "", docDependente: "", sexoDependente: "" };

  it("normaliza campos; vazios → null / 0", () => {
    const r = dependenteSchema.parse(base);
    expect(r).toEqual({
      nomeDependente: "PEDRO",
      dtNascDepend: 20150310,
      parentesco: "FI",
      cpfDependente: null,
      docDependente: null,
      sexoDependente: null,
    });
    expect(dependenteSchema.parse({ ...base, dtNascDepend: "" }).dtNascDepend).toBe(0);
    expect(dependenteSchema.parse({ ...base, cpfDependente: "123.456.789-09" }).cpfDependente).toBe("12345678909");
  });

  it("não valida nome nem parentesco (mensagens do legado vêm do domínio)", () => {
    expect(dependenteSchema.safeParse({ ...base, nomeDependente: "", parentesco: "XX" }).success).toBe(true);
  });

  it("rejeita formato: sexo, documento longo, data não numérica", () => {
    expect(dependenteSchema.safeParse({ ...base, sexoDependente: "X" }).success).toBe(false);
    expect(dependenteSchema.safeParse({ ...base, docDependente: "1234567890123456" }).success).toBe(false);
    expect(dependenteSchema.safeParse({ ...base, dtNascDepend: "invalido" }).success).toBe(false);
  });

  it("campo de cada mensagem", () => {
    expect(campoDoErroDependente(M.nomeObrigatorio)).toBe("nomeDependente");
    expect(campoDoErroDependente(M.parentescoInvalido)).toBe("parentesco");
    expect(campoDoErroDependente(M.cpfDuplicado)).toBe("cpfDependente");
    expect(campoDoErroDependente(M.limiteAtingido)).toBeUndefined();
  });
});
