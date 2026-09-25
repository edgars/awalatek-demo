#!/usr/bin/env node
// Robot de reglas de negocio (npm run test:regras).
//
// 1. Ejecuta Vitest (reporter JSON) dos veces: modo legado (SIFAP_QUIRKS_CORRIGIDOS="")
//    y modo corregido (SIFAP_QUIRKS_CORRIGIDOS="ALL,D7").
// 2. Ejecuta Playwright (reporter JSON) en el puerto E2E_PORT (default 3250), salvo `--sem-e2e`.
// 3. Lee la tabla de reglas (Anexo A) y las tablas LEGACY-QUIRK (§5/§5.1) de docs/prd.md.
// 4. Busca el comentario `RK-…` de cada regla en src/ (sin tests) → archivo:línea.
// 5. Asocia tests a reglas por la clave en el título y calcula el estado de cada regla.
// 6. Escribe reports/regras/relatorio.json y reports/regras/relatorio.md.
// Sale con código ≠ 0 si alguna regla quedó `falhou` o `sem-teste` (o si algo falló).
//
// Opciones: --sem-e2e (omite Playwright) · --saida <dir> (default reports/regras).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  codigoSaida,
  ehArquivoDeTeste,
  escanearImplementacoes,
  gerarMarkdown,
  montarRelatorio,
  parsePrdRegras,
  parseQuirks,
  testesDePlaywright,
  testesDeVitest,
} from "./relatorio-regras-lib.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const semE2e = args.includes("--sem-e2e");
const iSaida = args.indexOf("--saida");
const SAIDA = path.resolve(RAIZ, iSaida >= 0 ? args[iSaida + 1] : "reports/regras");
const BRUTOS = path.join(SAIDA, "brutos");
const E2E_PORT = process.env.E2E_PORT || "3250";
const QUIRKS_POR_MODO = { legado: "", corrigido: "ALL,D7" };

function log(msg) {
  process.stderr.write(`[test:regras] ${msg}\n`);
}

function git(...a) {
  try {
    return execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function lerJson(arquivo, descricao) {
  if (!existsSync(arquivo)) throw new Error(`${descricao}: o reporte JSON não foi gerado (${path.relative(RAIZ, arquivo)})`);
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

/** Ejecuta un comando heredando la salida; devuelve { codigo, duracaoMs }. */
function executar(cmd, cmdArgs, env) {
  const t0 = Date.now();
  const r = spawnSync(cmd, cmdArgs, { cwd: RAIZ, env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
  if (r.error) throw r.error;
  return { codigo: r.status ?? 1, duracaoMs: Date.now() - t0 };
}

function rodarVitest(modo) {
  const saida = path.join(BRUTOS, `vitest-${modo}.json`);
  rmSync(saida, { force: true });
  log(`Vitest — modo ${modo} (SIFAP_QUIRKS_CORRIGIDOS="${QUIRKS_POR_MODO[modo]}")`);
  const r = executar("npx", ["vitest", "run", "--reporter=dot", "--reporter=json", `--outputFile.json=${saida}`], {
    SIFAP_QUIRKS_CORRIGIDOS: QUIRKS_POR_MODO[modo],
  });
  return { ...r, json: lerJson(saida, `Vitest (${modo})`) };
}

function rodarPlaywright() {
  const saida = path.join(BRUTOS, "playwright.json");
  rmSync(saida, { force: true });
  log(`Playwright — porta ${E2E_PORT}`);
  const r = executar("npx", ["playwright", "test", "--reporter=json"], {
    E2E_PORT,
    PLAYWRIGHT_JSON_OUTPUT_NAME: saida,
  });
  return { ...r, json: lerJson(saida, "Playwright") };
}

/** Archivos de implementación de src/ (sin tests ni código generado). */
function arquivosDeImplementacao() {
  const out = [];
  const visitar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(RAIZ, p).replaceAll("\\", "/");
      if (e.isDirectory()) {
        if (rel === "src/generated") continue;
        visitar(p);
      } else if (/\.[cm]?[jt]sx?$/.test(e.name) && !ehArquivoDeTeste(e.name)) {
        out.push({ arquivo: rel, conteudo: readFileSync(p, "utf8") });
      }
    }
  };
  visitar(path.join(RAIZ, "src"));
  return out;
}

function main() {
  const inicio = new Date();
  mkdirSync(BRUTOS, { recursive: true });

  const prd = readFileSync(path.join(RAIZ, "docs/prd.md"), "utf8");
  const regras = parsePrdRegras(prd);
  const quirks = parseQuirks(prd);
  log(`${regras.length} regras e ${quirks.length} quirks no PRD`);

  const vitestLegado = rodarVitest("legado");
  const vitestCorrigido = rodarVitest("corrigido");
  const playwright = semE2e ? null : rodarPlaywright();

  const implementacoes = escanearImplementacoes(arquivosDeImplementacao(), regras.map((r) => r.chave));

  const rel = montarRelatorio({
    regras,
    quirks,
    execucoes: { legado: testesDeVitest(vitestLegado.json, RAIZ), corrigido: testesDeVitest(vitestCorrigido.json, RAIZ) },
    implementacoes,
    e2e: playwright ? testesDePlaywright(playwright.json, RAIZ) : null,
    meta: {
      data: inicio.toISOString(),
      duracaoMs: Date.now() - inicio.getTime(),
      gitSha: git("rev-parse", "HEAD"),
      gitBranch: git("rev-parse", "--abbrev-ref", "HEAD"),
      gitSujo: (git("status", "--porcelain") ?? "") !== "",
      node: process.version,
      plataforma: `${process.platform}-${process.arch}`,
      quirksPorModo: QUIRKS_POR_MODO,
      e2ePort: semE2e ? null : Number(E2E_PORT),
      codigosDeSaida: {
        vitestLegado: vitestLegado.codigo,
        vitestCorrigido: vitestCorrigido.codigo,
        playwright: playwright?.codigo ?? null,
      },
      fonteRegras: "docs/prd.md",
    },
  });
  // Un proceso que terminó con error sin tests fallidos (p. ej. error de config) también cuenta.
  const falhaDeProcesso = vitestLegado.codigo !== 0 || vitestCorrigido.codigo !== 0 || (playwright && playwright.codigo !== 0);

  writeFileSync(path.join(SAIDA, "relatorio.json"), JSON.stringify(rel, null, 2) + "\n");
  writeFileSync(path.join(SAIDA, "relatorio.md"), gerarMarkdown(rel) + "\n");

  const t = rel.totais;
  log(`regras: ${t.aprovada}/${t.regras} aprovadas · ${t.falhou} falharam · ${t["sem-teste"]} sem teste · ${t.semImplementacao} sem implementação`);
  log(`relatório: ${path.relative(RAIZ, path.join(SAIDA, "relatorio.json"))} · ${path.relative(RAIZ, path.join(SAIDA, "relatorio.md"))}`);
  const codigo = codigoSaida(rel) || (falhaDeProcesso ? 1 : 0);
  if (codigo !== 0) log("FALHOU");
  process.exit(codigo);
}

try {
  main();
} catch (e) {
  log(`erro: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
