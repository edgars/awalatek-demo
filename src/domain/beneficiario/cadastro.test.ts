import { describe, expect, it } from "vitest";
import {
  alteracaoBeneficiarioSchema,
  campoDoErro,
  camposImutaveisAlterados,
  decidirOperacao,
  idadeCadastro,
  inclusaoBeneficiarioSchema,
  MENSAGENS_CADBENEF,
  mensagemCampoNaoEditavel,
  primeiroErroDosCampos,
  statusResultante,
  validarCadastro,
} from "./cadastro";

const CPF_OK = "01234567890";
const base = { numCpf: CPF_OK, nomeCompleto: "MARIA TESTE", dtNascimento: 19850412, sexo: "F" };

describe("CADBENEF — validação sequencial (FR-BEN-01/02)", () => {
  it("mensagens literais", () => {
    expect(MENSAGENS_CADBENEF).toMatchObject({
      operacaoInvalida: "OPERACAO INVALIDA - INFORME I OU A",
      cpfObrigatorio: "CPF OBRIGATORIO",
      cpfInvalido: "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO",
      nomeObrigatorio: "NOME OBRIGATORIO",
      dataNascimentoObrigatoria: "DATA NASCIMENTO OBRIGATORIA",
      sexoInvalido: "SEXO INVALIDO",
      jaCadastrado: "BENEFICIARIO JA CADASTRADO",
      naoEncontradoAlteracao: "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO",
      incluidoSucesso: "BENEFICIARIO INCLUIDO COM SUCESSO",
      alteradoSucesso: "BENEFICIARIO ALTERADO COM SUCESSO",
    });
  });

  it("dados válidos → null", () => {
    expect(validarCadastro("I", base, false)).toBeNull();
    expect(validarCadastro("A", base, true)).toBeNull();
  });

  it("RK-c83257ae5f85 (CADBENEF:99): operação fora de I/A", () => {
    expect(validarCadastro("X", base, false)).toBe("OPERACAO INVALIDA - INFORME I OU A");
    expect(validarCadastro("", { ...base, numCpf: "" }, false)).toBe("OPERACAO INVALIDA - INFORME I OU A");
  });

  it("RK-40623cadda7c (CADBENEF:105): CPF vazio ou 0", () => {
    expect(validarCadastro("I", { ...base, numCpf: "" }, false)).toBe("CPF OBRIGATORIO");
    expect(validarCadastro("I", { ...base, numCpf: "00000000000" }, false)).toBe("CPF OBRIGATORIO");
  });

  it("primeiro erro ganha: CPF vazio e nome vazio → só CPF OBRIGATORIO", () => {
    expect(validarCadastro("I", { ...base, numCpf: "", nomeCompleto: "" }, false)).toBe("CPF OBRIGATORIO");
  });

  it("RK-bc7d67f3dad4 (CADBENEF:113): DV inválido", () => {
    expect(validarCadastro("I", { ...base, numCpf: "01234567891", nomeCompleto: "" }, false)).toBe(
      "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO",
    );
  });

  it("RK-e1aba7261a6b (CADBENEF:119): nome em branco", () => {
    expect(validarCadastro("I", { ...base, nomeCompleto: "   ", dtNascimento: 0 }, false)).toBe("NOME OBRIGATORIO");
  });

  it("RK-a14601290959 (CADBENEF:125): nascimento 0", () => {
    expect(validarCadastro("I", { ...base, dtNascimento: 0, sexo: "X" }, false)).toBe("DATA NASCIMENTO OBRIGATORIA");
  });

  it("RK-e17b444be69b (CADBENEF:131): sexo fora de M/F", () => {
    expect(validarCadastro("I", { ...base, sexo: "X" }, true)).toBe("SEXO INVALIDO");
    expect(validarCadastro("I", { ...base, sexo: "" }, false)).toBe("SEXO INVALIDO");
  });

  it("RK-7d4387e99f5a (CADBENEF:143): inclusão com CPF existente", () => {
    expect(validarCadastro("I", base, true)).toBe("BENEFICIARIO JA CADASTRADO");
  });

  it("RK-2f8766f52e1b (CADBENEF:149): alteração com CPF inexistente", () => {
    expect(validarCadastro("A", base, false)).toBe("BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO");
  });

  it("RK-07ac728d731a (CADBENEF:171) / RK-b89433734937 (CADBENEF:177): erro aborta; sem erro, ramo I/A", () => {
    expect(decidirOperacao("I", base, true)).toEqual({ ok: false, mensagem: "BENEFICIARIO JA CADASTRADO" });
    expect(decidirOperacao("I", base, false)).toEqual({ ok: true, operacao: "I" });
    expect(decidirOperacao("A", base, true)).toEqual({ ok: true, operacao: "A" });
  });

  it("primeiroErroDosCampos segue a mesma ordem sem consultar a base", () => {
    expect(primeiroErroDosCampos("I", { numCpf: "", nomeCompleto: "", dtNascimento: "0", sexo: "" })).toBe("CPF OBRIGATORIO");
    expect(primeiroErroDosCampos("I", { numCpf: "012.345.678-90", nomeCompleto: "X", dtNascimento: "19850412", sexo: "f" })).toBeNull();
    expect(primeiroErroDosCampos("I", { numCpf: "012345678901", nomeCompleto: "X", dtNascimento: "0", sexo: "F" })).toBe(
      "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO",
    );
    expect(primeiroErroDosCampos("A", { numCpf: CPF_OK, nomeCompleto: "X", dtNascimento: "invalido", sexo: "F" })).toBeNull();
  });

  it("campoDoErro associa a mensagem ao campo", () => {
    expect(campoDoErro("CPF OBRIGATORIO")).toBe("numCpf");
    expect(campoDoErro("SEXO INVALIDO")).toBe("sexo");
    expect(campoDoErro("outra")).toBeUndefined();
  });
});

