import { describe, expect, it } from "vitest";
import {
  alteracaoBeneficiarioSchema,
  alteracaoBeneficiarioStatusBrancoSchema,
  campoDoErro,
  descricaoSituacaoBeneficiario,
  esquemaAlteracaoBeneficiario,
  MSG_SELECIONE_SITUACAO,
  STATUS_EM_BRANCO,
  statusEmBranco,
  statusResultante,
} from "./beneficiario/cadastro";
import { decidirInclusao, verificarLimite } from "./beneficiario/dependentes";
import { validarDocumentos, validarRg } from "./beneficiario/documentos";
import { anoBissexto, validarCadastroConsolidado, validarDataNascimento, validarNome } from "./beneficiario/validacao";
import { completaDv, validaCpfCompleto } from "./cpf";
import { avaliarElegibilidade, MENSAGENS_VALELEG as M, type BeneficiarioElegibilidade, type ProgramaElegibilidade } from "./elegibilidade";
import { QUIRKS_PADRAO, type QuirkCorrigivel, type Quirks } from "./quirks";

// Grupo A de correcciones configurables (spec-quirks-corregibles): cada quirk en modo
// legado (default y QUIRKS_PADRAO explícito) y en modo corregido.

const corr = (...ids: QuirkCorrigivel[]): Quirks => ({ ...QUIRKS_PADRAO, corrigidos: new Set(ids) });
const ANO = 2026;

describe("D4b — CPF com 11 dígitos iguais", () => {
  it("legado: 00000000000 válido; 11111111111..99999999999 inválidos", () => {
    expect(validaCpfCompleto("00000000000")).toBe(true);
    expect(validaCpfCompleto("00000000000", QUIRKS_PADRAO)).toBe(true);
    for (let d = 1; d <= 9; d++) expect(validaCpfCompleto(String(d).repeat(11))).toBe(false);
  });

  it("corrigido: todo CPF com dígitos iguais é inválido, inclusive 00000000000", () => {
    for (let d = 0; d <= 9; d++) expect(validaCpfCompleto(String(d).repeat(11), corr("D4b"))).toBe(false);
  });

  it("corrigido: CPFs válidos continuam válidos; outras correções não afetam D4b", () => {
    expect(validaCpfCompleto(completaDv("123456789"), corr("D4b"))).toBe(true);
    expect(validaCpfCompleto("00000000000", corr("D16", "D19"))).toBe(true);
  });

  it("validação consolidada propaga o modo", () => {
    const dados = { numCpf: "00000000000", nomeCompleto: "MARIA SILVA", dtNascimento: 19850412, uf: "SP", sitBeneficiario: "A" };
    expect(validarCadastroConsolidado(dados, ANO)).toEqual({ resultado: "V", erros: [] });
    expect(validarCadastroConsolidado(dados, ANO, corr("D4b"))).toEqual({ resultado: "I", erros: ["CPF INVALIDO - DIGITO VERIFICADOR"] });
  });
});

describe("D16 — fevereiro", () => {
  it("anoBissexto gregoriano", () => {
    expect([2024, 2000, 1904].map(anoBissexto)).toEqual([true, true, true]);
    expect([2023, 1900, 2100, 2025].map(anoBissexto)).toEqual([false, false, false, false]);
  });

  it("legado: 29/02 sempre válido; 30/02 inválido", () => {
    expect(validarDataNascimento(20230229, ANO)).toBe(true);
    expect(validarDataNascimento(19000229, ANO, QUIRKS_PADRAO)).toBe(true);
    expect(validarDataNascimento(20230230, ANO)).toBe(false);
  });

  it("corrigido: 29/02 só em ano bissexto (inclusive regra de 100/400)", () => {
    const q = corr("D16");
    expect(validarDataNascimento(20230229, ANO, q)).toBe(false);
    expect(validarDataNascimento(20240229, ANO, q)).toBe(true);
    expect(validarDataNascimento(19000229, ANO, q)).toBe(false);
    expect(validarDataNascimento(20000229, ANO, q)).toBe(true);
    expect(validarDataNascimento(20230228, ANO, q)).toBe(true);
    expect(validarDataNascimento(20230230, ANO, q)).toBe(false);
    // Outros meses não mudam.
    expect(validarDataNascimento(20230131, ANO, q)).toBe(true);
    expect(validarDataNascimento(20230431, ANO, q)).toBe(false);
  });
});

