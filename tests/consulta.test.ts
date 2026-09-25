import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { consultarBeneficiarioAction } from "@/app/consulta/actions";
import { ERRO_INESPERADO } from "@/app/consulta/executar";
import ConsultaPage from "@/app/consulta/page";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/server/db";
import { consultarBeneficiario } from "@/server/consulta";
import { QUIRKS_PADRAO } from "@/domain/quirks";
import { BENEFICIARIOS_SEED, cpfComDv, seed } from "../prisma/seed";

// Story 2.6 — consulta CONSBENF contra uma base SQLite temporária.
// O seed não tem pagamentos: são criados aqui diretamente com Prisma.

let dir: string;
let prisma: PrismaClient;
const CPF_MARIA = cpfComDv(BENEFICIARIOS_SEED[0].base); // 01234567890 (zero à esquerda, D7)
const CPF_JOSE = cpfComDv(BENEFICIARIOS_SEED[1].base); // 12345678062
const CPF_ANA = cpfComDv(BENEFICIARIOS_SEED[2].base);
const globalPrisma = globalThis as unknown as { prisma?: PrismaClient };

async function criarPagamento(numPagamento: number, numCpf: string, anoMesRef: number) {
  await prisma.pagamento.create({
    data: {
      numPagamento,
      numCpf,
      codPrograma: "PP01",
      anoMesRef,
      vlrBruto: 60000 + numPagamento,
      vlrLiquido: 55000 + numPagamento,
      sitPagamento: "G",
      tipoPgto: "N",
      dtGeracao: 20260101,
      hrGeracao: 120000,
    },
  });
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "sifap-consbenf-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  prisma = createPrismaClient(url);
  delete globalPrisma.prisma;
  process.env.DATABASE_URL = url;
  await seed(prisma);
  // JOSE: 14 pagamentos inseridos (numPagamento 1..14) com competências decrescentes,
  // para distinguir "primeiros 12 por inserção" de "últimos 12 por competência".
  for (let n = 1; n <= 14; n++) await criarPagamento(n, CPF_JOSE, 202700 - n);
  // Um pagamento de outro CPF no meio da sequência.
  await criarPagamento(15, CPF_ANA, 202601);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await globalPrisma.prisma?.$disconnect();
  delete globalPrisma.prisma;
  rmSync(dir, { recursive: true, force: true });
});

