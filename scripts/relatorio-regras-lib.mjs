// Funciones puras del robot de reglas de negocio (scripts/relatorio-regras.mjs).
// Sin I/O: reciben texto/JSON ya leído y devuelven estructuras. Cubiertas por
// tests/relatorio-regras.test.ts.

/** Clave de regla RNC: `RK-` + 12 hex. */
export const PADRAO_CHAVE = /RK-[0-9a-f]{12}/g;

/** Modos de ejecución de Vitest que exige el estado `aprovada`. */
export const MODOS = /** @type {const} */ (["legado", "corrigido"]);

/** Claves RK distintas de un texto, en orden de aparición. */
export function extrairChaves(texto) {
  return [...new Set(String(texto ?? "").match(PADRAO_CHAVE) ?? [])];
}

/** Celdas de una fila de tabla Markdown `| a | b | c |` (recorta bordes y espacios). */
function celulas(linha) {
  const t = linha.trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return null;
  return t.slice(1, -1).split("|").map((c) => c.trim());
}

/** Quita las comillas invertidas de un extracto de código `…`. */
function semCrases(s) {
  return s.replace(/^`(.*)`$/s, "$1");
}

/**
 * Tabla de reglas del PRD (Anexo A): `| RK-… | PROG:línea | TIPO | FR | `pseudo` |`.
 * El extracto puede contener `|`: se unen las celdas sobrantes. Tipo `—` → null.
 */
export function parsePrdRegras(md) {
  const regras = [];
  for (const linha of md.split(/\r?\n/)) {
    if (!/^\|\s*RK-[0-9a-f]{12}\s*\|/.test(linha)) continue;
    const c = celulas(linha);
    if (!c || c.length < 5) continue;
    const [chave, fonte, tipo, fr, ...resto] = c;
    const m = /^([A-Z0-9]+):(\d+)$/.exec(fonte);
    if (!m) throw new Error(`fonte inválida para ${chave}: '${fonte}'`);
    regras.push({
      chave,
      fonte,
      programa: m[1],
      linha: Number(m[2]),
      tipo: tipo === "—" || tipo === "-" || tipo === "" ? null : tipo,
      fr,
      pseudocodigo: semCrases(resto.join(" | ")),
    });
  }
  const vistas = new Set();
  for (const r of regras) {
    if (vistas.has(r.chave)) throw new Error(`regra duplicada no PRD: ${r.chave}`);
    vistas.add(r.chave);
  }
  return regras;
}

/** Lista de FRs citados num texto (`FR-CAL-03, FR-CAL-05`). */
function frsDe(texto) {
  return [...new Set(texto.match(/FR-[A-Z]+-\d+/g) ?? [])];
}

/**
 * Tablas LEGACY-QUIRK del PRD: §5 (`| ID | Comportamiento | Decisión | FR |`) y
 * §5.1 (`| ID | Corregido |`). Devuelve una entrada por ID, en el orden de §5,
 * con `corrigido` = texto de §5.1 o null (no configurable).
 */