describe("D19 — nome e sobrenome", () => {
  it("legado: uma palavra é válida (preenchimento do A60); 60 caracteres sem espaço, inválido; começando por espaço, inválido", () => {
    expect(validarNome("MARIA")).toBe(true);
    expect(validarNome("A".repeat(60), QUIRKS_PADRAO)).toBe(false);
    expect(validarNome(" MARIA SILVA")).toBe(false);
  });

  it("corrigido: exige duas palavras após o trim", () => {
    const q = corr("D19");
    expect(validarNome("MARIA", q)).toBe(false);
    expect(validarNome("  MARIA  ", q)).toBe(false);
    expect(validarNome("MARIA SILVA", q)).toBe(true);
    expect(validarNome(" MARIA SILVA", q)).toBe(true);
    expect(validarNome("MARIA   SILVA", q)).toBe(true);
    expect(validarNome("", q)).toBe(false);
    expect(validarNome("   ", q)).toBe(false);
    // Só o espaço ASCII separa (campo A de Natural): TAB não é separador nem borda.
    expect(validarNome("MARIA\tSILVA", q)).toBe(false);
    expect(validarNome("\tMARIA", q)).toBe(false);
    expect(validarNome("MARIA\t SILVA", q)).toBe(true);
    // Truncado a 60: o sobrenome além da posição 60 não conta.
    expect(validarNome(`${"A".repeat(60)} SILVA`, q)).toBe(false);
  });
});

describe("D5 — idade > 75 → S", () => {
  const nasc80 = (ANO - 80) * 10000 + 101;
  const nasc75 = (ANO - 75) * 10000 + 101;
  it("legado: S na inclusão e na alteração", () => {
    expect(statusResultante("I", nasc80, ANO)).toEqual({ status: "S", suspensoPorIdade: true });
    expect(statusResultante("A", nasc80, ANO, "A")).toEqual({ status: "S", suspensoPorIdade: true });
    expect(statusResultante("A", nasc80, ANO, "S", QUIRKS_PADRAO)).toEqual({ status: "S", suspensoPorIdade: false });
  });

  it("corrigido: só na inclusão; na alteração conserva o status escolhido", () => {
    const q = corr("D5");
    expect(statusResultante("I", nasc80, ANO, undefined, q)).toEqual({ status: "S", suspensoPorIdade: true });
    expect(statusResultante("A", nasc80, ANO, "A", q)).toEqual({ status: "A", suspensoPorIdade: false });
    expect(statusResultante("A", nasc80, ANO, "C", q)).toEqual({ status: "C", suspensoPorIdade: false });
  });

  it("limite: 75 anos exatos não suspende em nenhum modo", () => {
    expect(statusResultante("I", nasc75, ANO)).toEqual({ status: "A", suspensoPorIdade: false });
    expect(statusResultante("A", nasc75, ANO, "I", corr("D5"))).toEqual({ status: "I", suspensoPorIdade: false });
  });
});

