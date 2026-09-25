import { z } from "zod";
import { aCentavos, deCentavos, redondear, type Dinheiro, type ValorDecimal } from "@/domain/money";
import { corrige, QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";

// Informe consolidado mensual (BATCHREL, story 7.2). Reglas puras sobre filas ya
// leídas: filtro de competencia, agrupación por región (D10), redondeo del bruto
// (D11), totales por status y totales generales. Solo lectura: no escribe nada.

/** Cabecera literal del legado (BATCHREL:203/:205/:206). */
export const CABECALHO_CONSOLIDADO = {
  titulo: "SIFAP - RELATORIO CONSOLIDADO MENSAL",
  pagina: "PAG:",
  competencia: "COMPETENCIA:",
  data: "DATA:",
} as const;

/** Nombres de las regiones, en el orden de los acumuladores (BATCHREL:75–79). */
export const NOMES_REGIAO = ["NORTE", "NORDESTE", "SUDESTE", "SUL", "CENTRO-OESTE"] as const;

/** CORRECAO(D10): sexta fila, solo con D10 corregido (0, 99, > 25 y beneficiario inexistente). */
export const NOME_NAO_CLASSIFICADA = "NAO CLASSIFICADA" as const;

/** Índice del acumulador "NAO CLASSIFICADA" (solo existe con D10 corregido). */
export const INDICE_NAO_CLASSIFICADA = NOMES_REGIAO.length;

/** Nombres de los status, en el orden de los acumuladores (BATCHREL:82–86). Completos (≠ RELPGT). */
export const NOMES_STATUS = ["GERADO", "PAGO", "CANCELADO", "DEVOLVIDO", "ESTORNADO"] as const;

/** Códigos de status de cada acumulador (índice alineado con `NOMES_STATUS`). */
export const CODIGOS_STATUS = ["G", "P", "C", "D", "E"] as const;

/** Pago ya leído, con la región de su beneficiario (`null` = beneficiario inexistente). */
export type PagamentoConsolidado = {
  anoMesRef: number;
  codRegiao: number | null;
  vlrBruto: number; // centavos
  vlrDescontoTotal: number; // centavos
  vlrLiquido: number; // centavos
  sitPagamento: string;
};

export type LinhaRegiao = { nome: (typeof NOMES_REGIAO)[number] | typeof NOME_NAO_CLASSIFICADA; qtd: number; bruto: number; desconto: number; liquido: number };
export type LinhaStatus = { codigo: (typeof CODIGOS_STATUS)[number]; nome: (typeof NOMES_STATUS)[number]; qtd: number; bruto: number };
export type TotalGeral = { qtd: number; bruto: number; desconto: number; liquido: number };
export type Consolidado = { competencia: number; regioes: LinhaRegiao[]; status: LinhaStatus[]; total: TotalGeral };

/** Nombre de una fila de región (las 5 del legado + "NAO CLASSIFICADA" con D10 corregido). */
export type NomeLinhaRegiao = LinhaRegiao["nome"];

/**
 * Filas de región del informe, en orden. Fuente única de la lista: `consolidar` crea
 * los acumuladores con ella e `indiceRegiao` busca en ella el nombre de `regiaoDe`.
 * LEGACY-QUIRK(D10): 5 filas. CORRECAO(D10): + "NAO CLASSIFICADA" (6 filas).
 */
export function nomesRegiao(quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO): readonly NomeLinhaRegiao[] {
  return corrige(quirks, "D10") ? [...NOMES_REGIAO, NOME_NAO_CLASSIFICADA] : NOMES_REGIAO;
}

/** Fila de región para `COD-REGIAO` (BATCHREL:117–133); `null` = beneficiario inexistente. */
export function regiaoDe(codRegiao: number | null, quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO): NomeLinhaRegiao {
  // FIND sin coincidencia deja #COD-REG = 0 (BATCHREL:111–114) → cae en "resto".
  const cod = codRegiao ?? 0;
  // LEGACY-QUIRK(D10): el DDM describe COD-REGIAO como 01-05 o 99 (5 macrorregiones),
  // pero BATCHREL agrupa los códigos 1–25 de a 5 y manda todo lo demás (21–25, 99, 0,
  // beneficiario inexistente) a CENTRO-OESTE. Se replica tal cual.
  // RK-d8b1ac2e14eb (BATCHREL:117) — IF #COD-REG >= 1 AND #COD-REG <= 5 → NORTE
  if (cod >= 1 && cod <= 5) return "NORTE";
  // RK-0cdc90e2bd81 (BATCHREL:120) — IF #COD-REG >= 6 AND #COD-REG <= 10 → NORDESTE
  if (cod >= 6 && cod <= 10) return "NORDESTE";
  // RK-8b828d08f033 (BATCHREL:123) — IF #COD-REG >= 11 AND #COD-REG <= 15 → SUDESTE
  if (cod >= 11 && cod <= 15) return "SUDESTE";
  // RK-893670f64c20 (BATCHREL:126) — IF #COD-REG >= 16 AND #COD-REG <= 20 → SUL; ELSE → CENTRO-OESTE
  if (cod >= 16 && cod <= 20) return "SUL";
  if (corrige(quirks, "D10")) {
    // CORRECAO(D10): solo 21–25 son CENTRO-OESTE; 0, 99, > 25 (y negativos) y el
    // beneficiario inexistente van a la fila "NAO CLASSIFICADA".
    return cod >= 21 && cod <= 25 ? "CENTRO-OESTE" : NOME_NAO_CLASSIFICADA;
  }
  // LEGACY-QUIRK(D10): todo lo demás → CENTRO-OESTE.
  return "CENTRO-OESTE";
}

/**
 * Índice de la fila de región en `nomesRegiao(quirks)`: 0..4 en el legado; con D10
 * corregido, 0..4 o `INDICE_NAO_CLASSIFICADA` (5).
 */
export function indiceRegiao(codRegiao: number | null, quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO): number {
  const i = nomesRegiao(quirks).indexOf(regiaoDe(codRegiao, quirks));
  if (i < 0) throw new Error("região sem linha no relatório");
  return i;
}

/** Índice (0..4) del acumulador de status (BATCHREL:146–159). */
export function indiceStatus(sitPagamento: string): number {
  // RK-95081b4796b9 (BATCHREL:146) — DECIDE ON FIRST VALUE OF STATUS-PGTO:
  // G→GERADO · P→PAGO · C→CANCELADO · D→DEVOLVIDO · E→ESTORNADO · NONE→GERADO.
  const i = (CODIGOS_STATUS as readonly string[]).indexOf(sitPagamento);
  return i >= 0 ? i : 0;
}

/**
 * Bruto del informe (#VLR-ARR, N13.2) a partir del VLR-BRUTO del pago.
 * LEGACY-QUIRK(D11): el consolidado REDONDEA (+0,005 y trunca) mientras que el
 * cálculo (CALCBENF) trunca. Se replica tal cual con `money.redondear`.
 */
export function brutoRelatorio(vlrBruto: ValorDecimal): Dinheiro {
  // RK-35bd4d675058 (BATCHREL:137) — COMPUTE #VLR-ARR = VLR-BRUTO + 0.005
  // RK-aeeeeeec3fcd (BATCHREL:138) — COMPUTE #VLR-TEMP (N15) = #VLR-ARR * 100 → trunca a entero
  // RK-1a7fe69dd6d1 (BATCHREL:139) — COMPUTE #VLR-ARR = #VLR-TEMP / 100
  return redondear(vlrBruto);
}

/**
 * `brutoRelatorio` en centavos enteros. Con D11 corregido `consolidar` no la usa.
 * Nota: como `vlrBruto` se persiste en centavos enteros (2 decimales exactos), el
 * redondeo D11 es la identidad sobre los datos persistidos; se mantiene por
 * fidelidad al legado. Por lo mismo, la asimetría bruto crudo (status) vs.
 * redondeado (región/general) es hoy inerte: ambos totales coinciden.
 */
export function brutoRelatorioCentavos(vlrBrutoCentavos: number): number {
  return aCentavos(brutoRelatorio(deCentavos(vlrBrutoCentavos)));
}

/** Filtro de la lectura: solo pagos de la competencia pedida (BATCHREL:106). */
export function pertenceACompetencia(p: Pick<PagamentoConsolidado, "anoMesRef">, competencia: number): boolean {
  // RK-4aadc8392e9b (BATCHREL:106) — IF PAGAMENTO-V.COMPETENCIA NE #COMPETENCIA → ESCAPE BOTTOM
  return p.anoMesRef === competencia;
}

/**
 * Consolida los pagos de la competencia. Las filas de región (`nomesRegiao`: 5 en el
 * legado, 6 con D10 corregido) y los 5 status aparecen siempre (en cero si no hay
 * pagos), igual que los FOR 1 TO 5 del legado. `quirks` (default = legado) decide si
 * se corrigen D10 y D11.
 */
export function consolidar(
  competencia: number,
  pagamentos: readonly PagamentoConsolidado[],
  quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO,
): Consolidado {
  const corrigeD11 = corrige(quirks, "D11");
  // LEGACY-QUIRK(D10): 5 filas de región.
  // CORRECAO(D10): + la sexta fila "NAO CLASSIFICADA" (siempre visible, en cero si no hay pagos).
  const regioes: LinhaRegiao[] = nomesRegiao(quirks).map((nome) => ({ nome, qtd: 0, bruto: 0, desconto: 0, liquido: 0 }));
  const regiaoPorNome = new Map(regioes.map((r) => [r.nome, r] as const));
  const status: LinhaStatus[] = CODIGOS_STATUS.map((codigo, i) => ({ codigo, nome: NOMES_STATUS[i] as LinhaStatus["nome"], qtd: 0, bruto: 0 }));
  const total: TotalGeral = { qtd: 0, bruto: 0, desconto: 0, liquido: 0 };

  for (const p of pagamentos) {
    if (!pertenceACompetencia(p, competencia)) continue;
    // LEGACY-QUIRK(D11): bruto redondeado (+0,005 y trunca) en región y general.
    // CORRECAO(D11): bruto sin redondeo, igual al del cálculo (CALCBENF).
    // Sobre centavos enteros persistidos el redondeo es la identidad: D11 no tiene efecto
    // observable en los datos actuales (solo cambiaría con brutos de más de 2 decimales).
    const arr = corrigeD11 ? p.vlrBruto : brutoRelatorioCentavos(p.vlrBruto);

    // Región (BATCHREL:140–143): bruto `arr` (redondeado salvo CORRECAO(D11)); descuento y líquido sin redondeo.
    // LEGACY-QUIRK(D10) / CORRECAO(D10): la fila sale de `regiaoDe`, siempre presente en `nomesRegiao`.
    const r = regiaoPorNome.get(regiaoDe(p.codRegiao, quirks));
    if (!r) throw new Error("região sem linha no relatório");
    r.bruto += arr;
    r.desconto += p.vlrDescontoTotal;
    r.liquido += p.vlrLiquido;
    r.qtd += 1;

    // Status (BATCHREL:160–161): asimetría del legado — suma el VLR-BRUTO CRUDO, no #VLR-ARR.
    const s = status[indiceStatus(p.sitPagamento)] as LinhaStatus; // índice 0..4
    s.bruto += p.vlrBruto;
    s.qtd += 1;

    // General (BATCHREL:164–167): bruto `arr` (redondeado salvo CORRECAO(D11)); descuento y líquido sin redondeo.
    total.bruto += arr;
    total.desconto += p.vlrDescontoTotal;
    total.liquido += p.vlrLiquido;
    total.qtd += 1;
  }

  return { competencia, regioes, status, total };
}

/**
 * Pagos de la competencia ya agregados por la base (volumen): una fila por
 * región-del-beneficiario × status × `brutoNegativo`. Valores en centavos enteros.
 */
export type GrupoConsolidado = {
  /** `COD-REGIAO` del beneficiario; `null` = beneficiario inexistente. */
  codRegiao: number | null;
  sitPagamento: string;
  /**
   * `null`: todos los pagos del grupo tienen `vlrBruto >= 0`. Un número: todos los pagos
   * del grupo tienen exactamente ese `vlrBruto` (< 0) — ver `consolidarGrupos` (D11).
   */
  brutoNegativo: number | null;
  qtd: number;
  bruto: number;
  desconto: number;
  liquido: number;
};

/**
 * Mismo resultado que `consolidar` sobre las filas originales, pero a partir de grupos
 * ya agregados en SQL (story 7.2 con volumen). Reglas idénticas: región por `regiaoDe`
 * (D10), status por `indiceStatus`, bruto de región/general por `brutoRelatorioCentavos`
 * salvo CORRECAO(D11), bruto de status crudo.
 *
 * LEGACY-QUIRK(D11) sobre grupos: el redondeo (+0,005 y trunca) se aplica por pago. Para
 * centavos enteros ≥ 0 es la identidad (0,005 < 0,01), así que la suma de los redondeados
 * es la suma cruda = `brutoRelatorioCentavos(suma)`. Para negativos NO lo es (trunca hacia
 * cero: −1,00 → −0,99), por eso la base agrupa los negativos por valor y aquí se redondea
 * ese valor y se multiplica por la cantidad. El test de equivalencia lo verifica.
 */
export function consolidarGrupos(
  competencia: number,
  grupos: readonly GrupoConsolidado[],
  quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO,
): Consolidado {
  const corrigeD11 = corrige(quirks, "D11");
  const regioes: LinhaRegiao[] = nomesRegiao(quirks).map((nome) => ({ nome, qtd: 0, bruto: 0, desconto: 0, liquido: 0 }));
  const regiaoPorNome = new Map(regioes.map((r) => [r.nome, r] as const));
  const status: LinhaStatus[] = CODIGOS_STATUS.map((codigo, i) => ({ codigo, nome: NOMES_STATUS[i] as LinhaStatus["nome"], qtd: 0, bruto: 0 }));
  const total: TotalGeral = { qtd: 0, bruto: 0, desconto: 0, liquido: 0 };

  for (const g of grupos) {
    if (g.qtd <= 0) continue;
    if (g.brutoNegativo !== null && (g.brutoNegativo >= 0 || g.brutoNegativo * g.qtd !== g.bruto)) {
      throw new Error("grupo do consolidado inconsistente");
    }
    // LEGACY-QUIRK(D11): bruto redondeado por pago (ver arriba). CORRECAO(D11): crudo.
    const arr = corrigeD11
      ? g.bruto
      : g.brutoNegativo === null
        ? brutoRelatorioCentavos(g.bruto)
        : brutoRelatorioCentavos(g.brutoNegativo) * g.qtd;

    const r = regiaoPorNome.get(regiaoDe(g.codRegiao, quirks));
    if (!r) throw new Error("região sem linha no relatório");
    r.bruto += arr;
    r.desconto += g.desconto;
    r.liquido += g.liquido;
    r.qtd += g.qtd;

    // Status: asimetría del legado — VLR-BRUTO crudo.
    const s = status[indiceStatus(g.sitPagamento)] as LinhaStatus;
    s.bruto += g.bruto;
    s.qtd += g.qtd;

    total.bruto += arr;
    total.desconto += g.desconto;
    total.liquido += g.liquido;
    total.qtd += g.qtd;
  }

  return { competencia, regioes, status, total };
}

const texto = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim());

/**
 * Parámetros de `/relatorios/consolidado`: `competencia` en `AAAAMM` (campo
 * `Competencia`) o `AAAA-MM`. Ausente/vacía → 0 (informe no solicitado);
 * presente pero inválida → `null` ("Competência inválida.").
 */
export const filtroConsolidadoSchema = z.object({
  competencia: texto.transform((v): number | null => {
    if (!v) return 0;
    const m = /^([1-9]\d{3})-?(0[1-9]|1[0-2])$/.exec(v);
    return m ? Number(`${m[1]}${m[2]}`) : null;
  }),
});

export const MENSAGEM_COMPETENCIA_INVALIDA = "Competência inválida.";

export function lerFiltroConsolidado(sp: Record<string, string | string[] | undefined>): { competencia: number | null } {
  return filtroConsolidadoSchema.parse({ competencia: sp.competencia });
}
