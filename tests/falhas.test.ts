import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ERRO_INESPERADO,
  falhaInesperada,
  falhaInesperadaMensagens,
  identificacaoErro,
  registrarFalha,
} from "@/lib/falhas";
import * as quirksConfig from "@/server/quirksConfig";
import { usuarioOperativo } from "@/server/usuario";

// H3 — módulo único de falhas inesperadas: mensagem genérica literal e log só com nome e
// código do erro (NFR-04, LGPD), nunca a mensagem nem os metadados (que trazem PII).

const CPF = "01234567890";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Erro como o do Prisma: a mensagem e o `meta` trazem os argumentos da consulta. */
function erroPrisma() {
  return Object.assign(new Error(`Unique constraint failed: numCpf = ${CPF}, nome = MARIA APARECIDA, renda = 1200`), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: { target: ["numCpf"], valor: CPF },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("falhas inesperadas", () => {
  it("mensagem genérica literal, sem reexportações (quirksConfig não a exporta)", () => {
    expect(ERRO_INESPERADO).toBe("Erro inesperado ao processar a solicitação. Tente novamente.");
    expect(Object.keys(quirksConfig)).not.toContain("ERRO_INESPERADO");
  });

  it("falhaInesperada: devolve a mensagem genérica e registra só [módulo] contexto, nome e código", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(falhaInesperada("beneficiarios", "inclusão", erroPrisma())).toEqual({ ok: false, mensagem: ERRO_INESPERADO });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("[beneficiarios] inclusão:", "PrismaClientKnownRequestError", "P2002");
    const log = JSON.stringify(spy.mock.calls);
    expect(log).not.toContain(CPF);
    expect(log).not.toContain("MARIA");
    expect(log).not.toContain("Unique constraint");
  });

  it("falhaInesperadaMensagens: mesma regra, formato com lista de mensagens", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(falhaInesperadaMensagens("programas", "grupo 1", erroPrisma())).toEqual({ ok: false, mensagens: [ERRO_INESPERADO] });
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CPF);
    expect(spy).toHaveBeenCalledWith("[programas] grupo 1:", "PrismaClientKnownRequestError", "P2002");
  });

  it.each([
    ["string com CPF", `falhou ${CPF}`],
    ["objeto com CPF", { numCpf: CPF, code: 42 }],
    ["null", null],
    ["undefined", undefined],
  ])("valor lançado não-Error (%s) → 'erro desconhecido', sem PII", (_n, valor) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarFalha("lote", "lote mensal", valor);
    expect(spy).toHaveBeenCalledWith("[lote] lote mensal:", "erro desconhecido", "");
    expect(JSON.stringify(spy.mock.calls)).not.toContain(CPF);
  });

  it("código não-string é omitido (poderia ser um objeto com dados)", () => {
    expect(identificacaoErro(Object.assign(new Error(CPF), { code: { cpf: CPF } }))).toEqual({ nome: "Error", codigo: "" });
  });

  it("usuarioOperativo: SIFAP_USER aparado e cortado em 8; ausente → erro", () => {
    vi.stubEnv("SIFAP_USER", "  OPERADOR123 ");
    expect(usuarioOperativo()).toBe("OPERADOR");
    vi.stubEnv("SIFAP_USER", "  ");
    expect(() => usuarioOperativo()).toThrow(/SIFAP_USER/);
  });
});

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (nome === "generated") return [];
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [p] : [];
  });
}

describe("sem cópias (fonte única em src/lib/falhas.ts e src/server/usuario.ts)", () => {
  const rel = (f: string) => path.relative(RAIZ, f).split(path.sep).join("/");
  const fontes = arquivos(path.join(RAIZ, "src"));
  const ler = (f: string) => readFileSync(f, "utf8");

  it("a mensagem genérica só é definida em src/lib/falhas.ts", () => {
    const achados = fontes.filter((f) => ler(f).includes('"Erro inesperado ao processar a solicitação. Tente novamente."')).map(rel);
    expect(achados).toEqual(["src/lib/falhas.ts"]);
  });

  it("falhaInesperada/registrarFalha só são definidas em src/lib/falhas.ts; usuarioOperativo só em src/server/usuario.ts", () => {
    const falhas = fontes.filter((f) => /function (falhaInesperada\w*|registrarFalha)\s*\(/.test(ler(f))).map(rel);
    expect(falhas).toEqual(["src/lib/falhas.ts"]);
    const usuario = fontes.filter((f) => /function usuarioOperativo\s*\(/.test(ler(f))).map(rel);
    expect(usuario).toEqual(["src/server/usuario.ts"]);
  });

  it("sem reexportações da mensagem genérica (imports apontam para o módulo único)", () => {
    const achados = fontes.filter((f) => /export\s*\{[^}]*\bERRO_INESPERADO\b[^}]*\}/.test(ler(f))).map(rel);
    expect(achados).toEqual([]);
  });

  it("nenhum console.* em src registra a mensagem do erro (.message), inclusive em chamadas de várias linhas", () => {
    const achados = fontes.filter((f) => [...ler(f).matchAll(/console\.(error|log|warn|info)\(([\s\S]*?)\);/g)].some((m) => /\.message\b/.test(m[2] ?? ""))).map(rel);
    expect(achados).toEqual([]);
  });

  it("src/lib/falhas.ts não lê process.env e nenhum componente cliente importa src/server/usuario", () => {
    expect(ler(path.join(RAIZ, "src/lib/falhas.ts"))).not.toContain("process.env");
    const clientes = fontes.filter((f) => /^\s*["']use client["']/m.test(ler(f)));
    expect(clientes.length).toBeGreaterThan(0);
    expect(clientes.filter((f) => ler(f).includes("@/server/usuario")).map(rel)).toEqual([]);
  });
});