describe("D18 — status em branco na alteração (flag legado opt-in)", () => {
  const nasc80 = (ANO - 80) * 10000 + 101;
  const flag = { ...QUIRKS_PADRAO, statusBrancoAlteracao: true };
  it("default: alteração conserva o status informado", () => {
    expect(statusResultante("A", 19850412, ANO, "I")).toEqual({ status: "I", suspensoPorIdade: false });
  });

  it("flag: alteração grava em branco, ignorando o informado; inclusão continua A", () => {
    expect(STATUS_EM_BRANCO).toBe(" ");
    expect(statusResultante("A", 19850412, ANO, "I", flag)).toEqual({ status: " ", suspensoPorIdade: false });
    expect(statusResultante("A", 19850412, ANO, undefined, flag)).toEqual({ status: " ", suspensoPorIdade: false });
    expect(statusResultante("I", 19850412, ANO, undefined, flag)).toEqual({ status: "A", suspensoPorIdade: false });
  });

  it("flag + idade > 75 → S (D5 legado); com D5 corrigido fica em branco", () => {
    expect(statusResultante("A", nasc80, ANO, "A", flag)).toEqual({ status: "S", suspensoPorIdade: true });
    expect(statusResultante("A", nasc80, ANO, "A", { ...flag, corrigidos: new Set(["D5"]) })).toEqual({ status: " ", suspensoPorIdade: false });
  });

  it("rótulo do status: em branco → 'Em branco'; conhecidos e desconhecidos", () => {
    expect(descricaoSituacaoBeneficiario(" ")).toBe("Em branco");
    expect(descricaoSituacaoBeneficiario("")).toBe("Em branco");
    expect(descricaoSituacaoBeneficiario(null)).toBe("Em branco");
    expect(descricaoSituacaoBeneficiario("A")).toBe("A — Ativo");
    expect(descricaoSituacaoBeneficiario("S")).toBe("S — Suspenso");
    expect(descricaoSituacaoBeneficiario("X")).toBe("X — Desconhecido");
    expect(statusEmBranco(STATUS_EM_BRANCO)).toBe(true);
    expect(statusEmBranco("A")).toBe(false);
  });

  it("sem o flag e sem status informado: nunca assume 'A'", () => {
    expect(statusResultante("A", 19850412, ANO, undefined)).toEqual({ status: " ", suspensoPorIdade: false });
  });

  it("esquema padrão exige escolha explícita: em branco → 'Selecione a situação.' (campo sitBeneficiario)", () => {
    const erro = (v: unknown) => {
      const r = alteracaoBeneficiarioSchema.shape.sitBeneficiario.safeParse(v);
      return r.success ? null : r.error.issues[0]?.message;
    };
    expect(erro(" ")).toBe(MSG_SELECIONE_SITUACAO);
    expect(erro("")).toBe(MSG_SELECIONE_SITUACAO);
    expect(erro(undefined)).toBe(MSG_SELECIONE_SITUACAO);
    expect(erro("Z")).toBe("Situação: informe A, S, C, I ou D");
    expect(erro("C")).toBeNull();
    expect(campoDoErro(MSG_SELECIONE_SITUACAO)).toBe("sitBeneficiario");
  });

  it("esquema da alteração: com o flag o status não é validado", () => {
    expect(esquemaAlteracaoBeneficiario()).toBe(alteracaoBeneficiarioSchema);
    expect(esquemaAlteracaoBeneficiario(flag)).toBe(alteracaoBeneficiarioStatusBrancoSchema);
    const base = {
      numCpf: completaDv("123456789"),
      nomeCompleto: "X Y",
      dtNascimento: "19850412",
      sexo: "F",
      logradouro: "",
      municipio: "",
      uf: "",
      cep: "",
      telFixo: "",
      rgNumero: "",
      codPrograma: "PA01",
      vlrRendaFamiliar: "0",
      numDependentes: "0",
      codRegiao: "1",
      nis: "",
      numVersao: "1",
    };
    expect(alteracaoBeneficiarioSchema.safeParse(base).success).toBe(false);
    const r = alteracaoBeneficiarioStatusBrancoSchema.safeParse({ ...base, sitBeneficiario: "Z" });
    expect(r.success && r.data.sitBeneficiario).toBeUndefined();
  });
});

describe("D6 — limite de dependentes", () => {
  it("legado: corta em > 5 (permite o 6.º)", () => {
    expect(verificarLimite(4)).toBeNull();
    expect(verificarLimite(5)).toBeNull();
    expect(verificarLimite(6, QUIRKS_PADRAO)).toBe("LIMITE DE DEPENDENTES ATINGIDO");
  });

  it("corrigido: máximo 5 (o 6.º é rejeitado com a mesma mensagem)", () => {
    const q = corr("D6");
    expect(verificarLimite(0, q)).toBeNull();
    expect(verificarLimite(4, q)).toBeNull();
    expect(verificarLimite(5, q)).toBe("LIMITE DE DEPENDENTES ATINGIDO");
    expect(verificarLimite(6, q)).toBe("LIMITE DE DEPENDENTES ATINGIDO");
  });

  it("decidirInclusao propaga o modo", () => {
    const titular = { sitBeneficiario: "A", numDependentes: 5 };
    const dados = { nomeDependente: "X", parentesco: "FI", cpfDependente: null };
    expect(decidirInclusao(titular, dados, [])).toEqual({ ok: true, occurrence: 6, total: 6 });
    expect(decidirInclusao(titular, dados, [], corr("D6"))).toEqual({ ok: false, mensagens: ["LIMITE DE DEPENDENTES ATINGIDO"] });
    expect(decidirInclusao({ ...titular, numDependentes: 4 }, dados, [], corr("D6"))).toEqual({ ok: true, occurrence: 5, total: 5 });
  });
});

