import { z } from "zod";
import { mascaraCpfRelatorio } from "@/domain/cpf";
import { paginar } from "./paginacao";

// Informe analítico de pagos (RELPGT, story 7.1 — FR-REL-01..04). TypeScript puro:
// recibe las filas ya leídas (pago + beneficiario) y devuelve detalles, subtotales por
// programa, total general y páginas de 66 líneas. Solo lectura: no escribe nada.
// Valores en centavos enteros (suma exacta de enteros, sin float fraccionario).

/** Cabecera literal de IMPRIME-CABECALHO (RELPGT:191–194). */
export const TITULO_RELATORIO_PAGAMENTOS = "SIFAP - RELATORIO ANALITICO DE PAGAMENTOS";

/** `MOVE 6 TO #LINHA` al final de IMPRIME-CABECALHO (RELPGT:199). */
export const LINHA_APOS_CABECALHO_RELPGT = 6;
/** IMPRIME-SUBTOTAL: `ADD 3 TO #LINHA` (RELPGT:209). */
export const LINHAS_SUBTOTAL = 3;

export type PagamentoLido = {
  numPagamento: number;
  numCpf: string;
  codPrograma: string;
  anoMesRef: number;
  vlrBruto: number;
  vlrDescontoTotal: number;
  vlrLiquido: number;
  vlrAbono: number;
  tipoPgto: string;
  sitPagamento: string;
  /** `FIND BENEFICIARIO-V WITH CPF` — `null` si no existe. */
  beneficiario: { nomeCompleto: string; uf: string | null } | null;
};

export type FiltrosRelatorioPagamentos = {
  /** `#COMP-INI` AAAAMM. */
  compIni: number;
  /** `#COMP-FIM` AAAAMM. */
  compFim: number;
  /** `#COD-PROG-FILTRO` — vacío o "0" = todos. */
  programa: string;
};

export type LinhaDetalhe = {
  tipo: "detalhe";
  numPagamento: number;
  codPrograma: string;
  competencia: number;
  cpfMascarado: string;
  nome: string;
  uf: string;
  bruto: number;
  desconto: number;
  liquido: number;
  statusDesc: string;
  tipoDesc: string;
};

export type LinhaSubtotal = { tipo: "subtotal"; codPrograma: string; qtd: number; bruto: number; liquido: number };

export type LinhaRelatorio = LinhaDetalhe | LinhaSubtotal;

export type TotalGeral = { qtd: number; bruto: number; desconto: number; liquido: number; abono: number };

export type RelatorioPagamentos = {
  linhas: LinhaRelatorio[];
  paginas: LinhaRelatorio[][];
  total: TotalGeral;
};

/** `DECIDE ON FIRST VALUE OF TIPO-PGTO`. */
export function descricaoTipo(tipo: string): string {
  // RK-b0f53e1b01b3 (RELPGT:116) — N NORMAL · D DECIMO · T TERCEIRO · NONE OUTRO.
  switch (tipo) {
    case "N":
      return "NORMAL";
    case "D":
      return "DECIMO";
    case "T":
      return "TERCEIRO";
    default:
      return "OUTRO";
  }
}

/** `DECIDE ON FIRST VALUE OF STATUS-PGTO` — literales truncados a A8 del legado. */
export function descricaoStatus(status: string): string {
  // RK-4fcb39638b68 (RELPGT:128) — G GERADO · P PAGO · C CANCELAD · D DEVOLVID · E ESTORNAD · NONE OUTRO.
  switch (status) {
    case "G":
      return "GERADO";
    case "P":
      return "PAGO";
    case "C":
      return "CANCELAD";
    case "D":
      return "DEVOLVID";
    case "E":
      return "ESTORNAD";
    default:
      return "OUTRO";
  }
}

/** Código de programa (String(4)) sin espacios y en mayúsculas — semántica de campo A. */
export function normalizarCodPrograma(cod: string): string {
  return String(cod ?? "").trim().toUpperCase();
}

/** Filtro de programa: vacío o "0" (`#COD-PROG-FILTRO = 0`) = todos. */
export function normalizarFiltroPrograma(programa: string): string {
  const p = normalizarCodPrograma(programa);
  return p === "" || /^0+$/.test(p) ? "" : p;
}

/**
 * Orden de lectura: `READ PAGAMENTO-V BY COMPETENCIA`.
 * TODO(review): el legado solo ordena por el descriptor COMPETENCIA (dentro de la misma
 * competencia rige el orden físico). Se usa competencia → programa → numPagamento, como
 * pide la historia; confirmar con negocio.
 */
