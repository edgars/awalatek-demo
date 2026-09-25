import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H2 (LGPD) — nenhuma URL da aplicação leva o CPF (nem no path nem na query).
// Guarda estática: percorre src/app, src/components e src/server e falha se aparecer uma
// rota dinâmica com CPF/NIS (`[cpf]`) ou um padrão de CPF/NIS em href/redirect/rotas/query.
// O NIS também é identificador pessoal e não pode ir para a URL.
// Os atalhos entre telas usam a chave opaca do beneficiário (`chavePublica`).

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTAS = ["src/app", "src/components", "src/server"];

function entradas(raiz: string): { arquivos: string[]; pastas: string[] } {
  const arquivos: string[] = [];
  const pastas: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const p = path.join(raiz, nome);
    if (statSync(p).isDirectory()) {
      pastas.push(p);
      const sub = entradas(p);
      arquivos.push(...sub.arquivos);
      pastas.push(...sub.pastas);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      arquivos.push(p);
    }
  }
  return { arquivos, pastas };
}

/** Segmento dinâmico cujo nome menciona CPF ou NIS: `[cpf]`, `[numCpf]`, `[...nis]`… */
const SEGMENTO_PII = /^\[{1,2}(\.\.\.)?[^\]]*(cpf|nis)[^\]]*\]{1,2}$/i;

/** Identificador com CPF/NIS (`cpf`, `numCpf`, `nis`, `cpfDependente`…). */
const ID = String.raw`\w*(?:cpf|nis)\w*`;

/** Padrões de CPF/NIS em URLs (código-fonte). */
const PADROES: readonly { nome: string; re: RegExp }[] = [
  // Template de URL (`/...${...cpf...}...`): href, redirect, revalidatePath, router.push…
  { nome: "CPF/NIS interpolado em URL", re: /`\/[^`]*\$\{[^}]*(cpf|nis)[^}]*\}[^`]*`/i },
  // Concatenação: "/beneficiarios/" + numCpf
  { nome: "CPF/NIS concatenado em URL", re: new RegExp(String.raw`["']\/[^"'\s]*["']\s*\+\s*[\w.]*(cpf|nis)`, "i") },
  // Parâmetro de query: ?cpf= / &numCpf= / ?nis=
  { nome: "CPF/NIS em query string", re: new RegExp(String.raw`[?&]${ID}=`, "i") },
  // Leitura do parâmetro: sp.cpf, searchParams.nis, params.numCpf
  { nome: "CPF/NIS lido da URL", re: new RegExp(String.raw`\b(sp|searchParams|params)\s*\.\s*${ID}\b`, "i") },
  // URLSearchParams / searchParams por nome: q.set("cpf", …), searchParams.get("nis")
  {
    nome: "CPF/NIS em URLSearchParams",
    re: new RegExp(String.raw`\.(set|append)\(\s*["']${ID}["']|searchParams\s*\.\s*(get|has)\(\s*["']${ID}["']`, "i"),
  },
  // Forma objeto: new URLSearchParams({ cpf }) / href={{ pathname, query: { nis: … } }}
  { nome: "CPF/NIS em URLSearchParams (objeto)", re: new RegExp(String.raw`new\s+URLSearchParams\(\s*\{[^}]*\b${ID}\s*[:,}]`, "i") },
  { nome: "CPF/NIS em query de href (objeto)", re: new RegExp(String.raw`query\s*:\s*\{[^}]*\b${ID}\s*[:,}]`, "i") },
  // Parâmetro de rota com CPF/NIS: params: Promise<{ cpf: string }>
  { nome: "CPF/NIS como parâmetro de rota", re: new RegExp(String.raw`params\s*:\s*Promise<\{\s*${ID}\s*:`, "i") },
  // CPF/NIS literal (11 dígitos) em href/redirect/push/replace
  { nome: "CPF/NIS literal em URL", re: /(href|redirect|push|replace|revalidatePath)\s*[=(]\s*\{?\s*["'`][^"'`]*\b\d{11}\b/ },
];

function achados(conteudo: string): string[] {
  return PADROES.filter((p) => p.re.test(conteudo)).map((p) => p.nome);
}

describe("H2 — LGPD: CPF fora das URLs", () => {
  const todas = PASTAS.map((p) => entradas(path.join(RAIZ, p)));
  const arquivos = todas.flatMap((e) => e.arquivos);
  const pastas = todas.flatMap((e) => e.pastas);

  it("a varredura encontra as telas (guarda não vazia)", () => {
    expect(arquivos.length).toBeGreaterThan(50);
    expect(pastas.some((p) => p.endsWith(path.join("beneficiarios", "[chave]")))).toBe(true);
  });

  it("nenhuma rota dinâmica com CPF (`[cpf]`)", () => {
    const ruins = pastas.filter((p) => SEGMENTO_PII.test(path.basename(p))).map((p) => path.relative(RAIZ, p));
    expect(ruins).toEqual([]);
  });

  it("nenhum padrão de CPF em href, redirect, rotas ou query string", () => {
    const ruins = arquivos
      .map((f) => ({ arquivo: path.relative(RAIZ, f), padroes: achados(readFileSync(f, "utf8")) }))
      .filter((a) => a.padroes.length > 0);
    expect(ruins).toEqual([]);
  });

  it("a guarda detecta os padrões antigos (autoteste)", () => {
    const antigos = [
      "<Link href={`/beneficiarios/${b.numCpf}/editar`}>",
      "revalidatePath(`/beneficiarios/${cpf}/dependentes`);",
      '<Link href={"/beneficiarios/" + b.numCpf}>',
      "<Link href={`/consulta?cpf=${b.numCpf}`}>",
      "const cpf = typeof sp.cpf === \"string\" ? sp.cpf : \"\";",
      'q.set("cpf", params.cpf);',
      'const cpf = searchParams.get("cpf");',
      "<Link href={`/consulta?nis=${f.nis}`}>",
      'const nis = searchParams.get("nis");',
      "const q = new URLSearchParams({ cpf: b.numCpf });",
      "const q = new URLSearchParams({ programa, numCpf });",
      "<Link href={{ pathname: '/consulta', query: { nis: f.nis } }}>",
      "type Props = { params: Promise<{ nis: string }> };",
      "type Props = { params: Promise<{ cpf: string }> };",
      'await page.goto("/beneficiarios/74185296355/editar"); redirect("/beneficiarios/74185296355/editar")',
    ];
    for (const s of antigos) expect(achados(s), s).not.toEqual([]);
    for (const nome of ["[cpf]", "[numCpf]", "[...cpf]", "[[...cpf]]", "[nis]"]) expect(SEGMENTO_PII.test(nome), nome).toBe(true);
    // A chave opaca não dispara a guarda.
    expect(achados("<Link href={`/beneficiarios/${b.chavePublica}/editar`}>")).toEqual([]);
    expect(achados("const q = new URLSearchParams({ benef: chave, competencia });")).toEqual([]);
    expect(achados('where: { numCpf: cpf }, select: { nis: true }')).toEqual([]);
    expect(SEGMENTO_PII.test("[chave]")).toBe(false);
  });
});
