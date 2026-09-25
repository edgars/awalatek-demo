import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alterarBeneficiarioAction, incluirBeneficiarioAction } from "@/app/beneficiarios/actions";
import EditarBeneficiarioPage from "@/app/beneficiarios/[cpf]/editar/page";
import { incluirDependenteAction } from "@/app/beneficiarios/[cpf]/dependentes/actions";
import { FormBeneficiario } from "@/app/beneficiarios/_componentes/FormBeneficiario";
import { verificarElegibilidadeAction } from "@/app/elegibilidade/actions";
import { validarCadastroAction } from "@/app/validacao/cadastro/actions";
import { validarDocumentosAction } from "@/app/validacao/documentos/actions";
import type { PrismaClient } from "@/generated/prisma/client";
import { completaDv } from "@/domain/cpf";
import { MENSAGENS_VALELEG as M } from "@/domain/elegibilidade";
import { hoje } from "@/domain/legacyDate";
import { lerQuirks, QUIRKS_PADRAO } from "@/domain/quirks";
import { createPrismaClient } from "@/server/db";
import { alterarBeneficiario } from "@/server/beneficiarios";
import { incluirDependente } from "@/server/dependentes";
import { verificarElegibilidade } from "@/server/elegibilidade";
import { alteracaoBeneficiarioSchema, alteracaoBeneficiarioStatusBrancoSchema, MENSAGENS_SISTEMA } from "@/domain/beneficiario/cadastro";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Grupo A de correcciones configurables (spec-quirks-corregibles): la configuración
// del entorno (SIFAP_QUIRKS_CORRIGIDOS / LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED) llega
// al dominio desde el servidor. Base SQLite temporal.

let dir: string;
let prisma: PrismaClient;
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };
const DATABASE_URL_ORIGINAL = process.env.DATABASE_URL;
let versaoMaria = 1;
const ANO = 2026;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base);
const CPF_FRANCISCO = cpfComDv(BENEFICIARIOS_SEED[3].base); // I, região 99
const CPF_IDOSO = completaDv("777888999");
const CPF_TITULAR = completaDv("555444333");
const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-quirks-a-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  // O singleton de @/server/db (usado pelas Server Actions) é recriado apontando para esta base.
  delete globalPrisma.prisma;
  process.env.DATABASE_URL = url;
  await seed(prisma);
  versaoMaria = (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_MARIA } })).numVersao;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  vi.unstubAllEnvs();
  if (DATABASE_URL_ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = DATABASE_URL_ORIGINAL;
  rmSync(dir, { recursive: true, force: true });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  // Dependentes incluídos pelos testes (p. ex. o 6.º de D6) não sobrevivem ao teste.
  await prisma.beneficiarioDependente.deleteMany({ where: { beneficiario: { numCpf: CPF_TITULAR } } });
});

beforeEach(async () => {
  vi.stubEnv("SIFAP_USER", "SIFAPUSR");
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
  vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "");
  // MARIA volta ao estado do seed (os testes de D18 alteram status e versão).
  await prisma.beneficiario.update({ where: { numCpf: CPF_MARIA }, data: { sitBeneficiario: "A", numVersao: versaoMaria } });
  await prisma.beneficiario.deleteMany({ where: { numCpf: { in: [CPF_IDOSO, CPF_TITULAR] } } });
  const base = {
    sexo: "F",
    codRegiao: 1,
    codPrograma: "PA01",
    dtCadastro: 20250101,
    sitBeneficiario: "A",
    vlrRendaFamiliar: 50000,
    dtInclusao: 20250101,
    usrInclusao: "TESTE",
    dtUltAlteracao: 20250101,
    usrUltAlteracao: "TESTE",
  };
  const anoNasc = Math.trunc(hoje().data / 10000) - 80;
  await prisma.beneficiario.create({
    data: { ...base, numCpf: CPF_IDOSO, nomeCompleto: "IDOSA DE TESTE", dtNascimento: anoNasc * 10000 + 101, numDependentes: 0 },
  });
  await prisma.beneficiario.create({
    data: { ...base, numCpf: CPF_TITULAR, nomeCompleto: "TITULAR DE TESTE", dtNascimento: 19800101, numDependentes: 5 },
  });
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function camposAlteracao(numCpf: string, over: Record<string, string> = {}): Promise<Record<string, string>> {
  const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf } });
  return {
    numCpf,
    nomeCompleto: b.nomeCompleto,
    dtNascimento: String(b.dtNascimento),
    sexo: b.sexo,
    logradouro: b.logradouro ?? "",
    municipio: b.municipio ?? "",
    uf: b.uf ?? "",
    cep: b.cep ? String(b.cep) : "",
    telFixo: b.telFixo ?? "",
    rgNumero: b.rgNumero ?? "",
    codPrograma: b.codPrograma,
    vlrRendaFamiliar: String(b.vlrRendaFamiliar),
    numDependentes: String(b.numDependentes),
    codRegiao: String(b.codRegiao),
    nis: b.nis ?? "",
    sitBeneficiario: b.sitBeneficiario,
    numVersao: String(b.numVersao),
    ...over,
  };
}

