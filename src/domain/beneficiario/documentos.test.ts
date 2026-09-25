import { describe, expect, it } from "vitest";
import { calculaDv1, calculaDv2, completaDv } from "../cpf";
import {
  acumularErroDoc,
  ehDocEspecial,
  entradaValdocsSchema,
  MAX_ERROS_VALDOCS,
  MENSAGENS_VALDOCS,
  PREFIXOS_DOC_ESPECIAL,
  validarCpfDoc,
  validarDocumentos,
  validarRg,
  type DadosValdocs,
} from "./documentos";

const CPF_OK = "01234567890";
const CPF_DV_ERRADO = "01234567891";
const OFF = { docEspecialHabilitado: false };
const ON = { docEspecialHabilitado: true };
const base: DadosValdocs = { numCpf: CPF_OK, rg: "123456789", tituloEleitor: "", ctps: "" };
const validar = (over: Partial<DadosValdocs> = {}, quirks = OFF) => validarDocumentos({ ...base, ...over }, quirks);

const CPF_INV = "CPF INVALIDO";
const RG_INV = "RG INVALIDO OU FORMATO INCORRETO";

describe("VALDOCS — mensagens literais", () => {
  it("textos exatos do legado", () => {
    expect(MENSAGENS_VALDOCS).toEqual({
      cpfInvalido: "CPF INVALIDO",
      rgInvalido: "RG INVALIDO OU FORMATO INCORRETO",
      docEspecial: "** DOCUMENTO ESPECIAL VALIDADO **",
    });
  });
});

describe("VALDOCS — matriz de casos (spec 2.3)", () => {
  it("válido → V sem erros", () => {
    expect(validar()).toEqual({ resultado: "V", erros: [], docEspecial: false });
  });

  it("CPF vazio (N11 = 0) → CPF INVALIDO", () => {
    expect(validar({ numCpf: "00000000000" })).toEqual({ resultado: "I", erros: [CPF_INV], docEspecial: false });
  });

  it("CPF com DV inválido → CPF INVALIDO", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO })).toEqual({ resultado: "I", erros: [CPF_INV], docEspecial: false });
  });

  it("dígitos repetidos com DV coincidente → CPF válido (VALDOCS não verifica repetidos)", () => {
    expect(validar({ numCpf: "11111111111" })).toEqual({ resultado: "V", erros: [], docEspecial: false });
    expect(validar({ numCpf: "99999999999" }).resultado).toBe("V");
  });

  it("RG vazio → RG INVALIDO", () => {
    expect(validar({ rg: "" })).toEqual({ resultado: "I", erros: [RG_INV], docEspecial: false });
  });

  it("RG com 4 caracteres → RG INVALIDO", () => {
    expect(validar({ rg: "1234" }).erros).toEqual([RG_INV]);
  });

  it("RG com 5 caracteres → válido", () => {
    expect(validar({ rg: "12345" })).toEqual({ resultado: "V", erros: [], docEspecial: false });
  });

  it("D20: RG com espaço interno conta só até o espaço → RG INVALIDO", () => {
    expect(validar({ rg: "12 345678" }).erros).toEqual([RG_INV]);
  });

  it("acumula: CPF inválido e RG vazio → 2 erros na ordem CPF, RG", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO, rg: "" })).toEqual({ resultado: "I", erros: [CPF_INV, RG_INV], docEspecial: false });
  });

  it("D4 flag off: CPF com prefixo especial não tem efeito", () => {
    expect(validar({ numCpf: "00100000000", rg: "" }, OFF)).toEqual({ resultado: "I", erros: [CPF_INV, RG_INV], docEspecial: false });
  });

  it("D4 flag on: mesmo caso → V, 0 erros, docEspecial", () => {
    expect(validar({ numCpf: "00100000000", rg: "" }, ON)).toEqual({ resultado: "V", erros: [], docEspecial: true });
  });

  it("título de eleitor e CTPS não são validados", () => {
    expect(validar({ tituloEleitor: "X", ctps: "!!" })).toEqual({ resultado: "V", erros: [], docEspecial: false });
    expect(validar({ tituloEleitor: "", ctps: "" }).resultado).toBe("V");
  });
});