// Configuração explícita: os testes existentes rodam em modo legado mesmo com
// SIFAP_QUIRKS_CORRIGIDOS=ALL no ambiente; os de correção a sobrescrevem.
beforeEach(() => {
  vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("consultarBeneficiario (CONSBENF)", () => {
  it("por CPF: ficha completa com CPF mascarado (D7) e status com descrição", async () => {
    const r = await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ficha).toMatchObject({
      cpfMascarado: "012.***.***-**",
      nomeCompleto: "MARIA APARECIDA DA SILVA",
      dtNascimento: 19850412,
      sexo: "F",
      municipio: "SAO PAULO",
      uf: "SP",
      sitBeneficiario: "A",
      statusDescricao: "ATIVO",
      codPrograma: "PA01",
      vlrRendaFamiliar: 120000,
      numDependentes: 1,
      codRegiao: 1,
      nis: "10000000001",
      dtCadastro: 20250101,
    });
    expect(JSON.stringify(r)).not.toContain(CPF_MARIA);
  });

  it("tipo vazio → busca por CPF", async () => {
    const r = await consultarBeneficiario({ tipo: "", valor: CPF_MARIA }, prisma);
    expect(r.ok && r.ficha.nomeCompleto).toBe("MARIA APARECIDA DA SILVA");
  });

  it("por NIS → mesma ficha", async () => {
    const porNis = await consultarBeneficiario({ tipo: "N", valor: "10000000001" }, prisma);
    const porCpf = await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma);
    expect(porNis).toEqual(porCpf);
  });

  it("tipo inválido → TIPO BUSCA INVALIDO", async () => {
    expect(await consultarBeneficiario({ tipo: "X", valor: CPF_MARIA }, prisma)).toEqual({ ok: false, mensagem: "TIPO BUSCA INVALIDO" });
  });

  it("inexistente (CPF, NIS e NIS vazio) → BENEFICIARIO NAO ENCONTRADO", async () => {
    const nao = { ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" };
    expect(await consultarBeneficiario({ tipo: "C", valor: "52998224725" }, prisma)).toEqual(nao);
    expect(await consultarBeneficiario({ tipo: "N", valor: "99999999999" }, prisma)).toEqual(nao);
    expect(await consultarBeneficiario({ tipo: "N", valor: "" }, prisma)).toEqual(nao);
    expect(await consultarBeneficiario({ tipo: "C", valor: "123456789012" }, prisma)).toEqual(nao);
  });

  it("CPF sem zero à esquerda → ***.***.XXX-XX; status S → SUSPENSO", async () => {
    const r = await consultarBeneficiario({ tipo: "C", valor: CPF_JOSE }, prisma);
    expect(r.ok && r.ficha.cpfMascarado).toBe(`***.***.${CPF_JOSE.slice(6, 9)}-${CPF_JOSE.slice(9)}`);
    expect(r.ok && r.ficha.statusDescricao).toBe("SUSPENSO");
  });

  it("sem pagamentos → NENHUM PAGAMENTO ENCONTRADO", async () => {
    const r = await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma);
    expect(r.ok && r.historico).toEqual({ linhas: [], mensagem: "NENHUM PAGAMENTO ENCONTRADO" });
  });

  it("LEGACY-QUIRK(D21): 14 pagamentos → os 12 de menor numPagamento, só do CPF", async () => {
    const r = await consultarBeneficiario({ tipo: "C", valor: CPF_JOSE }, prisma);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.historico.mensagem).toBeNull();
    expect(r.historico.linhas).toHaveLength(12);
    expect(r.historico.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 60001 + i));
    expect(r.historico.linhas[0]).toEqual({ anoMesRef: 202699, vlrBruto: 60001, vlrLiquido: 55001, sitPagamento: "G", tipoPgto: "N" });
    const ana = await consultarBeneficiario({ tipo: "C", valor: CPF_ANA }, prisma);
    expect(ana.ok && ana.historico.linhas.map((l) => l.vlrBruto)).toEqual([60015]);
  });

  it("status desconhecido → DESCONHECIDO", async () => {
    await prisma.beneficiario.update({ where: { numCpf: CPF_ANA }, data: { sitBeneficiario: "X" } });
    try {
      const r = await consultarBeneficiario({ tipo: "N", valor: "10000000003" }, prisma);
      expect(r.ok && r.ficha.statusDescricao).toBe("DESCONHECIDO");
    } finally {
      await prisma.beneficiario.update({ where: { numCpf: CPF_ANA }, data: { sitBeneficiario: "C" } });
    }
  });
});