const VALBENEF_OK = { numCpf: "", nomeCompleto: "MARIA SILVA", dtNascimento: "19850412", uf: "SP", sitBeneficiario: "A" };

describe("configuração inválida", () => {
  it("SIFAP_QUIRKS_CORRIGIDOS desconhecido → erro genérico e log sem PII", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D99");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await validarCadastroAction(null, form({ ...VALBENEF_OK, numCpf: CPF_MARIA }))).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
    expect(await verificarElegibilidadeAction(null, form({ numCpf: CPF_MARIA, codPrograma: "PT01" }))).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
    expect(await incluirDependenteAction(CPF_TITULAR, null, form({ nomeDependente: "X", dtNascDepend: "", parentesco: "FI", cpfDependente: "", docDependente: "", sexoDependente: "" }))).toEqual({
      ok: false,
      mensagens: [ERRO_INESPERADO],
    });
    expect(await alterarBeneficiarioAction(CPF_IDOSO, null, form(await camposAlteracao(CPF_IDOSO)))).toEqual({ ok: false, mensagens: [ERRO_INESPERADO] });
    // O log nomeia a variável real (detalheErroQuirks), sem dados pessoais.
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[validacao-cadastro\] configuração LEGACY-QUIRK inválida — SIFAP_QUIRKS_CORRIGIDOS: .*D99/));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[beneficiarios\] configuração LEGACY-QUIRK inválida — SIFAP_QUIRKS_CORRIGIDOS/));
    expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_MARIA);
    expect(JSON.stringify(log.mock.calls)).not.toContain(CPF_IDOSO);
    log.mockRestore();
  });

  it("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED inválido → a página de alteração mostra erro genérico", async () => {
    vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "talvez");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await EditarBeneficiarioPage({ params: Promise.resolve({ cpf: CPF_IDOSO }) }));
    expect(html).toContain(ERRO_INESPERADO);
    expect(html).not.toContain("IDOSA DE TESTE");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED/));
    log.mockRestore();
  });
});

describe("D4b — validação cadastral (VALBENEF)", () => {
  it("legado: CPF 00000000000 é válido; corrigido (D4b): inválido", async () => {
    expect(await validarCadastroAction(null, form(VALBENEF_OK))).toEqual({ ok: true, resultado: "V", erros: [] });
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D4b");
    expect(await validarCadastroAction(null, form(VALBENEF_OK))).toEqual({ ok: true, resultado: "I", erros: ["CPF INVALIDO - DIGITO VERIFICADOR"] });
    // CPF válido continua válido.
    expect(await validarCadastroAction(null, form({ ...VALBENEF_OK, numCpf: CPF_MARIA }))).toEqual({ ok: true, resultado: "V", erros: [] });
  });
});

describe("D16 — fevereiro (VALBENEF)", () => {
  it("legado: 29/02/2023 válida; corrigido (D16): inválida, 29/02/2024 continua válida", async () => {
    const f = (dt: string) => form({ ...VALBENEF_OK, numCpf: CPF_MARIA, dtNascimento: dt });
    expect(await validarCadastroAction(null, f("20230229"))).toEqual({ ok: true, resultado: "V", erros: [] });
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D16");
    expect(await validarCadastroAction(null, f("20230229"))).toEqual({ ok: true, resultado: "I", erros: ["DATA NASCIMENTO INVALIDA"] });
    expect(await validarCadastroAction(null, f("20240229"))).toEqual({ ok: true, resultado: "V", erros: [] });
  });
});

describe("D19 — nome com uma palavra (VALBENEF)", () => {
  it("legado: MARIA válido; corrigido (D19): NOME INVALIDO", async () => {
    const f = form({ ...VALBENEF_OK, numCpf: CPF_MARIA, nomeCompleto: "MARIA" });
    expect(await validarCadastroAction(null, f)).toEqual({ ok: true, resultado: "V", erros: [] });
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D19");
    expect(await validarCadastroAction(null, f)).toEqual({ ok: true, resultado: "I", erros: ["NOME INVALIDO - DEVE TER NOME E SOBRENOME"] });
  });

  it("ALL ativa D4b, D16 e D19 juntos", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL");
    const r = await validarCadastroAction(null, form({ ...VALBENEF_OK, nomeCompleto: "MARIA", dtNascimento: "20230229" }));
    expect(r).toEqual({
      ok: true,
      resultado: "I",
      erros: ["CPF INVALIDO - DIGITO VERIFICADOR", "DATA NASCIMENTO INVALIDA", "NOME INVALIDO - DEVE TER NOME E SOBRENOME"],
    });
  });
});