describe("D12 — região 99", () => {
  const benef = (over: Partial<BeneficiarioElegibilidade> = {}): BeneficiarioElegibilidade => ({
    dtNascimento: 19850412,
    sitBeneficiario: "A",
    vlrRendaFamiliar: 50000,
    numDependentes: 1,
    codRegiao: 99,
    nis: "10000000001",
    documentosOk: "S",
    ...over,
  });
  const prog = (over: Partial<ProgramaElegibilidade> = {}): ProgramaElegibilidade => ({
    sitPrograma: "A",
    tipoPrograma: "T",
    codElegibilidade: null,
    rendaMaxPercap: 0,
    idadeMin: 0,
    idadeMax: 0,
    ...over,
  });

  it("legado: região 99 elegível sem verificações", () => {
    const esperado = { tipo: "regiaoEspecial", elegivel: true, mensagem: M.regiaoEspecial };
    expect(avaliarElegibilidade(benef({ sitBeneficiario: "C" }), prog(), ANO)).toEqual(esperado);
    expect(avaliarElegibilidade(benef(), prog(), ANO, QUIRKS_PADRAO)).toEqual(esperado);
  });

  it("corrigido: região 99 passa pelas verificações normais", () => {
    const q = corr("D12");
    expect(avaliarElegibilidade(benef(), prog(), ANO, q)).toEqual({ tipo: "avaliado", elegivel: true, mensagem: M.elegivel, motivos: [] });
    expect(avaliarElegibilidade(benef({ sitBeneficiario: "C", documentosOk: "N" }), prog({ tipoPrograma: "A" }), ANO, q)).toEqual({
      tipo: "avaliado",
      elegivel: false,
      mensagem: M.naoElegivel,
      motivos: [M.canceladoDesligado, M.documentacaoIncompleta],
    });
  });

  it("LEGACY-QUIRK(D18): status em branco não gera motivo de status (em nenhum modo de D12)", () => {
    const b = benef({ codRegiao: 1, sitBeneficiario: " " });
    expect(avaliarElegibilidade(b, prog(), ANO)).toEqual({ tipo: "avaliado", elegivel: true, mensagem: M.elegivel, motivos: [] });
    expect(avaliarElegibilidade({ ...b, codRegiao: 99 }, prog(), ANO, corr("D12"))).toMatchObject({ elegivel: true, motivos: [] });
  });

  it("corrigido: precondições continuam antes (programa inativo)", () => {
    expect(avaliarElegibilidade(benef(), prog({ sitPrograma: "I" }), ANO, corr("D12"))).toEqual({ tipo: "precondicao", mensagem: M.programaInativo });
  });
});

describe("D20 — comprimento do RG", () => {
  it("legado: mede até o primeiro espaço", () => {
    expect(validarRg("12 345678")).toBe(false);
    expect(validarRg(" 123456", QUIRKS_PADRAO)).toBe(false);
    expect(validarRg("12345 6")).toBe(true);
    expect(validarRg("1234")).toBe(false);
  });

  it("corrigido: conta os caracteres não brancos", () => {
    const q = corr("D20");
    expect(validarRg("12 345678", q)).toBe(true);
    expect(validarRg(" 123456", q)).toBe(true);
    expect(validarRg("12 34", q)).toBe(false);
    expect(validarRg("1 2 3 4 5", q)).toBe(true);
    expect(validarRg("1234", q)).toBe(false);
    expect(validarRg("", q)).toBe(false);
    expect(validarRg("     ", q)).toBe(false);
    // Só o espaço ASCII é branco: TAB conta como caractere.
    expect(validarRg("12\t34", q)).toBe(true);
    expect(validarRg("\t\t\t\t", q)).toBe(false);
    expect(validarRg("\t\t \t\t\t", q)).toBe(true);
    // A15: o que passa da posição 15 não conta.
    expect(validarRg(`${" ".repeat(12)}123456`, q)).toBe(false);
  });

  it("validarDocumentos: sem `corrigidos` = legado; com D20 propaga", () => {
    const dados = { numCpf: "01234567890", rg: "12 345678", tituloEleitor: "", ctps: "" };
    expect(validarDocumentos(dados, { docEspecialHabilitado: false })).toMatchObject({ resultado: "I" });
    expect(validarDocumentos(dados, corr("D20"))).toEqual({ resultado: "V", erros: [], docEspecial: false });
  });
});
