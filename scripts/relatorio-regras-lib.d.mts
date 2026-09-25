// Tipos de scripts/relatorio-regras-lib.mjs (para los tests en TypeScript).

export type StatusTeste = "passed" | "failed" | "skipped";
export type StatusRegra = "aprovada" | "falhou" | "sem-teste";

export interface Regra {
  chave: string;
  fonte: string;
  programa: string;
  linha: number;
  tipo: string | null;
  fr: string;
  pseudocodigo: string;
}

export interface Quirk {
  id: string;
  comportamentoLegado: string | null;
  decisao: string | null;
  frs: string[];
  corrigido: string | null;
}

export interface Teste {
  arquivo: string;
  titulo: string;
  status: StatusTeste;
  duracaoMs: number;
  mensagem?: string;
  erroArquivo?: boolean;
  projeto?: string | null;
  flaky?: boolean;
}

export interface TesteDaRegra {
  arquivo: string;
  titulo: string;
  status: Record<string, StatusTeste>;
  duracaoMs: Record<string, number>;
}

export interface Local {
  arquivo: string;
  linha: number;
}

export interface ResumoTestes {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duracaoMs: number;
}

export interface Agregado {
  total: number;
  aprovada: number;
  falhou: number;
  "sem-teste": number;
}

export interface RegraNoRelatorio extends Regra {
  /** Quirks cuyo FR (tabla §5 del PRD) coincide con el FR de la regla. */
  quirksDoFr: string[];
  implementacao: Local[];
  testes: TesteDaRegra[];
  status: StatusRegra;
}

export interface Relatorio {
  meta: Record<string, unknown> & { modos: string[] };
  totais: { regras: number; aprovada: number; falhou: number; "sem-teste": number; semImplementacao: number };
  vitest: Record<string, ResumoTestes>;
  falhasVitest: Record<string, { arquivo: string; titulo: string; mensagem?: string }[]>;
  e2e: { executado: false } | ({ executado: true; falhas: { arquivo: string; titulo: string }[] } & ResumoTestes);
  porPrograma: Record<string, Agregado>;
  porFr: Record<string, Agregado>;
  quirks: Quirk[];
  regras: RegraNoRelatorio[];
}

export const PADRAO_CHAVE: RegExp;
export const MODOS: readonly ["legado", "corrigido"];
export function extrairChaves(texto: string | null | undefined): string[];
export function parsePrdRegras(md: string): Regra[];
export function parseQuirks(md: string): Quirk[];
export function relativo(arquivo: string, raiz?: string): string;
export function testesDeVitest(json: unknown, raiz?: string): Teste[];
export function testesDePlaywright(json: unknown, raiz?: string): Teste[];
export function resumoTestes(testes: readonly Teste[]): ResumoTestes;
export function escanearImplementacoes(arquivos: readonly { arquivo: string; conteudo: string }[], chaves: readonly string[]): Map<string, Local[]>;
export function ehArquivoDeTeste(caminho: string): boolean;
export function mapearTestes(chaves: readonly string[], execucoes: Record<string, readonly Teste[]>): Map<string, TesteDaRegra[]>;
export function statusRegra(testes: readonly TesteDaRegra[], modos?: readonly string[]): StatusRegra;
export function montarRelatorio(p: {
  regras: readonly Regra[];
  quirks: readonly Quirk[];
  execucoes: Record<string, readonly Teste[]>;
  implementacoes: Map<string, Local[]>;
  e2e: readonly Teste[] | null;
  meta: Record<string, unknown>;
}): Relatorio;
export function codigoSaida(rel: Relatorio): 0 | 1;
export function gerarMarkdown(rel: Relatorio): string;