export function ordenarLeitura<T extends Pick<PagamentoLido, "anoMesRef" | "codPrograma" | "numPagamento">>(filas: readonly T[]): T[] {
  return [...filas].sort(
    (a, b) =>
      a.anoMesRef - b.anoMesRef ||
      (a.codPrograma < b.codPrograma ? -1 : a.codPrograma > b.codPrograma ? 1 : 0) ||
      a.numPagamento - b.numPagamento,
  );
}

function detalhe(p: PagamentoLido): LinhaDetalhe {
  return {
    tipo: "detalhe",
    numPagamento: p.numPagamento,
    codPrograma: p.codPrograma,
    competencia: p.anoMesRef,
    // MOVE CPF-BENEF TO #CPF-STR; COMPRESS '***.' … (RELPGT:110).
    cpfMascarado: mascaraCpfRelatorio(p.numCpf),
    // SUBSTR(NOME,1,30) y UF; beneficiario inexistente → blancos (RELPGT:102–107).
    nome: p.beneficiario ? p.beneficiario.nomeCompleto.slice(0, 30) : "",
    uf: p.beneficiario?.uf ?? "",
    bruto: p.vlrBruto,
    desconto: p.vlrDescontoTotal,
    liquido: p.vlrLiquido,
    statusDesc: descricaoStatus(p.sitPagamento),
    tipoDesc: descricaoTipo(p.tipoPgto),
  };
}

/** Arma el informe RELPGT a partir de las filas leídas (cualquier orden). */
export function montarRelatorioPagamentos(filas: readonly PagamentoLido[], filtros: FiltrosRelatorioPagamentos): RelatorioPagamentos {
  const filtroPrograma = normalizarFiltroPrograma(filtros.programa);
  const linhas: LinhaRelatorio[] = [];
  const total: TotalGeral = { qtd: 0, bruto: 0, desconto: 0, liquido: 0, abono: 0 };
  let sub: LinhaSubtotal | null = null;
  // `#PROG-ANT NE 0` ≡ "ya hubo un programa anterior".
  let progAnt: string | null = null;

  const fecharSubtotal = () => {
    if (sub) linhas.push(sub);
  };

  // El código de programa se normaliza una sola vez: filtro, orden y corte usan el mismo valor.
  const lidas = filas.map((p) => ({ ...p, codPrograma: normalizarCodPrograma(p.codPrograma) }));

  for (const p of ordenarLeitura(lidas)) {
    // READ … BY COMPETENCIA = #COMP-INI: la lectura empieza en la competencia inicial.
    if (p.anoMesRef < filtros.compIni) continue;
    // RK-c1a8ff5dbe7b (RELPGT:83) — IF COMPETENCIA > #COMP-FIM → ESCAPE BOTTOM.
    if (p.anoMesRef > filtros.compFim) break;
    // RK-5a5f1426d63d (RELPGT:87) — IF #COD-PROG-FILTRO NE 0 AND COD-PROGRAMA NE filtro → ESCAPE TOP.
    if (filtroPrograma !== "" && p.codPrograma !== filtroPrograma) continue;

    // RK-7c5773e59cfe (RELPGT:93) — IF COD-PROGRAMA NE #PROG-ANT AND #PROG-ANT NE 0 →
    // IMPRIME-SUBTOTAL y zera acumuladores. El corte es entre registros CONSECUTIVOS en el
    // orden de lectura, no un agrupamiento global: se emite un subtotal por cada tramo
    // contiguo, así que un mismo programa puede tener varios subtotales (p. ej. P2 en una
    // competencia, P1, y P2 otra vez en la siguiente). Se replica tal cual el legado.
    // TODO(review): el orden secundario dentro de la competencia (ver ordenarLeitura) define
    // dónde caen esos cortes; confirmar con negocio.
    if (progAnt !== null && p.codPrograma !== progAnt) {
      fecharSubtotal();
      sub = null;
    }
    progAnt = p.codPrograma;
    sub ??= { tipo: "subtotal", codPrograma: p.codPrograma, qtd: 0, bruto: 0, liquido: 0 };

    linhas.push(detalhe(p));
    // Acumuladores (RELPGT:161–168): total con desconto y abono; subtotal sin descuento.
    total.bruto += p.vlrBruto;
    total.desconto += p.vlrDescontoTotal;
    total.liquido += p.vlrLiquido;
    total.abono += p.vlrAbono;
    total.qtd += 1;
    sub.bruto += p.vlrBruto;
    sub.liquido += p.vlrLiquido;
    sub.qtd += 1;
  }

  // RK-65a445d0bcfe (RELPGT:173) — IF #PROG-ANT NE 0 → último IMPRIME-SUBTOTAL.
  if (progAnt !== null) fecharSubtotal();

  return { linhas, paginas: paginarRelatorioPagamentos(linhas), total };
}