export function parseQuirks(md) {
  const linhas = md.split(/\r?\n/);
  const inicio5 = linhas.findIndex((l) => /^##\s+5\.\s/.test(l));
  if (inicio5 < 0) return [];
  const fim = linhas.findIndex((l, i) => i > inicio5 && /^##\s+\d+\.\s/.test(l) && !/^##\s+5\./.test(l));
  const secao = linhas.slice(inicio5, fim < 0 ? undefined : fim);

  const porId = new Map();
  let subsecao51 = false;
  for (const linha of secao) {
    if (/^###\s+5\.1\b/.test(linha)) subsecao51 = true;
    const c = celulas(linha);
    if (!c || !/^D\d+[a-z]?$/.test(c[0] ?? "")) continue;
    const id = c[0];
    if (!subsecao51 && c.length >= 4) {
      porId.set(id, { id, comportamentoLegado: c[1], decisao: c[2], frs: frsDe(c[3]), corrigido: null });
    } else if (subsecao51 && c.length >= 2) {
      const q = porId.get(id) ?? { id, comportamentoLegado: null, decisao: null, frs: [], corrigido: null };
      q.corrigido = c[1];
      porId.set(id, q);
    }
  }
  return [...porId.values()];
}

/** Normaliza el status de Vitest a passed/failed/skipped. */
function statusVitest(s) {
  if (s === "passed") return "passed";
  if (s === "failed") return "failed";
  return "skipped"; // skipped, pending, todo, disabled
}

/** Ruta relativa a la raíz del repo con separador `/`. */
export function relativo(arquivo, raiz) {
  const a = String(arquivo).replaceAll("\\", "/");
  const r = String(raiz ?? "").replaceAll("\\", "/").replace(/\/$/, "");
  return r && a.startsWith(r + "/") ? a.slice(r.length + 1) : a;
}

/**
 * Tests de un reporte JSON de Vitest (`--reporter=json`). Título completo =
 * describes ancestros + título, unidos por " > ". Un archivo que no cargó
 * (sin assertionResults y status failed) se devuelve como un test fallido
 * con `erroArquivo: true`.
 */
export function testesDeVitest(json, raiz = "") {
  const testes = [];
  for (const arq of json?.testResults ?? []) {
    const arquivo = relativo(arq.name, raiz);
    const resultados = arq.assertionResults ?? [];
    if (resultados.length === 0 && arq.status === "failed") {
      testes.push({ arquivo, titulo: "(falha ao carregar o arquivo)", status: "failed", duracaoMs: 0, erroArquivo: true, mensagem: arq.message ?? "" });
      continue;
    }
    for (const a of resultados) {
      const titulo = [...(a.ancestorTitles ?? []), a.title].join(" > ");
      testes.push({
        arquivo,
        titulo,
        status: statusVitest(a.status),
        duracaoMs: Math.round(a.duration ?? 0),
        mensagem: a.status === "failed" ? String((a.failureMessages ?? [])[0] ?? "").split("\n")[0].slice(0, 300) : undefined,
      });
    }
  }
  return testes;
}

/**
 * Tests de un reporte JSON de Playwright (`--reporter=json`), recorriendo las
 * suites anidadas. Estado por test: expected→passed, flaky→passed (flaky: true),
 * unexpected→failed, skipped→skipped.
 */
export function testesDePlaywright(json, raiz = "") {
  const testes = [];
  const visitar = (suite, ancestrais) => {
    const nome = suite.title && !/\.(spec|test)\.[cm]?[jt]sx?$/.test(suite.title) ? [...ancestrais, suite.title] : ancestrais;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const resultados = t.results ?? [];
        const status =
          t.status === "expected" || t.status === "flaky" ? "passed" : t.status === "skipped" ? "skipped" : "failed";
        testes.push({
          arquivo: relativo(spec.file ?? suite.file ?? "", raiz),
          titulo: [...nome, spec.title].join(" > "),
          projeto: t.projectName ?? null,
          status,
          flaky: t.status === "flaky",
          duracaoMs: resultados.reduce((s, r) => s + (r.duration ?? 0), 0),
        });
      }
    }
    for (const filha of suite.suites ?? []) visitar(filha, nome);
  };
  for (const s of json?.suites ?? []) visitar(s, []);
  return testes;
}

/** Resumen de una lista de tests: totales por status y duración. */
export function resumoTestes(testes) {
  const r = { total: testes.length, passed: 0, failed: 0, skipped: 0, flaky: 0, duracaoMs: 0 };
  for (const t of testes) {
    r[t.status] += 1;
    if (t.flaky) r.flaky += 1;
    r.duracaoMs += t.duracaoMs ?? 0;
  }
  return r;
}

/**
 * Busca cada clave en los archivos de implementación. `arquivos` = [{arquivo, conteudo}]
 * (ya filtrados: sin tests ni código generado). Devuelve Map chave → [{arquivo, linha}].
 */
export function escanearImplementacoes(arquivos, chaves) {
  const alvo = new Set(chaves);
  const mapa = new Map(chaves.map((k) => [k, []]));
  for (const { arquivo, conteudo } of arquivos) {
    const linhas = conteudo.split(/\r?\n/);
    linhas.forEach((texto, i) => {
      for (const k of extrairChaves(texto)) {
        if (alvo.has(k)) mapa.get(k).push({ arquivo, linha: i + 1 });
      }
    });
  }
  return mapa;
}

/** true si la ruta es un archivo de test (no cuenta como implementación). */
export function ehArquivoDeTeste(caminho) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(caminho);
}

/**
 * Asocia tests a reglas por clave en el título completo. `execucoes` =
 * { legado: testes[], corrigido: testes[] }. Devuelve Map chave → tests
 * agrupados por (arquivo, título) con el status de cada modo.
 */
