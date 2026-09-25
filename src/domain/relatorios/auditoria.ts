import { z } from "zod";
import { paginar } from "./paginacao";

// Informe de la trilla de auditoría (RELAUDIT, story 7.3 — FR-AUD-01..06). TypeScript
// puro: recibe los eventos ya leídos y devuelve detalles, páginas de 66 líneas y el
// resumen por acción. Solo lectura: la auditoría la escribe únicamente `registrarEvento`
// (FR-AUD-07, ADR-009).

/** Cabecera literal de IMPRIME-CAB-AUDIT (RELAUDIT:212–214). */
export const CABECALHO_AUDITORIA = {
  titulo: "SIFAP - TRILHA DE AUDITORIA",
  pagina: "PAG:",
  periodo: "PERIODO:",
  ate: "A",
  data: "DATA:",
} as const;

/**
 * Columnas literales de la cabecera: WRITE (T, 100 guiones) / PRINT (I, 120 guiones) — RELAUDIT:216–229.
 * La línea de guiones va antes y después de los títulos de columna (:216/:219, :226/:229).
 */
export const COLUNAS_CABECALHO_AUDITORIA = {
  T: { colunas: `DATA       HORA     USUARIO  ACAO${" ".repeat(20)}TABELA          CHAVE`, guioes: 100 },
  I: { colunas: `DATA       HORA     USUARIO  ACAO${" ".repeat(20)}TABELA          CHAVE               DESCRICAO`, guioes: 120 },
} as const;

/** Resumen literal (RELAUDIT:190–205). */
export const ROTULOS_RESUMO_AUDITORIA = {
  titulo: "RESUMO AUDITORIA",
  total: "TOTAL REGISTROS....:",
  exibidos: "EXIBIDOS...........:",
  filtrados: "FILTRADOS..........:",
  porTipo: "POR TIPO ACAO:",
  inclusao: "  INCLUSOES........:",
  alteracao: "  ALTERACOES.......:",
  consulta: "  CONSULTAS........:",
  conciliacao: "  CONCILIACOES.....:",
  divergencia: "  DIVERGENCIAS.....:",
  outras: "  OUTRAS...........:",
} as const;

/** `MOVE 19970101 TO #DT-INI` (RELAUDIT:85). */
export const DT_INI_PADRAO = 19970101;

/** `MOVE 7 TO #LINHA` al final de IMPRIME-CAB-AUDIT (RELAUDIT:231). */
export const LINHA_APOS_CABECALHO_RELAUDIT = 7;

/** Acción que nunca se muestra (exclusiones, RELAUDIT:105). */
export const ACAO_EXCLUSAO = "EX";

/** Acciones ofrecidas en el filtro de la pantalla (EX nunca se muestra). */
export const ACOES_FILTRO_AUDITORIA = ["IN", "AL", "CO", "CN", "DV"] as const;

export type SaidaAuditoria = "T" | "I";

/** Evento de AUDITORIA-V ya leído. */
export type EventoAuditoriaLido = {
  numAuditoria: number;
  /** DT-EVENTO AAAAMMDD. */
  dtEvento: number;
  /** HR-EVENTO HHMMSS (N6). */
  hrEvento: number;
  /** USUARIO (A8). */
  usrEvento: string;
  /** ACAO (A2). */
  codAcao: string;
  /** TABELA-REF (A15). */
  tipoEntidade: string;
  /** CHAVE-REF (A20). */
  idEntidade: string;
  /** DESCRICAO (A80). */
  desAcao: string;
};

/** Parámetros del INPUT tal como llegan (0 / "" = no informado). */
export type EntradaRelatorioAuditoria = {
  dtIni: number;
  dtFim: number;
  acao: string;
  usuario: string;
  tabela: string;
  saida: string;
};

/** Parámetros tras aplicar los defaults de RELAUDIT:80–89. */
export type FiltrosRelatorioAuditoria = EntradaRelatorioAuditoria;

export type LinhaAuditoria = {
  numAuditoria: number;
  dtEvento: number;
  /** `#HR-FORMAT` HH:MM:SS. */
  hora: string;
  usuario: string;
  codAcao: string;
  /** `#ACAO-DESC`. */
  acaoDesc: string;
  tabela: string;
  chave: string;
  /** Solo en salida I (PRINT … DESCRICAO); `null` en salida T. */
  descricao: string | null;
};