/** Páginas de 66 líneas de RELPGT (cabecera deja `#LINHA = 6`). */
export function paginarRelatorioPagamentos(linhas: readonly LinhaRelatorio[]): LinhaRelatorio[][] {
  // RK-e6e70b3b6737 (RELPGT:144) — IF #LINHA >= (#MAX-LINHAS - 5) → IMPRIME-CABECALHO; solo
  // antes de cada detalle. Detalle suma 1 (:158), subtotal suma 3 (:209) sin verificar.
  return paginar(linhas, {
    linhaAposCabecalho: LINHA_APOS_CABECALHO_RELPGT,
    linhasDe: (l) => (l.tipo === "detalhe" ? 1 : LINHAS_SUBTOTAL),
    verificaQuebra: (l) => l.tipo === "detalhe",
  });
}

// ---------------------------------------------------------------------------
// Filtros de la pantalla `/relatorios/pagamentos` (query string, GET).

const texto = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim());

export const MENSAGENS_RELATORIO_PAGAMENTOS = {
  competenciaAusente: "Informe a competência inicial e a final.",
  competenciaInvalida: "Competência inválida.",
  periodoInvertido: "Competência inicial maior que a final.",
  programaInvalido: "Programa inválido.",
  vazio: "Nenhum pagamento no período",
} as const;

/** `AAAAMM` o `AAAA-MM` → AAAAMM; ausente → 0; presente pero inválida → `null`. */
const competencia = texto.transform((v): number | null => {
  if (v === "") return 0;
  const m = /^([1-9]\d{3})-?(0[1-9]|1[0-2])$/.exec(v);
  return m ? Number(`${m[1]}${m[2]}`) : null;
});

export const filtrosRelatorioPagamentosSchema = z.object({
  compIni: competencia,
  compFim: competencia,
  /** "" = todos; `null` = informado pero inválido. */
  programa: texto.transform((v): string | null => {
    const c = normalizarFiltroPrograma(v);
    return c === "" || /^[A-Z0-9]{1,4}$/.test(c) ? c : null;
  }),
  pagina: texto.transform((v) => {
    const n = Math.trunc(Number(v));
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
  }),
  impressao: texto.transform((v) => v === "1"),
});

export type FiltrosTelaRelatorioPagamentos = z.output<typeof filtrosRelatorioPagamentosSchema>;

export function lerFiltrosRelatorioPagamentos(sp: Record<string, string | string[] | undefined>): FiltrosTelaRelatorioPagamentos {
  return filtrosRelatorioPagamentosSchema.parse({
    compIni: sp.compIni,
    compFim: sp.compFim,
    programa: sp.programa,
    pagina: sp.pagina,
    impressao: sp.impressao,
  });
}

export type ValidacaoFiltros =
  | { ok: true; filtros: FiltrosRelatorioPagamentos }
  | { ok: false; erros: { compIni?: string; compFim?: string; programa?: string }; aviso?: string };

/**
 * Decide si el informe se puede generar. Ausente → aviso (informe no solicitado);
 * competência o programa inválidos → error en el campo; período invertido → error.
 */
export function validarFiltrosRelatorioPagamentos(f: FiltrosTelaRelatorioPagamentos): ValidacaoFiltros {
  const M = MENSAGENS_RELATORIO_PAGAMENTOS;
  const erros: { compIni?: string; compFim?: string; programa?: string } = {};
  if (f.compIni === null) erros.compIni = M.competenciaInvalida;
  if (f.compFim === null) erros.compFim = M.competenciaInvalida;
  if (f.programa === null) erros.programa = M.programaInvalido;
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  if (!f.compIni || !f.compFim) return { ok: false, erros: {}, aviso: M.competenciaAusente };
  if ((f.compIni as number) > (f.compFim as number)) return { ok: false, erros: { compIni: M.periodoInvertido } };
  return { ok: true, filtros: { compIni: f.compIni as number, compFim: f.compFim as number, programa: f.programa as string } };
}
