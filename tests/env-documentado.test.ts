import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Story 8.1: toda variable de entorno que el código lee debe estar documentada en
// `.env.example`. Se escanean `process.env.X`, `process.env["X"]`, `env.X` (objetos
// de entorno inyectados, p. ej. `lerQuirks(env)`), `const { X } = process.env`, y las
// interpolaciones `${X}` de docker-compose.yml / `$X` de docker-entrypoint.sh.

const RAIZ = path.resolve(import.meta.dirname, "..");
const DIRETORIOS = ["src", "scripts", "prisma"];
const ARQUIVOS_RAIZ = ["prisma.config.ts", "next.config.ts", "playwright.config.ts"];
const IGNORAR_DIRS = new Set([path.join("src", "generated"), "node_modules", "migrations"]);
const EXTENSOES = /\.(ts|tsx|mts|js|mjs|cjs)$/;
const ARQUIVOS_SHELL = ["docker-compose.yml", "docker-entrypoint.sh"];

/** Variables internas del runtime/herramientas: no se documentan en `.env.example`. */
const EXCLUIDAS = new Set(["NODE_ENV", "E2E_PORT", "CI"]);
const ehExcluida = (nome: string) => EXCLUIDAS.has(nome) || nome.startsWith("NEXT_");

function listarFontes(rel: string): string[] {
  const abs = path.join(RAIZ, rel);
  if (IGNORAR_DIRS.has(rel) || IGNORAR_DIRS.has(path.basename(rel))) return [];
  if (statSync(abs).isDirectory()) {
    return readdirSync(abs).flatMap((f) => listarFontes(path.join(rel, f)));
  }
  return EXTENSOES.test(rel) ? [rel] : [];
}

function variaveisLidas(codigo: string): string[] {
  const nomes = new Set<string>();
  const padroes = [/\benv\??\.([A-Z][A-Z0-9_]*)\b/g, /\benv\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g];
  for (const re of padroes) for (const m of codigo.matchAll(re)) nomes.add(m[1]!);
  // Desestructuración: `const { A, B: b, C = "x" } = process.env`.
  for (const m of codigo.matchAll(/\{([^{}]*)\}\s*=\s*process\.env\b/g)) {
    for (const parte of m[1]!.split(",")) {
      const nome = /^\s*([A-Z][A-Z0-9_]*)\b/.exec(parte)?.[1];
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes];
}

/** `${X}`, `${X:-padrão}` y `$X` en docker-compose.yml y scripts de shell. */
function variaveisShell(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\$\{?([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]!))];
}

function variaveisDocumentadas(): Set<string> {
  const texto = readFileSync(path.join(RAIZ, ".env.example"), "utf8");
  return new Set([...texto.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]!));
}

describe(".env.example documenta todas as variáveis lidas pelo código", () => {
  const fontes = [...DIRETORIOS.flatMap(listarFontes), ...ARQUIVOS_RAIZ];
  const lidas = new Map<string, string[]>();
  for (const arquivo of fontes) {
    for (const nome of variaveisLidas(readFileSync(path.join(RAIZ, arquivo), "utf8"))) {
      lidas.set(nome, [...(lidas.get(nome) ?? []), arquivo]);
    }
  }
  for (const arquivo of ARQUIVOS_SHELL) {
    for (const nome of variaveisShell(readFileSync(path.join(RAIZ, arquivo), "utf8"))) {
      lidas.set(nome, [...(lidas.get(nome) ?? []), arquivo]);
    }
  }

  it("o scanner encontra as variáveis conhecidas (sanidade do regex)", () => {
    for (const nome of ["DATABASE_URL", "SIFAP_USER", "LEGACY_DOC_ESPECIAL_ENABLED", "TZ", "SIFAP_PORT", "SKIP_MIGRATIONS"]) {
      expect(lidas.has(nome), nome).toBe(true);
    }
  });

  it("nenhuma variável lida fica sem entrada em .env.example", () => {
    const documentadas = variaveisDocumentadas();
    const faltantes = [...lidas.entries()]
      .filter(([nome]) => !ehExcluida(nome) && !documentadas.has(nome))
      .map(([nome, arquivos]) => `${nome} (${arquivos.join(", ")})`);
    expect(faltantes).toEqual([]);
  });

  it("detecta process.env.X, process.env['X'] e env.X; ignora minúsculas", () => {
    const codigo = `process.env.FOO_BAR; process.env["BAZ"]; env?.QUX; env.lower; process.env.NODE_ENV`;
    expect(variaveisLidas(codigo).sort()).toEqual(["BAZ", "FOO_BAR", "NODE_ENV", "QUX"]);
    expect(ehExcluida("NODE_ENV")).toBe(true);
    expect(ehExcluida("NEXT_RUNTIME")).toBe(true);
    expect(ehExcluida("FOO_BAR")).toBe(false);
  });

  it("detecta desestruturação de process.env e interpolações de shell/compose", () => {
    const codigo = `const { ALFA, BETA: beta, GAMA = "x", minuscula } = process.env;`;
    expect(variaveisLidas(codigo).sort()).toEqual(["ALFA", "BETA", "GAMA"]);
    expect(variaveisShell(`- "\${PORTA:-3000}:3000"\n[ "$PULAR" = 1 ] && echo "$@" $1`).sort()).toEqual([
      "PORTA",
      "PULAR",
    ]);
  });
});