export function mapearTestes(chaves, execucoes) {
  const alvo = new Set(chaves);
  const mapa = new Map(chaves.map((k) => [k, new Map()]));
  for (const [modo, testes] of Object.entries(execucoes)) {
    for (const t of testes) {
      for (const k of extrairChaves(t.titulo)) {
        if (!alvo.has(k)) continue;
        const id = `${t.arquivo}\u0000${t.titulo}`;
        const porTeste = mapa.get(k);
        const e = porTeste.get(id) ?? { arquivo: t.arquivo, titulo: t.titulo, status: {}, duracaoMs: {} };
        // Mismo título repetido en el archivo (it.each): cualquier fallo manda.
        const anterior = e.status[modo];
        e.status[modo] = anterior === "failed" || t.status === "failed" ? "failed" : anterior === "passed" || t.status === "passed" ? "passed" : t.status;
        e.duracaoMs[modo] = (e.duracaoMs[modo] ?? 0) + (t.duracaoMs ?? 0);
        porTeste.set(id, e);
      }
    }
  }
  return new Map([...mapa].map(([k, m]) => [k, [...m.values()]]));
}

/**
 * Estado de una regla a partir de sus tests (cada uno con status por modo):
 * - `falhou`: algún test titulado falló en algún modo;
 * - `aprovada`: ≥ 1 test titulado pasó en TODOS los modos (y ninguno falló);
 * - `sem-teste`: sin test titulado (o solo ignorados / sin ejecución en algún modo).
 */
export function statusRegra(testes, modos = MODOS) {
  if (testes.some((t) => Object.values(t.status).includes("failed"))) return "falhou";
  if (testes.some((t) => modos.every((m) => t.status[m] === "passed"))) return "aprovada";
  return "sem-teste";
}

function novoAgregado() {
  return { total: 0, aprovada: 0, falhou: 0, "sem-teste": 0 };
}