export type ContagemPorAcao = {
  inclusao: number;
  alteracao: number;
  consulta: number;
  conciliacao: number;
  divergencia: number;
  outras: number;
};

export type ResumoAuditoria = { total: number; exibidos: number; filtrados: number; porAcao: ContagemPorAcao };

export type RelatorioAuditoria = {
  filtros: FiltrosRelatorioAuditoria;
  /** Salida efectiva: `IF #TIPO-SAIDA = 'T'` → WRITE; cualquier otro valor → PRINT (I). */
  saida: SaidaAuditoria;
  linhas: LinhaAuditoria[];
  paginas: LinhaAuditoria[][];
  resumo: ResumoAuditoria;
};

/** Campo A de Natural: los espacios finales no cuentan en la comparación. */
function campoA(s: string | null | undefined): string {
  return String(s ?? "").trimEnd();
}

/** Aplica los valores por defecto del INPUT (FR-AUD-01). `dtHoje` = `*DATN` (`hoje().data`). */
export function aplicarPadroesAuditoria(entrada: EntradaRelatorioAuditoria, dtHoje: number): FiltrosRelatorioAuditoria {
  // RK-b4fe11eb2c22 (RELAUDIT:80) — IF #TIPO-SAIDA = ' ' → MOVE 'T' TO #TIPO-SAIDA.
  const saida = campoA(entrada.saida) === "" ? "T" : entrada.saida;
  // RK-d99bee200be3 (RELAUDIT:84) — IF #DT-INI = 0 → MOVE 19970101 TO #DT-INI.
  const dtIni = entrada.dtIni === 0 ? DT_INI_PADRAO : entrada.dtIni;
  // RK-819d962f567a (RELAUDIT:87) — IF #DT-FIM = 0 → MOVE #DT-HOJE TO #DT-FIM.
  const dtFim = entrada.dtFim === 0 ? dtHoje : entrada.dtFim;
  return { ...entrada, saida, dtIni, dtFim };
}

/** `DECIDE ON FIRST VALUE OF AUDITORIA-V.ACAO` → `#ACAO-DESC`. */
export function descricaoAcao(codAcao: string): string {
  // RK-6a74a1f56dab (RELAUDIT:137) — IN INCLUSAO · AL ALTERACAO · CO CONCILIACAO ·
  // CN CONSULTA · DV DIVERGENCIA · NONE OUTRA.
  switch (campoA(codAcao)) {
    case "IN":
      return "INCLUSAO";
    case "AL":
      return "ALTERACAO";
    case "CO":
      return "CONCILIACAO";
    case "CN":
      return "CONSULTA";
    case "DV":
      return "DIVERGENCIA";
    default:
      return "OUTRA";
  }
}

/** Acumulador de `#QTD-…` correspondiente a la acción (mismo DECIDE de RELAUDIT:137). */
function chaveContagem(codAcao: string): keyof ContagemPorAcao {
  switch (campoA(codAcao)) {
    case "IN":
      return "inclusao";
    case "AL":
      return "alteracao";
    case "CO":
      return "conciliacao";
    case "CN":
      return "consulta";
    case "DV":
      return "divergencia";
    default:
      return "outras";
  }
}

/**
 * `MOVE HR-EVENTO TO #HR-STR` (N6 → A6, con ceros a la izquierda) y
 * `COMPRESS SUBSTR(1,2) ':' SUBSTR(3,2) ':' SUBSTR(5,2)` (RELAUDIT:159–161).
 */