describe("D20 — comprimento do RG (VALDOCS)", () => {
  const f = (rg: string) => form({ numCpf: "01234567890", rg, tituloEleitor: "", ctps: "" });
  it("legado: '12 345678' inválido; corrigido (D20): válido", async () => {
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    expect(await validarDocumentosAction(null, f("12 345678"))).toEqual({
      ok: true,
      resultado: "I",
      erros: ["RG INVALIDO OU FORMATO INCORRETO"],
      docEspecial: false,
    });
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D20");
    expect(await validarDocumentosAction(null, f("12 345678"))).toEqual({ ok: true, resultado: "V", erros: [], docEspecial: false });
    expect(await validarDocumentosAction(null, f("1 2 3 4"))).toMatchObject({ resultado: "I" });
  });
});

describe("D5 — idade > 75 na alteração", () => {
  it("legado: status A vira S; corrigido (D5): conserva A", async () => {
    const legado = await alterarBeneficiarioAction(CPF_IDOSO, null, form(await camposAlteracao(CPF_IDOSO, { sitBeneficiario: "A" })));
    expect(legado).toMatchObject({ ok: true, status: "S", suspensoPorIdade: true });

    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D5");
    const corrigido = await alterarBeneficiarioAction(CPF_IDOSO, null, form(await camposAlteracao(CPF_IDOSO, { sitBeneficiario: "A" })));
    expect(corrigido).toMatchObject({ ok: true, status: "A", suspensoPorIdade: false });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_IDOSO } })).sitBeneficiario).toBe("A");
  });

  it("corrigido (D5): a inclusão de maior de 75 continua S", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D5");
    const cpf = completaDv("777111222");
    await prisma.beneficiario.deleteMany({ where: { numCpf: cpf } });
    const r = await incluirBeneficiarioAction(
      null,
      form({
        numCpf: cpf,
        nomeCompleto: "IDOSO NOVO",
        dtNascimento: "19400101",
        sexo: "M",
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
      }),
    );
    expect(r).toMatchObject({ ok: true, status: "S", suspensoPorIdade: true });
    await prisma.beneficiario.deleteMany({ where: { numCpf: cpf } });
  });

  it("caso de uso sem quirks = legado (não lê o ambiente); com quirks explícitos, corrigido", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D5");
    const dados = () => camposAlteracao(CPF_IDOSO, { sitBeneficiario: "A" }).then((c) => alteracaoBeneficiarioSchema.parse(c));
    expect(await alterarBeneficiario(await dados(), prisma)).toMatchObject({ ok: true, status: "S" });
    const d5 = { ...QUIRKS_PADRAO, corrigidos: new Set(["D5"] as const) };
    expect(await alterarBeneficiario(await dados(), prisma, d5)).toMatchObject({ ok: true, status: "A" });
  });
});

