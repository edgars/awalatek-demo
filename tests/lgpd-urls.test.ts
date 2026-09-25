import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H2 (LGPD) — nenhuma URL da aplicação leva o CPF (nem no path nem na query).
// Guarda estática: percorre src/app e src/components e falha se aparecer uma rota
// dinâmica com CPF (`[cpf]`) ou um padrão de CPF em href/redirect/rotas/query.
// Os atalhos entre telas usam a chave opaca do beneficiário (`chavePublica`).

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTAS = ["src/app", "src/components"];

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

/** Segmento dinâmico cujo nome menciona CPF: `[cpf]`, `[numCpf]`, `[...cpf]`… */
const SEGMENTO_CPF = /^\[{1,2}(\.\.\.)?[^\]]*cpf[^\]]*\]{1,2}$/i;

/** Padrões de CPF em URLs (código-fonte). */
const PADROES: readonly { nome: string; re: RegExp }[] = [
  // Template de URL (`/...${...cpf...}...`): href, redirect, revalidatePath, router.push…
  { nome: "CPF interpolado em URL", re: /`\/[^`]*\$\{[^}]*cpf[^}]*\}[^`]*`/i },
  // Concatenação: "/beneficiarios/" + numCpf
  { nome: "CPF concatenado em URL", re: /["']\/[^"'\s]*["']\s*\+\s*[\w.]*cpf/i },
  // Parâmetro de query: ?cpf= / &numCpf=
  { nome: "CPF em query string", re: /[?&][\w]*cpf=/i },
  // Leitura/escrita do parâmetro: sp.cpf, searchParams.get("cpf"), q.set("cpf", …)
  { nome: "CPF lido da URL", re: /\b(sp|searchParams|params)\s*\.\s*\w*cpf\b/i },
  { nome: "CPF em URLSearchParams", re: /\.(set|append)\(\s*["']\w*cpf["']|searchParams\s*\.\s*(get|has)\(\s*["']\w*cpf["']/i },
  // Parâmetro de rota com CPF: params: Promise<{ cpf: string }>
  { nome: "CPF como parâmetro de rota", re: /params\s*:\s*Promise<\{\s*\w*cpf\s*:/i },
  // CPF literal (11 dígitos) em href/redirect/push/replace
  { nome: "CPF literal em URL", re: /(href|redirect|push|replace|revalidatePath)\s*[=(]\s*\{?\s*["'`][^"'`]*\b\d{11}\b/ },
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
    const ruins = pastas.filter((p) => SEGMENTO_CPF.test(path.basename(p))).map((p) => path.relative(RAIZ, p));
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
      "type Props = { params: Promise<{ cpf: string }> };",
      'await page.goto("/beneficiarios/74185296355/editar"); redirect("/beneficiarios/74185296355/editar")',
    ];
    for (const s of antigos) expect(achados(s), s).not.toEqual([]);
    for (const nome of ["[cpf]", "[numCpf]", "[...cpf]", "[[...cpf]]"]) expect(SEGMENTO_CPF.test(nome), nome).toBe(true);
    // A chave opaca não dispara a guarda.
    expect(achados("<Link href={`/beneficiarios/${b.chavePublica}/editar`}>")).toEqual([]);
    expect(SEGMENTO_CPF.test("[chave]")).toBe(false);
  });
});