export function formatarHoraAuditoria(hrEvento: number): string {
  const s = String(Math.trunc(Math.abs(hrEvento))).padStart(6, "0").slice(-6);
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

/** `IF #TIPO-SAIDA = 'T'` → WRITE (tela); cualquier otro valor → PRINT (impressora). */
export function saidaEfetiva(saida: string): SaidaAuditoria {
  return campoA(saida) === "T" ? "T" : "I";
}

/**
 * Orden de lectura: `READ AUDITORIA-V BY DT-EVENTO`.
 * TODO(review): el legado solo ordena por el descriptor DT-EVENTO (dentro del mismo día
 * rige el orden físico). Se usa dtEvento → hrEvento → numAuditoria; confirmar con negocio.
 */
export function ordenarLeituraAuditoria<T extends Pick<EventoAuditoriaLido, "dtEvento" | "hrEvento" | "numAuditoria">>(eventos: readonly T[]): T[] {
  return [...eventos].sort((a, b) => a.dtEvento - b.dtEvento || a.hrEvento - b.hrEvento || a.numAuditoria - b.numAuditoria);
}

/**
 * Valores informados de los filtros de acción/usuario/tabela tal como los compara
 * `motivoFiltro` (campo A: sin espacios finales); "" = no informado. La lectura acotada
 * en la base (H3) exige que el campo EMPIECE con el valor: condición necesaria de
 * `campoA(campo) === valor`, así que la base devuelve un superconjunto y `motivoFiltro`
 * sigue decidiendo cada evento. Fuente única de la normalización: `motivoFiltro` la usa.
 */
export function valoresFiltroAuditoria(f: Pick<FiltrosRelatorioAuditoria, "acao" | "usuario" | "tabela">): { acao: string; usuario: string; tabela: string } {
  return { acao: campoA(f.acao), usuario: campoA(f.usuario), tabela: campoA(f.tabela) };
}

/** Motivo por el que el evento no se muestra (`null` = se muestra). Un evento cuenta una sola vez. */
export function motivoFiltro(e: EventoAuditoriaLido, f: FiltrosRelatorioAuditoria): "EX" | "acao" | "usuario" | "tabela" | null {
  // RK-2e5c9f06f325 (RELAUDIT:105) — IF ACAO = 'EX' → ADD 1 TO #QTD-FILTRADOS; ESCAPE TOP.
  // Antes que cualquier otro filtro: las exclusiones nunca se muestran.
  if (campoA(e.codAcao) === ACAO_EXCLUSAO) return "EX";
  const { acao, usuario, tabela } = valoresFiltroAuditoria(f);
  // RK-b3ac1f6f4ede (RELAUDIT:111) — IF #ACAO-FILTRO NE ' ' (filtro informado)…
  if (acao !== "") {
    // RK-be935d51d847 (RELAUDIT:112) — …IF ACAO NE #ACAO-FILTRO → filtrados +1; ESCAPE TOP.
    if (campoA(e.codAcao) !== acao) return "acao";
  }
  // RK-78771795cd8b (RELAUDIT:119) — IF #USUARIO-FILTRO NE ' ' (filtro informado)…
  if (usuario !== "") {
    // RK-bea2ff075a6c (RELAUDIT:120) — …IF USUARIO NE #USUARIO-FILTRO → filtrados +1; ESCAPE TOP.
    if (campoA(e.usrEvento) !== usuario) return "usuario";
  }
  // RK-60326023cab9 (RELAUDIT:127) — IF #TABELA-FILTRO NE ' ' (filtro informado)…
  if (tabela !== "") {
    // RK-7f232f1dd913 (RELAUDIT:128) — …IF TABELA-REF NE #TABELA-FILTRO → filtrados +1; ESCAPE TOP.
    if (campoA(e.tipoEntidade) !== tabela) return "tabela";
  }
  return null;
}

/** Línea de detalle según la salida (FR-AUD-06). */
export function linhaDetalheAuditoria(e: EventoAuditoriaLido, saida: SaidaAuditoria): LinhaAuditoria {
  // RK-4e229cab081e (RELAUDIT:169) — IF #TIPO-SAIDA = 'T' → WRITE DT-EVENTO #HR-FORMAT USUARIO
  // #ACAO-DESC TABELA-REF CHAVE-REF; ELSE PRINT … además DESCRICAO.
  return {
    numAuditoria: e.numAuditoria,
    dtEvento: e.dtEvento,
    hora: formatarHoraAuditoria(e.hrEvento),
    usuario: campoA(e.usrEvento),
    codAcao: campoA(e.codAcao),
    acaoDesc: descricaoAcao(e.codAcao),
    tabela: campoA(e.tipoEntidade),
    chave: campoA(e.idEntidade),
    descricao: saida === "T" ? null : campoA(e.desAcao),
  };
}

/** Páginas de 66 líneas de RELAUDIT (cabecera deja `#LINHA = 7` → 54 detalles por hoja). */
export function paginarRelatorioAuditoria<T>(linhas: readonly T[]): T[][] {
  // RK-9ec291e3f4e5 (RELAUDIT:164) — IF #LINHA >= (#MAX-LINHAS - 5) → PERFORM IMPRIME-CAB-AUDIT,
  // antes de cada detalle; cada detalle suma 1 (ADD 1 TO #LINHA, :185).
  // RK-7083ebf609a1 (RELAUDIT:210) — IMPRIME-CAB-AUDIT: ADD 1 TO #PAG; cabecera T/I; MOVE 7 TO #LINHA.
  return paginar(linhas, { linhaAposCabecalho: LINHA_APOS_CABECALHO_RELAUDIT });
}

/**
 * Arma el informe RELAUDIT a partir de los eventos leídos (cualquier orden) y los filtros ya con defaults.
 *
 * `totalNoPeriodo` (opcional): cuando la base ya descartó eventos que no pasan los filtros
 * (lectura acotada, H3), `eventos` es solo un superconjunto de los exhibidos y el total del
 * período viene de un `count`. Como cada evento del período se exhibe o se filtra (una sola
 * vez), `filtrados = total − exibidos`: mismos contadores que leyendo todo el período.
 */
export function montarRelatorioAuditoria(
  eventos: readonly EventoAuditoriaLido[],
  filtros: FiltrosRelatorioAuditoria,
  totalNoPeriodo?: number,
): RelatorioAuditoria {
  const saida = saidaEfetiva(filtros.saida);
  const linhas: LinhaAuditoria[] = [];
  const porAcao: ContagemPorAcao = { inclusao: 0, alteracao: 0, consulta: 0, conciliacao: 0, divergencia: 0, outras: 0 };
  const resumo: ResumoAuditoria = { total: 0, exibidos: 0, filtrados: 0, porAcao };

  for (const e of ordenarLeituraAuditoria(eventos)) {
    // RK-713713b19064 (RELAUDIT:93) — IF DT-EVENTO < #DT-INI → ESCAPE TOP (no cuenta).
    if (e.dtEvento < filtros.dtIni) continue;
    // RK-aae01121639f (RELAUDIT:96) — IF DT-EVENTO > #DT-FIM → ESCAPE BOTTOM (fin de la lectura).
    if (e.dtEvento > filtros.dtFim) break;
    // ADD 1 TO #QTD-TOTAL (:100): total = eventos dentro del rango, incluidos EX y filtrados.
    resumo.total += 1;
    if (motivoFiltro(e, filtros) !== null) {
      resumo.filtrados += 1;
      continue;
    }
    // ADD 1 TO #QTD-EXIBIDOS (:134) y contador por acción (:137).
    resumo.exibidos += 1;
    porAcao[chaveContagem(e.codAcao)] += 1;
    linhas.push(linhaDetalheAuditoria(e, saida));
  }

  if (totalNoPeriodo !== undefined) {
    if (!Number.isSafeInteger(totalNoPeriodo) || totalNoPeriodo < resumo.exibidos) throw new Error("total do período inconsistente");
    resumo.total = totalNoPeriodo;
    resumo.filtrados = totalNoPeriodo - resumo.exibidos;
  }

  return { filtros, saida, linhas, paginas: paginarRelatorioAuditoria(linhas), resumo };
}

// ---------------------------------------------------------------------------
// Filtros de la pantalla `/relatorios/auditoria` (query string, GET).

export const MENSAGENS_RELATORIO_AUDITORIA = {
  dataInvalida: "Data inválida.",
  periodoInvertido: "Data inicial maior que a final.",
  acaoInvalida: "Ação inválida.",
  usuarioInvalido: "Usuário inválido (máximo 8 caracteres).",
  tabelaInvalida: "Tabela inválida (máximo 15 caracteres).",
  saidaInvalida: "Saída inválida (T = tela, I = impressão).",
  vazio: "Nenhum evento de auditoria no período",
} as const;

const texto = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")));

const RE_DATA = /^([1-9]\d{3})-?(0[1-9]|1[0-2])-?(0[1-9]|[12]\d|3[01])$/;

/** Fecha de calendario real (año, mes 1–12, día existente en ese mes; 29/02 solo en bisiesto). */
export function dataCalendarioValida(ano: number, mes: number, dia: number): boolean {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * `AAAAMMDD` o `AAAA-MM-DD` → AAAAMMDD; ausente/"0" → 0; presente pero inválida (formato o
 * fecha inexistente, p. ej. 20110231) → `null`.
 */
const data = texto.transform((v): number | null => {
  const s = v.trim();
  if (s === "" || s === "0") return 0;
  const m = RE_DATA.exec(s);
  if (!m || !dataCalendarioValida(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
  return Number(`${m[1]}${m[2]}${m[3]}`);
});

/**
 * Campo alfanumérico de largo máximo `n` (A8/A15). Solo los espacios finales no cuentan
 * (en Natural los iniciales sí son significativos) y se pasa a mayúsculas: el mapa INPUT
 * del legado capturaba en mayúsculas y los valores grabados (USUARIO, TABELA-REF) lo están.
 * Excedido → `null`.
 */
const alfa = (n: number) =>
  texto.transform((v): string | null => {
    const s = v.trimEnd().toUpperCase();
    return s.length <= n ? s : null;
  });

export const filtrosRelatorioAuditoriaSchema = z.object({
  dtIni: data,
  dtFim: data,
  /** "" = todas; `null` = informada pero inválida. */
  acao: texto.transform((v): string | null => {
    const s = v.trim().toUpperCase();
    return s === "" || (ACOES_FILTRO_AUDITORIA as readonly string[]).includes(s) ? s : null;
  }),
  usuario: alfa(8),
  tabela: alfa(15),
  /** "" = default T; `null` = inválida. */
  saida: texto.transform((v): string | null => {
    const s = v.trim().toUpperCase();
    return s === "" || s === "T" || s === "I" ? s : null;
  }),
  pagina: texto.transform((v) => {
    const n = Math.trunc(Number(v));
    return Number.isSafeInteger(n) && n >= 1 ? n : 1;
  }),
  impressao: texto.transform((v) => v.trim() === "1"),
});

export type FiltrosTelaRelatorioAuditoria = z.output<typeof filtrosRelatorioAuditoriaSchema>;

export function lerFiltrosRelatorioAuditoria(sp: Record<string, string | string[] | undefined>): FiltrosTelaRelatorioAuditoria {
  return filtrosRelatorioAuditoriaSchema.parse({
    dtIni: sp.dtIni,
    dtFim: sp.dtFim,
    acao: sp.acao,
    usuario: sp.usuario,
    tabela: sp.tabela,
    saida: sp.saida,
    pagina: sp.pagina,
    impressao: sp.impressao,
  });
}

export type ErrosFiltrosAuditoria = Partial<Record<"dtIni" | "dtFim" | "acao" | "usuario" | "tabela" | "saida", string>>;

export type ValidacaoFiltrosAuditoria = { ok: true; filtros: FiltrosRelatorioAuditoria } | { ok: false; erros: ErrosFiltrosAuditoria };

/**
 * Valida los filtros de la pantalla y aplica los defaults del legado. Campos inválidos →
 * error junto al campo; período invertido (tras los defaults) → error en la fecha inicial.
 */
export function validarFiltrosRelatorioAuditoria(f: FiltrosTelaRelatorioAuditoria, dtHoje: number): ValidacaoFiltrosAuditoria {
  const M = MENSAGENS_RELATORIO_AUDITORIA;
  const erros: ErrosFiltrosAuditoria = {};
  if (f.dtIni === null) erros.dtIni = M.dataInvalida;
  if (f.dtFim === null) erros.dtFim = M.dataInvalida;
  if (f.acao === null) erros.acao = M.acaoInvalida;
  if (f.usuario === null) erros.usuario = M.usuarioInvalido;
  if (f.tabela === null) erros.tabela = M.tabelaInvalida;
  if (f.saida === null) erros.saida = M.saidaInvalida;
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  const filtros = aplicarPadroesAuditoria(
    {
      dtIni: f.dtIni as number,
      dtFim: f.dtFim as number,
      acao: f.acao as string,
      usuario: f.usuario as string,
      tabela: f.tabela as string,
      saida: f.saida as string,
    },
    dtHoje,
  );
  if (filtros.dtIni > filtros.dtFim) return { ok: false, erros: { dtIni: M.periodoInvertido } };
  return { ok: true, filtros };
}