describe("VALDOCS — regras RK", () => {
  it("RK-82c01a2ea13d (VALDOCS:69): CPF não OK → 'CPF INVALIDO' como 1º erro", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO, rg: "" }).erros[0]).toBe(CPF_INV);
  });

  it("RK-b0821b60ecb6 (VALDOCS:79): RG não OK → 'RG INVALIDO OU FORMATO INCORRETO'", () => {
    expect(validar({ rg: "1" }).erros).toEqual([RG_INV]);
  });

  it("RK-5549fc642f21 (VALDOCS:95): LEGACY-QUIRK(D4) — documento especial só com o flag", () => {
    expect(validar({ numCpf: CPF_DV_ERRADO.replace(/^012/, "999") }, ON).docEspecial).toBe(true);
    expect(validar({ numCpf: CPF_DV_ERRADO.replace(/^012/, "999") }, OFF).docEspecial).toBe(false);
    // CPF válido com prefixo especial também recebe o selo quando o flag está ativo.
    const valido = completaDv("001234567");
    expect(validar({ numCpf: valido }, ON)).toEqual({ resultado: "V", erros: [], docEspecial: true });
    expect(validar({ numCpf: valido }, OFF)).toEqual({ resultado: "V", erros: [], docEspecial: false });
    // Sem prefixo especial, o flag ativo não muda nada.
    expect(validar({ numCpf: CPF_DV_ERRADO }, ON)).toEqual({ resultado: "I", erros: [CPF_INV], docEspecial: false });
  });

  it("RK-55a63d755481 (VALDOCS:102): CPF = 0 → inválido (mesmo que o módulo 11 aceitaria)", () => {
    expect(validarCpfDoc("00000000000")).toBe(false);
    expect(validarCpfDoc("")).toBe(false);
  });

  it("RK-4187fc1c9b8e (VALDOCS:114) / RK-9d67b2c9881b (VALDOCS:117): soma × pesos 10..2 e resto do DV1", () => {
    // 1×10 + 2×9 + … + 9×2 = 210; 210 − 19×11 = 1 → resto < 2 → DV1 0.
    expect(calculaDv1([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(0);
    // 0×10 + 1×9 + … + 8×2 = 156; resto 2 → DV1 9.
    expect(calculaDv1([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(9);
  });

  it("RK-1a2b8aca3fed (VALDOCS:118): resto < 2 → DV1 0", () => {
    expect(calculaDv1([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0); // resto 0
    expect(calculaDv1([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(0); // resto 1
  });

  it("RK-533f71e705bc (VALDOCS:121): DV1 = 11 − resto", () => {
    // 1×8 = 8 → resto 8 → DV1 3.
    expect(calculaDv1([0, 0, 1, 0, 0, 0, 0, 0, 0])).toBe(3);
  });

  it("RK-ca3109301dbc (VALDOCS:123): DV1 ≠ 10º dígito → inválido", () => {
    expect(validarCpfDoc("01234567800")).toBe(false); // DV1 correto é 9
    expect(validarCpfDoc("00100000000")).toBe(false); // DV1 correto é 3
  });

  it("RK-4cd00622ae5a (VALDOCS:131) / RK-bb14087b5111 (VALDOCS:134): soma × pesos 11..2 e resto do DV2", () => {
    // 0×11 + 1×10 + … + 8×3 + 9×2 = 210; resto 1 → DV2 0.
    expect(calculaDv2([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(0);
  });

  it("RK-e3ad9c603136 (VALDOCS:135): resto < 2 → DV2 0", () => {
    expect(calculaDv2([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
    expect(calculaDv2([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(0);
  });

  it("RK-06b627574a45 (VALDOCS:138): DV2 = 11 − resto", () => {
    // 1×9 + 3×2 = 15 → resto 4 → DV2 7.
    expect(calculaDv2([0, 0, 1, 0, 0, 0, 0, 0, 0, 3])).toBe(7);
  });

  it("RK-08b9ede5ec74 (VALDOCS:140): DV2 ≠ 11º dígito → inválido", () => {
    expect(validarCpfDoc(CPF_OK)).toBe(true);
    expect(validarCpfDoc(CPF_DV_ERRADO)).toBe(false);
    expect(validarCpfDoc("00100000037")).toBe(true);
    expect(validarCpfDoc("00100000038")).toBe(false);
  });

  it("CPF fora do formato N11 → inválido sem lançar", () => {
    expect(validarCpfDoc("123456789012")).toBe(false);
    expect(validarCpfDoc("0123456789a")).toBe(false);
  });

  it("RK-2b0e2875eb48 (VALDOCS:148): RG em branco → inválido", () => {
    expect(validarRg("")).toBe(false);
    expect(validarRg("     ")).toBe(false);
  });

  it("RK-f018750c00d0 (VALDOCS:155): posição do 1º espaço − 1; sem espaço (A15 cheio) = 15", () => {
    expect(validarRg("12345 ")).toBe(true); // posição 6 → 5
    expect(validarRg("1234 5")).toBe(false); // posição 5 → 4
    expect(validarRg("123456789012345")).toBe(true); // A15 cheio
    expect(validarRg("1234567890123456789")).toBe(true); // truncado a 15
  });

  it("RK-cf4926ddfa8b (VALDOCS:160): comprimento < 5 → inválido; LEGACY-QUIRK(D20)", () => {
    expect(validarRg("1234")).toBe(false);
    expect(validarRg("12345")).toBe(true);
    expect(validarRg("12 345678")).toBe(false); // D20: conta só até o espaço
    expect(validarRg(" 123456")).toBe(false); // D20: começa com espaço → 0
    expect(validarRg("MG-12.345.678")).toBe(true);
  });

  it("RK-4aa29d42f19a (VALDOCS:174): prefixos especiais 000, 001, 002, 010, 011, 099, 100, 999", () => {
    expect(PREFIXOS_DOC_ESPECIAL).toEqual(["000", "001", "002", "010", "011", "099", "100", "999"]);
    for (const p of PREFIXOS_DOC_ESPECIAL) expect(ehDocEspecial(`${p}12345678`)).toBe(true);
    for (const p of ["003", "012", "101", "998", "200"]) expect(ehDocEspecial(`${p}12345678`)).toBe(false);
    expect(ehDocEspecial("00112345")).toBe(false); // não é N11 completo
    expect(ehDocEspecial("")).toBe(false);
  });

  it("acúmulo limitado a 5 mensagens (#MSG(1:5))", () => {
    const erros: string[] = [];
    for (let i = 0; i < 7; i++) acumularErroDoc(erros, `E${i}`);
    expect(MAX_ERROS_VALDOCS).toBe(5);
    expect(erros).toEqual(["E0", "E1", "E2", "E3", "E4"]);
  });
});

describe("entradaValdocsSchema (borda)", () => {
  it("CPF: só dígitos, zeros à esquerda; vazio = 0 (N11)", () => {
    const p = (numCpf: string) => entradaValdocsSchema.parse({ numCpf, rg: "", tituloEleitor: "", ctps: "" }).numCpf;
    expect(p("012.345.678-90")).toBe("01234567890");
    expect(p("")).toBe("00000000000");
    expect(p("123456789012")).toBe("123456789012");
  });

  it("valores longos são truncados à largura do campo, sem rejeição", () => {
    const r = entradaValdocsSchema.safeParse({ numCpf: "", rg: "R".repeat(40), tituloEleitor: "T".repeat(40), ctps: "C".repeat(40) });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ numCpf: "00000000000", rg: "R".repeat(15), tituloEleitor: "T".repeat(12), ctps: "C".repeat(15) });
  });
});