describe("consultarBeneficiarioAction", () => {
  it("consulta pela Server Action sem gravar nem auditar", async () => {
    const antes = { aud: await prisma.auditoria.count(), pg: await prisma.pagamento.count() };
    const r = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
    expect(r?.ok && r.ficha.cpfMascarado).toBe("012.***.***-**");
    expect(await consultarBeneficiarioAction(null, form({ tipo: "Z", valor: "1" }))).toEqual({ ok: false, mensagem: "TIPO BUSCA INVALIDO" });
    expect({ aud: await prisma.auditoria.count(), pg: await prisma.pagamento.count() }).toEqual(antes);
  });

  it("entrada longa é truncada/normalizada (A1, N11) e só aparecem mensagens do legado", async () => {
    expect(await consultarBeneficiarioAction(null, form({ tipo: "Z".repeat(50), valor: CPF_MARIA }))).toEqual({
      ok: false,
      mensagem: "TIPO BUSCA INVALIDO",
    });
    expect(await consultarBeneficiarioAction(null, form({ tipo: "C", valor: "9".repeat(50) }))).toEqual({
      ok: false,
      mensagem: "BENEFICIARIO NAO ENCONTRADO",
    });
    // 11 dígitos de um CPF real seguidos de mais dígitos: não é truncado para o CPF real.
    expect(await consultarBeneficiarioAction(null, form({ tipo: "C", valor: `${CPF_MARIA}99` }))).toEqual({
      ok: false,
      mensagem: "BENEFICIARIO NAO ENCONTRADO",
    });
    const nCom = await consultarBeneficiarioAction(null, form({ tipo: "NIS", valor: "10000000001" }));
    expect(nCom?.ok && nCom.ficha.nomeCompleto).toBe("MARIA APARECIDA DA SILVA");
  });

  it("falha inesperada da base → mensagem genérica, sem CPF no log", async () => {
    await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA })); // garante o singleton
    const cliente = globalPrisma.prisma!;
    const busca = vi.spyOn(cliente.beneficiario, "findUnique").mockRejectedValue(new Error(`falha ao ler CPF ${CPF_MARIA}`));
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }))).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
      expect(busca).toHaveBeenCalled();
      expect(erroLog).toHaveBeenCalled();
      expect(JSON.stringify(erroLog.mock.calls)).not.toContain(CPF_MARIA);
    } finally {
      busca.mockRestore();
      erroLog.mockRestore();
    }
  });
});

describe("página /consulta?benef= (H2: chave opaca, nunca o CPF)", () => {
  async function inicialDaPagina(sp: Record<string, string>) {
    const el = await ConsultaPage({ searchParams: Promise.resolve(sp) });
    const filhos = (el.props as { children: unknown[] }).children;
    const form = filhos.find((c) => (c as { props?: { inicial?: unknown } } | null)?.props?.inicial !== undefined) as {
      props: { inicial: unknown; cpfInicial: string };
    };
    return form.props;
  }
  const chaveDe = async (cpf: string) =>
    (await prisma.beneficiario.findUniqueOrThrow({ where: { numCpf: cpf }, select: { chavePublica: true } })).chavePublica;

  it("chave da lista → consulta direto", async () => {
    const p = await inicialDaPagina({ benef: await chaveDe(CPF_MARIA) });
    expect((p.inicial as { ok: boolean }).ok).toBe(true);
    expect(p.cpfInicial).toBe(CPF_MARIA);
  });

  it("chave malformada, inexistente ou um CPF no lugar da chave → BENEFICIARIO NAO ENCONTRADO", async () => {
    for (const benef of [`${CPF_MARIA}7`, CPF_MARIA, "00000000-0000-4000-8000-000000000000"]) {
      const p = await inicialDaPagina({ benef });
      expect(p.inicial, benef).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
      expect(p.cpfInicial).toBe("");
    }
  });

  it("o parâmetro antigo ?cpf= é ignorado (o CPF não é lido da URL)", async () => {
    const p = await inicialDaPagina({ cpf: CPF_MARIA });
    expect(p.inicial).toBeNull();
    expect(p.cpfInicial).toBe("");
  });
});

