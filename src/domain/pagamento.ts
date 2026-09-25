import { z } from "zod";

// Consulta de pagos (story 4.4) — requisito técnico, sin reglas legadas.
// TypeScript puro: sin Prisma ni Next. Los pagos solo se leen (ADR-009).

export const MENSAGENS_PAGAMENTO = {
  naoEncontrado: "PAGAMENTO NAO ENCONTRADO",
} as const;

// LEGACY-QUIRK(D15): dominios del código legado (no los del DDM).
export const SITUACOES_PAGAMENTO = ["G", "P", "C", "D", "E"] as const;
export type SituacaoPagamento = (typeof SITUACOES_PAGAMENTO)[number];
export const ROTULOS_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  G: "Gerado",
  P: "Pago",
  C: "Cancelado",
  D: "Devolvido",
  E: "Estornado",
};

// LEGACY-QUIRK(D15): tipo de pago N/D/T del código.
export const TIPOS_PAGAMENTO = ["N", "D", "T"] as const;
export type TipoPagamento = (typeof TIPOS_PAGAMENTO)[number];
export const ROTULOS_TIPO_PAGAMENTO: Record<TipoPagamento, string> = {
  N: "Normal",
  D: "Décimo",
  T: "Terceiro",
};

/** `G` → `G — Gerado`; código desconocido → el código solo. */
export function rotuloSituacaoPagamento(sit: string): string {
  return rotuloDominio(ROTULOS_SITUACAO_PAGAMENTO, sit);
}

export function rotuloTipoPagamento(tipo: string): string {
  return rotuloDominio(ROTULOS_TIPO_PAGAMENTO, tipo);
}

// LEGACY-QUIRK(D15): tipo de descuento C/I/J/S/P/A del código (el DDM dice IR/JD/CS/…).
export const ROTULOS_TIPO_DESCONTO: Record<string, string> = {
  C: "Contribuição social",
  I: "Imposto retido",
  J: "Judicial",
  S: "Sindical",
  P: "Pensão alimentícia",
  A: "Administrativo",
};

// TODO(review): el DDM solo da el dominio C/D/P/N de SIT-CONCILIACAO; los rótulos
// son la lectura más probable y debe confirmarlos E6 (conciliación CNAB 240).
export const ROTULOS_SITUACAO_CONCILIACAO: Record<string, string> = {
  C: "Conciliado",
  D: "Divergente",
  P: "Pendente",
  N: "Não conciliado",
};

/** `código — rótulo` para dominios cerrados; código desconocido → el código solo. */
export function rotuloDominio(rotulos: Record<string, string>, codigo: string): string {
  // Object.hasOwn: códigos como "toString" no devuelven miembros del prototipo.
  const r = Object.hasOwn(rotulos, codigo) ? rotulos[codigo] : undefined;
  return r ? `${codigo} — ${r}` : codigo;
}

const texto = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((v) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim());

/**
 * Filtros de la lista `/pagamentos` (query string). Valores inválidos se descartan
 * (filtro vacío) en vez de fallar: la lista nunca da error por la URL.
 * - CPF: solo coincidencia exacta de 11 dígitos (admite máscara), como en 2.1 (LGPD);
 *   un CPF incompleto no coincide con nada.
 * - Competência: `AAAA-MM` (input month) o `AAAAMM`.
 */
export const filtrosPagamentosSchema = z.object({
  // "" = sin filtro; `null` = informado pero incompleto → ninguna coincidencia
  // (una búsqueda parcial permitiría enumerar CPFs).
  cpf: texto.transform((v): string | null => {
    if (!v) return "";
    const d = v.replace(/\D/g, "");
    return d.length === 11 && /^[\d.\-\s]+$/.test(v) ? d : null;
  }),
  competencia: texto.transform((v) => {
    const m = /^([1-9]\d{3})-?(0[1-9]|1[0-2])$/.exec(v);
    return m ? Number(`${m[1]}${m[2]}`) : 0;
  }),
  programa: texto.transform((v) => {
    const c = v.toUpperCase();
    return /^[A-Z0-9]{1,4}$/.test(c) ? c : "";
  }),
  situacao: texto.transform((v) => {
    const s = v.toUpperCase();
    return (SITUACOES_PAGAMENTO as readonly string[]).includes(s) ? s : "";
  }),
  pagina: texto.transform((v) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }),
});

export type FiltrosPagamentos = z.output<typeof filtrosPagamentosSchema>;

export function lerFiltrosPagamentos(sp: Record<string, string | string[] | undefined>): FiltrosPagamentos {
  return filtrosPagamentosSchema.parse(normalizarParams(sp));
}

/** Máximo de `numPagamento` (Int de SQLite/Prisma, 32 bits). */
export const MAX_NUM_PAGAMENTO = 2147483647;

/** Número de pago de la ruta `/pagamentos/[num]`: entero en 1..MAX_NUM_PAGAMENTO o `null`. */
export function lerNumPagamento(num: string): number | null {
  if (!/^\d{1,10}$/.test(num)) return null;
  const n = Number(num);
  return n >= 1 && n <= MAX_NUM_PAGAMENTO ? n : null;
}

export type VarianteBadge = "success" | "warning" | "secondary" | "destructive" | "default";

/** Variante visual del badge de situação, igual en la lista y el detalle. */
export const VARIANTE_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, VarianteBadge> = {
  G: "default",
  P: "success",
  C: "destructive",
  D: "warning",
  E: "secondary",
};

export function varianteSituacaoPagamento(sit: string): VarianteBadge {
  return Object.hasOwn(VARIANTE_SITUACAO_PAGAMENTO, sit) ? VARIANTE_SITUACAO_PAGAMENTO[sit as SituacaoPagamento] : "secondary";
}

/** Primer valor string de un parámetro de query (`?cpf=a&cpf=b` → `"a"`); ausente → `""`. */
export function primeiroValor(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

/** Normaliza los parámetros de la lista a su primer valor (filtros y enlaces coinciden). */
export function normalizarParams(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const k of ["cpf", "competencia", "programa", "situacao", "pagina"]) r[k] = primeiroValor(sp[k]);
  return r;
}
