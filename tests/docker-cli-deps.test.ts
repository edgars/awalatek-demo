import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// Story 8.1: el runner de la imagen conserva solo las dependencias de
// docker/cli-deps.json (además del node_modules trazado del standalone). Todo paquete
// externo de los bundles del lote y del seed (`npm run build:scripts`) debe estar ahí,
// o `docker compose run --rm app npm run lote:pagamentos` fallaría al resolverlo.

const RAIZ = path.resolve(import.meta.dirname, "..");
const ENTRADAS = ["scripts/lote-pagamentos.ts", "prisma/seed.ts"];

const lerJson = (rel: string) => JSON.parse(readFileSync(path.join(RAIZ, rel), "utf8"));
const cliDeps: string[] = lerJson("docker/cli-deps.json").dependencies;

/** `@scope/nome/sub/path` → `@scope/nome`; `nome/sub` → `nome`. */
function raizPacote(especificador: string): string {
  const partes = especificador.split("/");
  return especificador.startsWith("@") ? partes.slice(0, 2).join("/") : partes[0]!;
}

async function externosDosBundles(): Promise<string[]> {
  // Mismas opciones que `build:scripts` (package.json), sin escribir archivos.
  const r = await build({
    absWorkingDir: RAIZ,
    entryPoints: ENTRADAS,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    packages: "external",
    outdir: "dist",
    outExtension: { ".js": ".mjs" },
    metafile: true,
    write: false,
    logLevel: "silent",
  });
  const externos = new Set<string>();
  for (const saida of Object.values(r.metafile.outputs)) {
    for (const imp of saida.imports) {
      if (imp.external && !imp.path.startsWith("node:")) externos.add(raizPacote(imp.path));
    }
  }
  return [...externos].sort();
}

describe("docker/cli-deps.json cobre os externos dos bundles do lote e do seed", () => {
  it("todo pacote externo está na lista de cli-deps", async () => {
    const externos = await externosDosBundles();
    expect(externos.length).toBeGreaterThan(0);
    expect(externos.filter((p) => !cliDeps.includes(p))).toEqual([]);
  });

  it("toda entrada da lista existe em dependencies (o Dockerfile falha se não)", () => {
    const deps = Object.keys(lerJson("package.json").dependencies);
    expect(cliDeps.filter((p) => !deps.includes(p))).toEqual([]);
    expect(cliDeps).toContain("prisma");
  });

  it("raizPacote normaliza escopo e subpaths", () => {
    expect(raizPacote("@prisma/client/runtime/client")).toBe("@prisma/client");
    expect(raizPacote("dotenv/config")).toBe("dotenv");
    expect(raizPacote("decimal.js")).toBe("decimal.js");
  });
});