describe("D18 — status em branco na alteração (flag legado)", () => {
  it("flag ativo: grava status em branco; o status enviado é ignorado", async () => {
    vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "true");
    const cpf = CPF_MARIA;
    const campos = await camposAlteracao(cpf);
    delete (campos as Record<string, string | undefined>).sitBeneficiario;
    const r = await alterarBeneficiarioAction(cpf, null, form(campos));
    expect(r).toMatchObject({ ok: true, status: " ", suspensoPorIdade: false });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf } })).sitBeneficiario).toBe(" ");
    // Mesmo se o formulário enviar um status, o legado não o grava.
    const r2 = await alterarBeneficiarioAction(cpf, null, form(await camposAlteracao(cpf, { sitBeneficiario: "C" })));
    expect(r2).toMatchObject({ ok: true, status: " " });
  });

  it("flag ativo: idade > 75 → S", async () => {
    vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "true");
    const campos = await camposAlteracao(CPF_IDOSO);
    delete (campos as Record<string, string | undefined>).sitBeneficiario;
    expect(await alterarBeneficiarioAction(CPF_IDOSO, null, form(campos))).toMatchObject({ ok: true, status: "S", suspensoPorIdade: true });
  });

  it("default (flag ausente): status é obrigatório e editável", async () => {
    const campos = await camposAlteracao(CPF_MARIA);
    delete (campos as Record<string, string | undefined>).sitBeneficiario;
    expect(await alterarBeneficiarioAction(CPF_MARIA, null, form(campos))).toMatchObject({ ok: false });
    expect(await alterarBeneficiarioAction(CPF_MARIA, null, form(await camposAlteracao(CPF_MARIA, { sitBeneficiario: "I" })))).toMatchObject({
      ok: true,
      status: "I",
    });
  });

  function acharForm(no: ReactNode): ReactElement<Record<string, unknown>> | null {
    if (!isValidElement(no)) return null;
    const el = no as ReactElement<Record<string, unknown>>;
    if (el.type === FormBeneficiario) return el;
    const filhos = el.props.children as ReactNode;
    for (const f of Array.isArray(filhos) ? filhos : [filhos]) {
      const achado = acharForm(f as ReactNode);
      if (achado) return achado;
    }
    return null;
  }

  it("guarda do caso de uso: status ausente sem o flag → falha, nada gravado (nunca 'A')", async () => {
    const dados = alteracaoBeneficiarioStatusBrancoSchema.parse(await camposAlteracao(CPF_MARIA, { nomeCompleto: "OUTRO NOME" }));
    expect(dados.sitBeneficiario).toBeUndefined();
    expect(await alterarBeneficiario(dados, prisma)).toEqual({ ok: false, mensagem: "Selecione a situação." });
    const b = await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_MARIA } });
    expect([b.nomeCompleto, b.sitBeneficiario, b.numVersao]).toEqual(["MARIA APARECIDA DA SILVA", "A", versaoMaria]);
    // Com o flag, o mesmo dado grava em branco.
    expect(await alterarBeneficiario(dados, prisma, { ...QUIRKS_PADRAO, statusBrancoAlteracao: true })).toMatchObject({ ok: true, status: " " });
  });

  it("flag desligado sobre registro em branco: opção 'Em branco (legado D18)' pré-selecionada; gravar exige escolha", async () => {
    await prisma.beneficiario.update({ where: { numCpf: CPF_MARIA }, data: { sitBeneficiario: " " } });
    const el = acharForm(await EditarBeneficiarioPage({ params: Promise.resolve({ cpf: CPF_MARIA }) }));
    const html = renderToStaticMarkup(createElement(FormBeneficiario, el?.props as never));
    expect(html).toMatch(/<option value=" " selected="">Em branco \(legado D18\)<\/option>/);
    expect(html).not.toContain(MENSAGENS_SISTEMA.statusBrancoD18);

    const r = await alterarBeneficiarioAction(CPF_MARIA, null, form(await camposAlteracao(CPF_MARIA)));
    expect(r).toEqual({ ok: false, mensagens: ["Selecione a situação."], erros: { sitBeneficiario: "Selecione a situação." } });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_MARIA } })).sitBeneficiario).toBe(" ");
    expect(await alterarBeneficiarioAction(CPF_MARIA, null, form(await camposAlteracao(CPF_MARIA, { sitBeneficiario: "A" })))).toMatchObject({
      ok: true,
      status: "A",
    });
  });

  it("flag ligado: a tela avisa o status que será gravado (em branco; S se idade > 75 com D5 legado)", async () => {
    vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "true");
    const render = async (cpf: string) =>
      renderToStaticMarkup(createElement(FormBeneficiario, acharForm(await EditarBeneficiarioPage({ params: Promise.resolve({ cpf }) }))?.props as never)).replaceAll(
        "&gt;",
        ">",
      );
    expect(await render(CPF_MARIA)).toContain(MENSAGENS_SISTEMA.statusBrancoD18);
    expect(await render(CPF_IDOSO)).toContain(MENSAGENS_SISTEMA.statusSuspensoD18);
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D5");
    expect(await render(CPF_IDOSO)).toContain(MENSAGENS_SISTEMA.statusBrancoD18);
  });

  it("tela de alteração: com o flag o select de situação não é exibido", async () => {
    const pagina = async () => acharForm(await EditarBeneficiarioPage({ params: Promise.resolve({ cpf: CPF_MARIA }) }));
    const padrao = await pagina();
    expect(padrao?.props.statusBrancoAlteracao).toBe(false);
    expect(renderToStaticMarkup(createElement(FormBeneficiario, padrao?.props as never))).toContain('name="sitBeneficiario"');

    vi.stubEnv("LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED", "true");
    const legado = await pagina();
    expect(legado?.props.statusBrancoAlteracao).toBe(true);
    expect(renderToStaticMarkup(createElement(FormBeneficiario, legado?.props as never))).not.toContain('name="sitBeneficiario"');
  });
});

