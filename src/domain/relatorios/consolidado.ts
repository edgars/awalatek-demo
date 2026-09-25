import { z } from "zod";
import { aCentavos, deCentavos, redondear, type Dinheiro, type ValorDecimal } from "@/domain/money";

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

export type LinhaRegiao = { nome: (typeof NOMES_REGIAO)[number]; qtd: number; bruto: number; desconto: number; liquido: number };
export type LinhaStatus = { codigo: (typeof CODIGOS_STATUS)[number]; nome: (typeof NOMES_STATUS)[number]; qtd: number; bruto: number };
export type TotalGeral = { qtd: number; bruto: number; desconto: number; liquido: number };
export type Consolidado = { competencia: number; regioes: LinhaRegiao[]; status: LinhaStatus[]; total: TotalGeral };

/** Índice (0..4) del acumulador de región para `COD-REGIAO` (BATCHREL:117–133). */
export function indiceRegiao(codRegiao: number | null): number {
  // FIND sin coincidencia deja #COD-REG = 0 (BATCHREL:111–114) → cae en "resto".
  const cod = codRegiao ?? 0;
  // LEGACY-QUIRK(D10): el DDM describe COD-REGIAO como 01-05 o 99 (5 macrorregiones),
  // pero BATCHREL agrupa los códigos 1–25 de a 5 y manda todo lo demás (21–25, 99, 0,
  // beneficiario inexistente) a CENTRO-OESTE. Se replica tal cual.
  // RK-d8b1ac2e14eb (BATCHREL:117) — IF #COD-REG >= 1 AND #COD-REG <= 5 → NORTE
  if (cod >= 1 && cod <= 5) return 0;
  // RK-0cdc90e2bd81 (BATCHREL:120) — IF #COD-REG >= 6 AND #COD-REG <= 10 → NORDESTE
  if (cod >= 6 && cod <= 10) return 1;
  // RK-8b828d08f033 (BATCHREL:123) — IF #COD-REG >= 11 AND #COD-REG <= 15 → SUDESTE
  if (cod >= 11 && cod <= 15) return 2;
  // RK-893670f64c20 (BATCHREL:126) — IF #COD-REG >= 16 AND #COD-REG <= 20 → SUL; ELSE → CENTRO-OESTE
  if (cod >= 16 && cod <= 20) return 3;
  return 4;
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
 * `brutoRelatorio` en centavos enteros.
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
 * Consolida los pagos de la competencia. Las 5 regiones y los 5 status aparecen
 * siempre (en cero si no hay pagos), igual que los FOR 1 TO 5 del legado.
 */
export function consolidar(competencia: number, pagamentos: readonly PagamentoConsolidado[]): Consolidado {
  const regioes: LinhaRegiao[] = NOMES_REGIAO.map((nome) => ({ nome, qtd: 0, bruto: 0, desconto: 0, liquido: 0 }));
  const status: LinhaStatus[] = CODIGOS_STATUS.map((codigo, i) => ({ codigo, nome: NOMES_STATUS[i] as LinhaStatus["nome"], qtd: 0, bruto: 0 }));
  const total: TotalGeral = { qtd: 0, bruto: 0, desconto: 0, liquido: 0 };

  for (const p of pagamentos) {
    if (!pertenceACompetencia(p, competencia)) continue;
    const arr = brutoRelatorioCentavos(p.vlrBruto); // LEGACY-QUIRK(D11)

    // Región (BATCHREL:140–143): bruto redondeado; descuento y líquido sin redondeo.
    const r = regioes[indiceRegiao(p.codRegiao)] as LinhaRegiao; // índice 0..4 — LEGACY-QUIRK(D10)
    r.bruto += arr;
    r.desconto += p.vlrDescontoTotal;
    r.liquido += p.vlrLiquido;
    r.qtd += 1;

    // Status (BATCHREL:160–161): asimetría del legado — suma el VLR-BRUTO CRUDO, no #VLR-ARR.
    const s = status[indiceStatus(p.sitPagamento)] as LinhaStatus; // índice 0..4
    s.bruto += p.vlrBruto;
    s.qtd += 1;

    // General (BATCHREL:164–167): bruto redondeado; descuento y líquido sin redondeo.
    total.bruto += arr;
    total.desconto += p.vlrDescontoTotal;
    total.liquido += p.vlrLiquido;
    total.qtd += 1;
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
