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
  usuarioOperativo,
} from "@/lib/falhas";
import { ERRO_INESPERADO as ERRO_QUIRKS } from "@/server/quirksConfig";

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
  it("mensagem genérica literal, única (quirksConfig reexporta a mesma)", () => {
    expect(ERRO_INESPERADO).toBe("Erro inesperado ao processar a solicitação. Tente novamente.");
    expect(ERRO_QUIRKS).toBe(ERRO_INESPERADO);
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

describe("sem cópias (fonte única em src/lib/falhas.ts)", () => {
  const fontes = arquivos(path.join(RAIZ, "src")).filter((f) => !f.endsWith(path.join("lib", "falhas.ts")));

  it("nenhum outro módulo define a mensagem, falhaInesperada local ou usuarioOperativo", () => {
    const achados = fontes.filter((f) => {
      const s = readFileSync(f, "utf8");
      return (
        s.includes('"Erro inesperado ao processar a solicitação. Tente novamente."') ||
        /function usuarioOperativo\s*\(/.test(s) ||
        // Os `falha.ts` de pagamentos/relatórios só delegam ao módulo único.
        (/function falhaInesperada\s*\(/.test(s) && !s.includes("falhaInesperadaCompartilhada("))
      );
    });
    expect(achados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it("src/app não registra a mensagem do erro (e.message) no log", () => {
    const achados = fontes.filter((f) => f.includes(`${path.sep}app${path.sep}`) && /console\.(error|log|warn)\([^)]*\.message/.test(readFileSync(f, "utf8")));
    expect(achados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });
});