describe("correções configuráveis (SIFAP_QUIRKS_CORRIGIDOS)", () => {
  it("CORRECAO(D7): a Server Action lê a configuração → máscara ***.***.XXX-XX também com zero à esquerda", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D7");
    const r = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
    expect(r?.ok && r.ficha.cpfMascarado).toBe(`***.***.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`);
    expect(JSON.stringify(r)).not.toContain(CPF_MARIA);
    // Só D7: o histórico continua legado.
    const jose = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_JOSE }));
    expect(jose?.ok && jose.historico.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 60001 + i));
  });

  it("ALL não inclui D7: a máscara continua legada; ALL,D7 corrige", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL");
    const legado = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
    expect(legado?.ok && legado.ficha.cpfMascarado).toBe("012.***.***-**");
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL,D7");
    const corrigido = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
    expect(corrigido?.ok && corrigido.ficha.cpfMascarado).toBe(`***.***.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`);
  });

  it("CORRECAO(D21): os 12 de competência mais recente, do mais recente ao mais antigo; antigo inserido depois não entra", async () => {
    // JOSE: numPagamento 1..14 com competências 202699..202686; o 16 é inserido depois com competência antiga.
    await criarPagamento(16, CPF_JOSE, 201001);
    try {
      vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D21");
      const r = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_JOSE }));
      expect(r?.ok).toBe(true);
      if (!r?.ok) return;
      expect(r.historico.maisRecentesPrimeiro).toBe(true);
      expect(r.historico.linhas.map((l) => l.anoMesRef)).toEqual(Array.from({ length: 12 }, (_, i) => 202699 - i));
      expect(r.historico.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 60001 + i));
      const ana = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_ANA }));
      expect(ana?.ok && ana.historico.linhas.map((l) => l.vlrBruto)).toEqual([60015]);
      // Só D21: a máscara continua legada; sem pagamentos → mensagem legada.
      const maria = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
      expect(maria?.ok && maria.ficha.cpfMascarado).toBe("012.***.***-**");
      expect(maria?.ok && maria.historico).toEqual({ linhas: [], mensagem: "NENHUM PAGAMENTO ENCONTRADO", maisRecentesPrimeiro: true });
      // Legado (mesma base): os 12 primeiros por inserção, o antigo tardio também fora.
      vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "");
      const legado = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_JOSE }));
      expect(legado?.ok && legado.historico.linhas.map((l) => l.vlrBruto)).toEqual(Array.from({ length: 12 }, (_, i) => 60001 + i));
    } finally {
      await prisma.pagamento.delete({ where: { numPagamento: 16 } });
    }
  });

  it("CORRECAO(D21) com poucos pagamentos: o de competência antiga inserido depois vem por último", async () => {
    await criarPagamento(17, CPF_MARIA, 202605);
    await criarPagamento(18, CPF_MARIA, 202001);
    await criarPagamento(19, CPF_MARIA, 202606);
    try {
      vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "D21");
      const r = await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }));
      expect(r?.ok && r.historico.linhas.map((l) => l.anoMesRef)).toEqual([202606, 202605, 202001]);
    } finally {
      await prisma.pagamento.deleteMany({ where: { numPagamento: { in: [17, 18, 19] } } });
    }
  });

  it("servidor sem configuração → legado (não lê o ambiente); configuração explícita é respeitada", async () => {
    vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "ALL,D7");
    const padrao = await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma);
    expect(padrao.ok && padrao.ficha.cpfMascarado).toBe("012.***.***-**");
    const explicito = await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma, { corrigidos: new Set(["D7"]) });
    expect(explicito.ok && explicito.ficha.cpfMascarado).toBe(`***.***.${CPF_MARIA.slice(6, 9)}-${CPF_MARIA.slice(9)}`);
    expect((await consultarBeneficiario({ tipo: "C", valor: CPF_MARIA }, prisma, QUIRKS_PADRAO)).ok).toBe(true);
  });

  it.each([
    ["SIFAP_QUIRKS_CORRIGIDOS", "D99"],
    ["LEGACY_DOC_ESPECIAL_ENABLED", "talvez"],
  ])("configuração inválida (%s) → mensagem genérica; o log nomeia a variável e não tem CPF", async (variavel, valor) => {
    vi.stubEnv(variavel, valor);
    const erroLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await consultarBeneficiarioAction(null, form({ tipo: "C", valor: CPF_MARIA }))).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
      expect(erroLog).toHaveBeenCalledWith(expect.stringContaining("configuração LEGACY-QUIRK inválida"));
      expect(JSON.stringify(erroLog.mock.calls)).toContain(variavel);
      expect(JSON.stringify(erroLog.mock.calls)).not.toContain(CPF_MARIA);
    } finally {
      erroLog.mockRestore();
    }
  });
});