function agregar(regras, campo) {
  const out = {};
  for (const r of regras) {
    const k = r[campo];
    out[k] ??= novoAgregado();
    out[k].total += 1;
    out[k][r.status] += 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Arma el reporte completo.
 * @param {object} p
 * @param {Array} p.regras — de parsePrdRegras
 * @param {Array} p.quirks — de parseQuirks
 * @param {Record<string, Array>} p.execucoes — { legado, corrigido } de testesDeVitest
 * @param {Map} p.implementacoes — de escanearImplementacoes
 * @param {Array|null} p.e2e — de testesDePlaywright, o null si se omitió
 * @param {object} p.meta — metadatos de la corrida (fecha, sha, node…)
 */
export function montarRelatorio({ regras, quirks, execucoes, implementacoes, e2e, meta }) {
  const modos = Object.keys(execucoes);
  const chaves = regras.map((r) => r.chave);
  const testesPorChave = mapearTestes(chaves, execucoes);
  const quirksPorFr = new Map();
  for (const q of quirks) for (const fr of q.frs) quirksPorFr.set(fr, [...(quirksPorFr.get(fr) ?? []), q.id]);

  const saida = regras.map((r) => {
    const testes = testesPorChave.get(r.chave) ?? [];
    return {
      ...r,
      quirksDoFr: quirksPorFr.get(r.fr) ?? [],
      implementacao: implementacoes.get(r.chave) ?? [],
      testes,
      status: statusRegra(testes, modos),
    };
  });

  const totais = { regras: saida.length, ...novoAgregado() };
  delete totais.total;
  for (const r of saida) totais[r.status] += 1;
  totais.semImplementacao = saida.filter((r) => r.implementacao.length === 0).length;

  const vitest = Object.fromEntries(modos.map((m) => [m, resumoTestes(execucoes[m])]));
  const falhasVitest = Object.fromEntries(
    modos.map((m) => [m, execucoes[m].filter((t) => t.status === "failed").map((t) => ({ arquivo: t.arquivo, titulo: t.titulo, mensagem: t.mensagem }))]),
  );

  return {
    meta: { ...meta, modos },
    totais,
    vitest,
    falhasVitest,
    e2e: e2e
      ? { executado: true, ...resumoTestes(e2e), falhas: e2e.filter((t) => t.status === "failed").map((t) => ({ arquivo: t.arquivo, titulo: t.titulo })) }
      : { executado: false },
    porPrograma: agregar(saida, "programa"),
    porFr: agregar(saida, "fr"),
    quirks,
    regras: saida,
  };
}

/**
 * Código de salida: 0 solo si todas las reglas están `aprovada`, no hubo fallos
 * de Vitest en ningún modo y el e2e (si corrió) no falló.
 */
export function codigoSaida(rel) {
  if (rel.totais.falhou > 0 || rel.totais["sem-teste"] > 0) return 1;
  if (Object.values(rel.vitest).some((v) => v.failed > 0)) return 1;
  if (rel.e2e.executado && rel.e2e.failed > 0) return 1;
  return 0;
}

const ROTULO_STATUS = { aprovada: "aprobada", falhou: "**FALLÓ**", "sem-teste": "**SIN TEST**" };

function esc(s) {
  return String(s ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function seg(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Reporte legible en español (Markdown). */
export function gerarMarkdown(rel) {
  const { meta, totais } = rel;
  const l = [];
  l.push("# Informe de reglas de negocio — SIFAP", "");
  l.push(`- **Fecha:** ${meta.data}`);
  l.push(`- **Commit:** \`${meta.gitSha ?? "?"}\`${meta.gitSujo ? " (con cambios sin commitear)" : ""}`);
  l.push(`- **Node:** ${meta.node}`);
  l.push(`- **Modos Vitest:** ${meta.modos.map((m) => `${m} (\`SIFAP_QUIRKS_CORRIGIDOS="${meta.quirksPorModo?.[m] ?? ""}"\`)`).join(" · ")}`);
  l.push(`- **E2E (Playwright):** ${rel.e2e.executado ? "ejecutado" : "omitido (`--sem-e2e`)"}`);
  l.push("");
  l.push("## Resumen", "");
  const veredito = codigoSaida(rel) === 0 ? "**APROBADO**" : "**REPROBADO**";
  l.push(`${veredito} — ${totais.aprovada}/${totais.regras} reglas aprobadas, ${totais.falhou} fallidas, ${totais["sem-teste"]} sin test, ${totais.semImplementacao} sin comentario de implementación en \`src/\`.`, "");
  l.push("| Ejecución | Tests | Pasaron | Fallaron | Omitidos | Duración |", "|---|---:|---:|---:|---:|---:|");
  for (const [m, v] of Object.entries(rel.vitest)) l.push(`| Vitest ${m} | ${v.total} | ${v.passed} | ${v.failed} | ${v.skipped} | ${seg(v.duracaoMs)} |`);
  if (rel.e2e.executado) l.push(`| Playwright e2e | ${rel.e2e.total} | ${rel.e2e.passed} | ${rel.e2e.failed} | ${rel.e2e.skipped} | ${seg(rel.e2e.duracaoMs)} |`);
  l.push("");

  const falhas = Object.entries(rel.falhasVitest).flatMap(([m, fs]) => fs.map((f) => ({ ...f, modo: m })));
  if (falhas.length || (rel.e2e.executado && rel.e2e.falhas.length)) {
    l.push("## Fallos", "");
    for (const f of falhas) l.push(`- [${f.modo}] \`${f.arquivo}\` — ${esc(f.titulo)}${f.mensagem ? ` — ${esc(f.mensagem)}` : ""}`);
    for (const f of rel.e2e.falhas ?? []) l.push(`- [e2e] \`${f.arquivo}\` — ${esc(f.titulo)}`);
    l.push("");
  }

  l.push("## Por programa", "", "| Programa | Reglas | Aprobadas | Fallidas | Sin test |", "|---|---:|---:|---:|---:|");
  for (const [p, a] of Object.entries(rel.porPrograma)) l.push(`| ${p} | ${a.total} | ${a.aprovada} | ${a.falhou} | ${a["sem-teste"]} |`);
  l.push("");

  l.push("## Por requisito funcional", "", "| FR | Reglas | Aprobadas | Fallidas | Sin test |", "|---|---:|---:|---:|---:|");
  for (const [fr, a] of Object.entries(rel.porFr)) l.push(`| ${fr} | ${a.total} | ${a.aprovada} | ${a.falhou} | ${a["sem-teste"]} |`);
  l.push("");

  if (rel.quirks.length) {
    l.push("## Decisiones LEGACY-QUIRK", "", "| ID | FR | Decisión | Corregido (flag) |", "|---|---|---|---|");
    for (const q of rel.quirks) l.push(`| ${q.id} | ${q.frs.join(", ")} | ${esc(q.decisao)} | ${esc(q.corrigido ?? "no configurable")} |`);
    l.push("");
  }

  l.push("## Detalle por programa", "");
  const programas = Object.keys(rel.porPrograma);
  for (const p of programas) {
    l.push(`### ${p}`, "", "| Regla | Fuente | Tipo | FR | Estado | Tests | Implementación |", "|---|---|---|---|---|---:|---|");
    for (const r of rel.regras.filter((x) => x.programa === p).sort((a, b) => a.linha - b.linha)) {
      const impl = r.implementacao.map((i) => `${i.arquivo}:${i.linha}`).join("<br>") || "—";
      l.push(`| ${r.chave} | ${r.fonte} | ${r.tipo ?? "—"} | ${r.fr}${r.quirksDoFr.length ? ` (${r.quirksDoFr.join(",")})` : ""} | ${ROTULO_STATUS[r.status]} | ${r.testes.length} | ${impl} |`);
    }
    l.push("");
  }
  return l.join("\n");
}
