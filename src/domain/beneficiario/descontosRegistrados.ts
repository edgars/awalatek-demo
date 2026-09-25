import { z } from "zod";
import { intParaData } from "../legacyDate";
import { fatorParaString } from "../money";
import { MAX_CENTAVOS_INT32 } from "../programa";

// Descuentos registrados del beneficiario (story 2.5, técnica, sin RK). Son la
// entrada del recálculo de descuentos de E4 (FR-DSC). TypeScript puro: sin Prisma ni Next.
//
// LEGACY-QUIRK(D14): CALCDSCT lee los descuentos del beneficiario (PE DESCONTOS);
// el DDM los ubica en el pago. Aquí se registran como hijos de Beneficiario;
// los descuentos *aplicados* a un pago van en PagamentoDesconto (E4).

/** Máximo de ocurrencias del PE DESCONTOS (ADR-008: validado en el dominio). */
export const MAX_DESCONTOS = 8;
/** Ancho del número de proceso (A20). */
export const TAMANHO_NUM_PROCESSO = 20;

/** LEGACY-QUIRK(D15): dominio del **código** (CALCDSCT), no el del DDM. */
export const TIPOS_DESCONTO = ["C", "I", "J", "S", "P", "A"] as const;
export type TipoDesconto = (typeof TIPOS_DESCONTO)[number];
export const ROTULOS_TIPO_DESCONTO: Record<TipoDesconto, string> = {
  C: "Contribuição",
  I: "Imposto",
  J: "Judicial",
  S: "Sindical",
  P: "Pensão alimentícia",
  A: "Administrativo",
};

export const MENSAGENS_DESCONTOS = {
  beneficiarioNaoEncontrado: "BENEFICIARIO NAO ENCONTRADO",
  processoObrigatorio: "Nº processo: obrigatório para desconto judicial (J)",
  valorOuPercentual: "Valor ou percentual: informe um deles maior que zero",
  datasInvertidas: "Data fim: deve ser igual ou posterior à data início",
} as const;

export function validarLimiteDescontos(qtd: number): string | null {
  return qtd > MAX_DESCONTOS ? `Limite de ${MAX_DESCONTOS} descontos excedido (máx. ${MAX_DESCONTOS}).` : null;
}

export function mensagemGravados(qtd: number): string {
  return `Descontos gravados (${qtd}).`;
}

// ---------------------------------------------------------------------------
// Esquema por fila (validación en el borde; las entradas se truncan al ancho del campo)

const RE_PCT_N3_2 = /^\d{1,3}(\.\d{1,2})?$/;

const centavos = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo}: valor inválido` })
    .int({ error: `${rotulo}: valor inválido` })
    .min(0, { error: `${rotulo}: não pode ser negativo` })
    .max(MAX_CENTAVOS_INT32, { error: `${rotulo}: valor acima do limite (máx. R$ 21.474.836,47)` });

const dataValida = (n: number): boolean => {
  if (n === 0) return true;
  try {
    return intParaData(n) !== null;
  } catch {
    return false;
  }
};

const dataLegada = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo}: data inválida` })
    .int({ error: `${rotulo}: data inválida` })
    .refine(dataValida, { error: `${rotulo}: data inválida` });

/** Campos de la fila ya convertidos (lo que se graba). */
export type DescontoRegistrado = {
  tipoDesconto: TipoDesconto;
  /** Valor fijo en centavos. */
  vlrDesconto: number;
  /** Porcentaje N3.2 como string (`"10.00"`). */
  pctDesconto: string;
  /** AAAAMMDD (obligatoria). */
  dtInicioDsct: number;
  /** AAAAMMDD; 0 = indefinido. */
  dtFimDsct: number;
  numProcesso: string | null;
};

type CampoDesconto = keyof DescontoRegistrado;

/** Validaciones cruzadas de una fila ya convertida: `[campo, mensagem]` en orden. */
export function errosDoDesconto(d: DescontoRegistrado): [CampoDesconto, string][] {
  const erros: [CampoDesconto, string][] = [];
  if (d.tipoDesconto === "J" && !d.numProcesso) erros.push(["numProcesso", MENSAGENS_DESCONTOS.processoObrigatorio]);
  // Sindical (S) se calcula sobre el bruto (1 %): no exige valor ni porcentaje.
  if (d.tipoDesconto !== "S" && d.vlrDesconto <= 0 && Number(d.pctDesconto) <= 0) {
    erros.push(["vlrDesconto", MENSAGENS_DESCONTOS.valorOuPercentual]);
  }
  if (d.dtFimDsct !== 0 && d.dtFimDsct < d.dtInicioDsct) erros.push(["dtFimDsct", MENSAGENS_DESCONTOS.datasInvertidas]);
  return erros;
}

export const descontoRegistradoSchema = z
  .object({
    tipoDesconto: z
      .string()
      .trim()
      .toUpperCase()
      .transform((s) => s.slice(0, 1))
      .pipe(z.enum(TIPOS_DESCONTO, { error: "Tipo: informe C, I, J, S, P ou A" })),
    vlrDesconto: centavos("Valor"),
    pctDesconto: z
      .string()
      .trim()
      .transform((s) => (s === "" ? "0" : s))
      .refine((s) => RE_PCT_N3_2.test(s), { error: "Percentual: informe um decimal com até 2 casas (máx. 999,99)" })
      .transform((s) => fatorParaString(s, 2)),
    dtInicioDsct: dataLegada("Data início").refine((n) => n !== 0, { error: "Data início: obrigatória" }),
    dtFimDsct: dataLegada("Data fim"),
    numProcesso: z
      .string()
      .trim()
      .transform((s) => s.slice(0, TAMANHO_NUM_PROCESSO).trim() || null),
  })
  .superRefine((d, ctx) => {
    for (const [campo, mensagem] of errosDoDesconto(d)) ctx.addIssue({ code: "custom", path: [campo], message: mensagem });
  });

export const CAMPOS_DESCONTO = ["tipoDesconto", "vlrDesconto", "pctDesconto", "dtInicioDsct", "dtFimDsct", "numProcesso"] as const;

export type ValidacaoDescontos =
  | { ok: true; filas: DescontoRegistrado[] }
  | { ok: false; mensagens: string[]; erros: Record<string, string> };

/**
 * Valida el grupo completo: límite (máx. 8) y cada fila. Mensajes por fila
 * "Desconto n — …"; `erros` indexados por `"<índice>.<campo>"`.
 */
export function validarDescontosRegistrados(linhas: readonly unknown[]): ValidacaoDescontos {
  const limite = validarLimiteDescontos(linhas.length);
  if (limite) return { ok: false, mensagens: [limite], erros: {} };

  const filas: DescontoRegistrado[] = [];
  const mensagens: string[] = [];
  const erros: Record<string, string> = {};
  linhas.forEach((linha, i) => {
    const r = descontoRegistradoSchema.safeParse(linha);
    if (r.success) filas.push(r.data);
    else
      for (const issue of r.error.issues) {
        mensagens.push(`Desconto ${i + 1} — ${issue.message}`);
        erros[`${i}.${issue.path.join(".")}`] ??= issue.message;
      }
  });
  return mensagens.length ? { ok: false, mensagens, erros } : { ok: true, filas };
}