describe("D6 — limite de dependentes", () => {
  const dep = { nomeDependente: "SEXTO", dtNascDepend: 20150310, parentesco: "FI", cpfDependente: null, docDependente: null, sexoDependente: "M" };
  it("legado: com 5 inclui o 6.º; corrigido (D6): rejeita com a mensagem legada", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D6");
    expect(await incluirDependente(CPF_TITULAR, dep, undefined, lerQuirks())).toEqual({ ok: false, mensagens: ["LIMITE DE DEPENDENTES ATINGIDO"] });
    const f = form({ nomeDependente: "SEXTO", dtNascDepend: "", parentesco: "FI", cpfDependente: "", docDependente: "", sexoDependente: "" });
    expect(await incluirDependenteAction(CPF_TITULAR, null, f)).toEqual({ ok: false, mensagens: ["LIMITE DE DEPENDENTES ATINGIDO"], erros: {} });
    expect((await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: CPF_TITULAR } })).numDependentes).toBe(5);

    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
    expect(await incluirDependenteAction(CPF_TITULAR, null, f)).toEqual({ ok: true, mensagens: ["DEPENDENTE INCLUIDO - TOTAL: 6"], total: 6 });
  });
});

describe("D12 — região 99", () => {
  it("legado: REGIAO ESPECIAL; corrigido (D12): verificações normais", async () => {
    expect(await verificarElegibilidade(CPF_FRANCISCO, "PP01", prisma, ANO)).toEqual({ tipo: "regiaoEspecial", elegivel: true, mensagem: M.regiaoEspecial });
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D12");
    const r = await verificarElegibilidade(CPF_FRANCISCO, "PP01", prisma, ANO, lerQuirks());
    expect(r).toMatchObject({ tipo: "avaliado", elegivel: false, mensagem: M.naoElegivel });
    expect(r.tipo === "avaliado" && r.motivos[0]).toBe(M.inativo);
    const acao = await verificarElegibilidadeAction(null, form({ numCpf: CPF_FRANCISCO, codPrograma: "PP01" }));
    expect(acao).toMatchObject({ ok: true, resultado: { tipo: "avaliado", elegivel: false } });
  });
});

describe("ALL no nível das actions", () => {
  it("ALL ativa D5, D6, D12 e D20", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL");
    vi.stubEnv("LEGACY_DOC_ESPECIAL_ENABLED", "false");
    // D5: alteração do maior de 75 conserva A.
    expect(await alterarBeneficiarioAction(CPF_IDOSO, null, form(await camposAlteracao(CPF_IDOSO, { sitBeneficiario: "A" })))).toMatchObject({
      ok: true,
      status: "A",
    });
    // D6: com 5 dependentes o 6.º é rejeitado.
    const dep = form({ nomeDependente: "SEXTO", dtNascDepend: "", parentesco: "FI", cpfDependente: "", docDependente: "", sexoDependente: "" });
    expect(await incluirDependenteAction(CPF_TITULAR, null, dep)).toEqual({ ok: false, mensagens: ["LIMITE DE DEPENDENTES ATINGIDO"], erros: {} });
    // D12: região 99 avaliada normalmente.
    expect(await verificarElegibilidadeAction(null, form({ numCpf: CPF_FRANCISCO, codPrograma: "PP01" }))).toMatchObject({
      ok: true,
      resultado: { tipo: "avaliado", elegivel: false },
    });
    // D20: RG com espaço interno válido.
    expect(await validarDocumentosAction(null, form({ numCpf: "01234567890", rg: "12 345678", tituloEleitor: "", ctps: "" }))).toEqual({
      ok: true,
      resultado: "V",
      erros: [],
      docEspecial: false,
    });
  });

  it.each(["ALL,D4", "ALL,D99"])("%s é rejeitado → erro genérico, log com a variável", async (valor) => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", valor);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verificarElegibilidadeAction(null, form({ numCpf: CPF_MARIA, codPrograma: "PT01" }))).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
    expect(await validarDocumentosAction(null, form({ numCpf: "01234567890", rg: "123456789", tituloEleitor: "", ctps: "" }))).toEqual({
      ok: false,
      mensagem: ERRO_INESPERADO,
    });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[elegibilidade\] configuração LEGACY-QUIRK inválida — SIFAP_QUIRKS_CORRIGIDOS/));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[validacao-documentos\] configuração LEGACY-QUIRK inválida — SIFAP_QUIRKS_CORRIGIDOS/));
    log.mockRestore();
  });
});
