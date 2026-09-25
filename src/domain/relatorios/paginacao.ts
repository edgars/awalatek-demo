// Paginación de los informes impresos del legado (66 líneas por hoja, FR-REL-04 / FR-AUD-06).
// TypeScript puro: recibe los ítems ya armados y los reparte en páginas con la misma
// aritmética de #LINHA que los programas Natural. Reutilizable: RELPGT deja la línea en 6
// tras la cabecera; RELAUDIT (story 7.3) la deja en 7.

/** `#MAX-LINHAS` — hoja de impresora mainframe. */
export const MAX_LINHAS = 66;

/** `#LINHA` inicial: 99 fuerza la cabecera antes del primer detalle. */
export const LINHA_INICIAL = 99;

export type OpcoesPaginacao<T> = {
  /** Valor de `#LINHA` tras imprimir la cabecera (`MOVE 6 TO #LINHA` en RELPGT, 7 en RELAUDIT). */
  linhaAposCabecalho: number;
  /** Líneas que el ítem suma a `#LINHA` (detalle 1, subtotal 3…). Default 1. */
  linhasDe?: (item: T) => number;
  /** El ítem pasa por la verificación de paginación antes de imprimirse. Default: todos. */
  verificaQuebra?: (item: T) => boolean;
  /** `#MAX-LINHAS` (default 66). */
  maxLinhas?: number;
};

/** `IF #LINHA >= (#MAX-LINHAS - 5)` → nueva página. */
export function precisaNovaPagina(linha: number, maxLinhas: number = MAX_LINHAS): boolean {
  return linha >= maxLinhas - 5;
}

/**
 * Reparte `itens` en páginas. Una página nueva empieza (cabecera) cuando un ítem que
 * verifica la quiebra encuentra `#LINHA >= #MAX-LINHAS - 5`; los ítems que no verifican
 * (p. ej. el subtotal de RELPGT) se imprimen en la página en curso aunque pasen del límite.
 * Sin ítems no hay páginas (el legado no imprime cabecera).
 */
export function paginar<T>(itens: readonly T[], opcoes: OpcoesPaginacao<T>): T[][] {
  const { linhaAposCabecalho, linhasDe = () => 1, verificaQuebra = () => true, maxLinhas = MAX_LINHAS } = opcoes;
  const paginas: T[][] = [];
  let linha = LINHA_INICIAL;
  let atual: T[] | null = null;
  for (const item of itens) {
    if (atual === null || (verificaQuebra(item) && precisaNovaPagina(linha, maxLinhas))) {
      // PERFORM IMPRIME-CABECALHO: ADD 1 TO #PAG … MOVE <n> TO #LINHA.
      atual = [];
      paginas.push(atual);
      linha = linhaAposCabecalho;
    }
    atual.push(item);
    linha += linhasDe(item);
  }
  return paginas;
}

/**
 * Tope de filas de detalle que un informe (analítico 7.1, auditoría 7.3) carga en memoria.
 * Por encima, no se lee el detalle y la pantalla pide refinar el filtro (volumen, H3).
 */
export const LIMITE_LINHAS_RELATORIO = 20000;

/**
 * Mensaje de la pantalla cuando la consulta supera `LIMITE_LINHAS_RELATORIO`. "Consulta" y
 * no "Período" (texto del spec): el conteo ya aplica los filtros (programa en 7.1; acción,
 * usuario y tabela en 7.3), así que refinar cualquiera de ellos reduce el volumen.
 */
export const MSG_LIMITE_LINHAS_RELATORIO = "Consulta com mais de 20.000 registros. Refine o filtro.";
