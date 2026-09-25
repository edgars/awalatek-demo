import { describe, expect, it } from "vitest";
import {
  acumularErro,
  anoAtualDe,
  MAX_ERROS_VALBENEF,
  MENSAGENS_VALBENEF,
  validarCadastroConsolidado,
  validarDataNascimento,
  validarNome,
  validarStatus,
  validarUf,
  type DadosValbenef,
} from "./validacao";

const ANO = 2026;
const CPF_OK = "01234567890";
const CPF_DV_ERRADO = "01234567891";
const base: DadosValbenef = { numCpf: CPF_OK, nomeCompleto: "MARIA DA SILVA", dtNascimento: 19850412, uf: "SP", sitBeneficiario: "A" };
const validar = (over: Partial<DadosValbenef> = {}) => validarCadastroConsolidado({ ...base, ...over }, ANO);

describe("VALBENEF — mensagens literais (FR-VAL-01)", () => {
  it("textos exatos do legado", () => {
    expect(MENSAGENS_VALBENEF).toEqual({
      cpfInvalido: "CPF INVALIDO - DIGITO VERIFICADOR",
      dataNascimentoInvalida: "DATA NASCIMENTO INVALIDA",
      nomeInvalido: "NOME INVALIDO - DEVE TER NOME E SOBRENOME",
      ufInvalida: "UF INVALIDA",
      statusInvalido: "STATUS INVALIDO",
    });
  });
});

describe("VALBENEF — matriz de casos (spec 2.2)", () => {
  it("todo válido → V sem erros", () => {
    expect(validar()).toEqual({ resultado: "V", erros: [] });
  });

  it("acumula todos: 5 erros na ordem CPF, data, nome, UF, status", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO, dtNascimento: 18990101, nomeCompleto: "", uf: "XX", sitBeneficiario: "Z" })).toEqual({
      resultado: "I",
      erros: [
        "CPF INVALIDO - DIGITO VERIFICADOR",
        "DATA NASCIMENTO INVALIDA",
        "NOME INVALIDO - DEVE TER NOME E SOBRENOME",
        "UF INVALIDA",
        "STATUS INVALIDO",
      ],
    });
  });

  it("D4b: 00000000000 → CPF válido", () => {
    expect(validar({ numCpf: "00000000000" })).toEqual({ resultado: "V", erros: [] });
  });

  it("D4b: 11111111111 → CPF inválido", () => {
    expect(validar({ numCpf: "11111111111" })).toEqual({ resultado: "I", erros: ["CPF INVALIDO - DIGITO VERIFICADOR"] });
  });

  it("D16: 20230229 (ano não bissexto) → data válida", () => {
    expect(validar({ dtNascimento: 20230229 })).toEqual({ resultado: "V", erros: [] });
  });

  it("data fora do intervalo: 20260431 / 18991231 / ano > atual", () => {
    for (const dt of [20260431, 18991231, 20270101]) {
      expect(validar({ dtNascimento: dt }).erros).toEqual(["DATA NASCIMENTO INVALIDA"]);
    }
  });

  it("D19: uma palavra (MARIA) → nome válido", () => {
    expect(validar({ nomeCompleto: "MARIA" }).resultado).toBe("V");
  });

  it("D19: 60 caracteres sem espaço → NOME INVALIDO", () => {
    expect(validar({ nomeCompleto: "A".repeat(60) }).erros).toEqual(["NOME INVALIDO - DEVE TER NOME E SOBRENOME"]);
  });

  it("UF em branco → sem erro de UF", () => {
    expect(validar({ uf: "" }).resultado).toBe("V");
    expect(validar({ uf: "  " }).resultado).toBe("V");
  });

  it("status em branco → STATUS INVALIDO", () => {
    expect(validar({ sitBeneficiario: "" }).erros).toEqual(["STATUS INVALIDO"]);
  });
});