describe("CADBENEF — status (FR-BEN-04/05)", () => {
  it("RK-46154d4f44a9 (CADBENEF:159): idade = ano atual − ano de nascimento", () => {
    expect(idadeCadastro(19851231, 2026)).toBe(41);
    expect(idadeCadastro(19500101, 2026)).toBe(76);
  });

  it("RK-e4b2970fefe6 (CADBENEF:162): inclusão → A", () => {
    expect(statusResultante("I", 19850412, 2026)).toEqual({ status: "A", suspensoPorIdade: false });
  });

  it("RK-9ffc13028ce4 (CADBENEF:167) LEGACY-QUIRK(D5): idade > 75 → S na inclusão", () => {
    expect(statusResultante("I", 19400101, 2026)).toEqual({ status: "S", suspensoPorIdade: true });
    // 75 exatos não suspende.
    expect(statusResultante("I", 19510101, 2026)).toEqual({ status: "A", suspensoPorIdade: false });
  });

  it("RK-9ffc13028ce4 (CADBENEF:167) LEGACY-QUIRK(D5): idade > 75 → S também na alteração", () => {
    expect(statusResultante("A", 19460101, 2026, "A")).toEqual({ status: "S", suspensoPorIdade: true });
    expect(statusResultante("A", 19460101, 2026, "S")).toEqual({ status: "S", suspensoPorIdade: false });
  });

  it("D18: alteração conserva o status informado", () => {
    expect(statusResultante("A", 19850412, 2026, "C")).toEqual({ status: "C", suspensoPorIdade: false });
  });
});

describe("CADBENEF — campos imutáveis", () => {
  const reg = { dtNascimento: 19850412, sexo: "F", codPrograma: "PA01", codRegiao: 1, nis: null };
  it("detecta mudanças", () => {
    expect(camposImutaveisAlterados(reg, { ...reg })).toEqual([]);
    expect(camposImutaveisAlterados(reg, { ...reg, dtNascimento: 19850413, nis: "12345678901" })).toEqual(["dtNascimento", "nis"]);
    expect(mensagemCampoNaoEditavel(["dtNascimento", "nis"])).toBe("Campo não editável na alteração: Data de nascimento, NIS.");
  });
});

describe("esquemas zod", () => {
  const form = {
    numCpf: "012.345.678-90",
    nomeCompleto: " maria teste ",
    dtNascimento: "19850412",
    sexo: "f",
    logradouro: "",
    municipio: "",
    uf: "sp",
    cep: "01310-100",
    telFixo: "",
    rgNumero: "",
    codPrograma: "pa01",
    vlrRendaFamiliar: "120000",
    numDependentes: "",
    codRegiao: "1",
    nis: "",
  };

  it("normaliza a inclusão (vazios → NULL, CPF 11 dígitos)", () => {
    expect(inclusaoBeneficiarioSchema.parse(form)).toEqual({
      numCpf: "01234567890",
      nomeCompleto: "MARIA TESTE",
      dtNascimento: 19850412,
      sexo: "F",
      logradouro: null,
      municipio: null,
      uf: "SP",
      cep: 1310100,
      telFixo: null,
      rgNumero: null,
      codPrograma: "PA01",
      vlrRendaFamiliar: 120000,
      numDependentes: 0,
      codRegiao: 1,
      nis: null,
    });
  });

  it("CPF curto recebe zeros à esquerda (N11); vazio fica vazio", () => {
    expect(inclusaoBeneficiarioSchema.parse({ ...form, numCpf: "123" }).numCpf).toBe("00000000123");
    expect(inclusaoBeneficiarioSchema.parse({ ...form, numCpf: "" }).numCpf).toBe("");
  });

  it("limites numéricos legados", () => {
    expect(inclusaoBeneficiarioSchema.safeParse({ ...form, codRegiao: "100" }).success).toBe(false);
    expect(inclusaoBeneficiarioSchema.safeParse({ ...form, cep: "123456789" }).success).toBe(false);
    expect(inclusaoBeneficiarioSchema.safeParse({ ...form, cep: "0131" }).success).toBe(false);
    expect(inclusaoBeneficiarioSchema.parse({ ...form, cep: "" }).cep).toBeNull();
    expect(inclusaoBeneficiarioSchema.safeParse({ ...form, vlrRendaFamiliar: "1000000000" }).success).toBe(false);
    expect(inclusaoBeneficiarioSchema.safeParse({ ...form, nis: "123" }).success).toBe(false);
  });

  it("alteração exige situação válida e versão", () => {
    expect(alteracaoBeneficiarioSchema.safeParse({ ...form, sitBeneficiario: "X", numVersao: "1" }).success).toBe(false);
    expect(alteracaoBeneficiarioSchema.safeParse({ ...form, sitBeneficiario: "A", numVersao: "0" }).success).toBe(false);
    expect(alteracaoBeneficiarioSchema.parse({ ...form, sitBeneficiario: "C", numVersao: "3" })).toMatchObject({
      sitBeneficiario: "C",
      numVersao: 3,
    });
  });
});