describe("VALBENEF — regras por RK", () => {
  it("RK-4e7cf0ea0beb (VALBENEF:110): ano atual = *DATN / 10000", () => {
    expect(anoAtualDe(20260924)).toBe(2026);
    expect(anoAtualDe(19991231)).toBe(1999);
  });

  it("RK-4e7cf0ea0beb (VALBENEF:110): o ano atual injetado limita a data", () => {
    expect(validarCadastroConsolidado({ ...base, dtNascimento: 20260101 }, 2026).resultado).toBe("V");
    expect(validarCadastroConsolidado({ ...base, dtNascimento: 20260101 }, 2025).erros).toEqual(["DATA NASCIMENTO INVALIDA"]);
  });

  it("RK-d92621a0cc50 (VALBENEF:116): CPF inválido → mensagem literal", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO }).erros).toEqual(["CPF INVALIDO - DIGITO VERIFICADOR"]);
    expect(validar({ numCpf: "" }).erros).toEqual(["CPF INVALIDO - DIGITO VERIFICADOR"]);
  });

  it("RK-b776e6f05132 (VALBENEF:126): data inválida → mensagem literal", () => {
    expect(validar({ dtNascimento: 0 }).erros).toEqual(["DATA NASCIMENTO INVALIDA"]);
  });

  it("RK-39e9b653aa4d (VALBENEF:136): nome inválido → mensagem literal", () => {
    expect(validar({ nomeCompleto: "   " }).erros).toEqual(["NOME INVALIDO - DEVE TER NOME E SOBRENOME"]);
  });

  it("RK-3414a3783a2e (VALBENEF:164): status ∈ {A, S, C, I, D}", () => {
    for (const s of ["A", "S", "C", "I", "D"]) expect(validarStatus(s)).toBe(true);
    for (const s of ["", " ", "Z", "a", "AA"]) expect(validarStatus(s)).toBe(false);
    expect(validar({ sitBeneficiario: "X" }).erros).toEqual(["STATUS INVALIDO"]);
  });

  it("RK-dec345b9d4e4 (VALBENEF:244): ano = dt / 10000", () => {
    expect(validarDataNascimento(19000101, ANO)).toBe(true);
    expect(validarDataNascimento(18991231, ANO)).toBe(false);
  });

  it("RK-1f589b644cd7 (VALBENEF:245): mês = (dt − ano×10000) / 100", () => {
    expect(validarDataNascimento(19851231, ANO)).toBe(true);
    expect(validarDataNascimento(19851301, ANO)).toBe(false);
  });

  it("RK-a34852e9ec02 (VALBENEF:246): dia = dt − ano×10000 − mês×100", () => {
    expect(validarDataNascimento(19850131, ANO)).toBe(true);
    expect(validarDataNascimento(19850132, ANO)).toBe(false);
  });

  it("RK-39c31733e515 (VALBENEF:248): ano entre 1900 e o ano atual", () => {
    expect(validarDataNascimento(18991231, ANO)).toBe(false);
    expect(validarDataNascimento(19000101, ANO)).toBe(true);
    expect(validarDataNascimento(20261231, ANO)).toBe(true);
    expect(validarDataNascimento(20270101, ANO)).toBe(false);
    expect(validarDataNascimento(0, ANO)).toBe(false);
  });

  it("RK-f60066fede08 (VALBENEF:252): mês 1–12", () => {
    expect(validarDataNascimento(19850001, ANO)).toBe(false);
    expect(validarDataNascimento(19851301, ANO)).toBe(false);
    expect(validarDataNascimento(19850101, ANO)).toBe(true);
    expect(validarDataNascimento(19851201, ANO)).toBe(true);
  });

  it("RK-db3b53eeb364 (VALBENEF:256): dia 1..dias do mês", () => {
    expect(validarDataNascimento(19850400, ANO)).toBe(false);
    expect(validarDataNascimento(19850430, ANO)).toBe(true);
    expect(validarDataNascimento(19850431, ANO)).toBe(false);
    expect(validarDataNascimento(19850331, ANO)).toBe(true);
  });

  it("RK-db3b53eeb364 (VALBENEF:256): LEGACY-QUIRK(D16) — fevereiro sempre com 29 dias", () => {
    expect(validarDataNascimento(20230229, ANO)).toBe(true); // não bissexto: aceito
    expect(validarDataNascimento(20240229, ANO)).toBe(true);
    expect(validarDataNascimento(19000229, ANO)).toBe(true); // 1900 não é bissexto
    expect(validarDataNascimento(20240230, ANO)).toBe(false);
  });

  it("data não inteira → inválida sem lançar", () => {
    expect(validarDataNascimento(Number.NaN, ANO)).toBe(false);
    expect(validarDataNascimento(19850412.5, ANO)).toBe(false);
  });

  it("RK-9c6ba0322e06 (VALBENEF:264): nome em branco → inválido", () => {
    expect(validarNome("")).toBe(false);
    expect(validarNome("    ")).toBe(false);
  });

  it("RK-9eb88e2bb408 (VALBENEF:271): espaço depois da 1ª posição → válido", () => {
    expect(validarNome("MARIA DA SILVA")).toBe(true);
    expect(validarNome("A B")).toBe(true);
  });

  it("RK-9eb88e2bb408 (VALBENEF:271): LEGACY-QUIRK(D19) — uma palavra é válida pelo preenchimento do A60", () => {
    expect(validarNome("MARIA")).toBe(true);
    expect(validarNome("A".repeat(59))).toBe(true);
  });

  it("RK-6e161797bb9a (VALBENEF:274): sem espaço depois da 1ª posição → inválido", () => {
    expect(validarNome("A".repeat(60))).toBe(false);
    expect(validarNome("A".repeat(70))).toBe(false); // truncado a 60
    expect(validarNome(" MARIA")).toBe(false); // espaço na posição 1
  });

  it("RK-ac7976dff12d (VALBENEF:145): UF só é verificada se informada", () => {
    expect(validarUf("")).toBe(true);
    expect(validarUf("  ")).toBe(true);
  });

  it("RK-20056adb605d (VALBENEF:149): UF pertence às 27 UFs", () => {
    for (const uf of ["AC", "SP", "TO", "DF", "RJ"]) expect(validarUf(uf)).toBe(true);
    for (const uf of ["XX", "sp", "S", "SPX"]) expect(validarUf(uf)).toBe(false);
  });

  it("RK-bb74de6a3c53 (VALBENEF:154): UF inválida → mensagem literal", () => {
    expect(validar({ uf: "XX" }).erros).toEqual(["UF INVALIDA"]);
  });

  it("acúmulo limitado a 10 mensagens (#MSG-ERRO(1:10))", () => {
    const erros: string[] = [];
    for (let i = 0; i < 12; i++) acumularErro(erros, `E${i}`);
    expect(MAX_ERROS_VALBENEF).toBe(10);
    expect(erros).toHaveLength(10);
    expect(erros[9]).toBe("E9");
  });
});
