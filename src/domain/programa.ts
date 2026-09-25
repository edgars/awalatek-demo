import { z } from "zod";
import { intParaData } from "./legacyDate";
import { aCentavos, dec, deCentavos, fatorParaString, formatarReais, truncar, truncarCasas } from "./money";

// Reglas del programa legado CADPROG (FR-PRG-01..04). TypeScript puro: sin Prisma ni Next.

/** Mensajes literales del legado (mayúsculas, sin tildes). */
export const MENSAGENS_PROGRAMA = {
  operacaoInvalida: "OPERACAO INVALIDA",
  naoEncontrado: "PROGRAMA NAO ENCONTRADO",
  jaCadastrado: "PROGRAMA JA CADASTRADO",
  incluidoSucesso: "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO:",
} as const;

export const MAX_FAIXAS = 5;
export const MAX_PARAMS_REGIONAIS = 6;

export const TIPOS_PROGRAMA = ["A", "P", "T"] as const;
export type TipoPrograma = (typeof TIPOS_PROGRAMA)[number];
export const ROTULOS_TIPO: Record<TipoPrograma, string> = {
  A: "Assistencial",
  P: "Previdenciário",
  T: "Trabalho",
};

export const ROTULOS_SITUACAO: Record<string, string> = { A: "Ativo", I: "Inativo", E: "Encerrado" };

// ---------------------------------------------------------------------------
// FR-PRG-01 — operaciones I/C

export type Operacao = "I" | "C";
export type ResultadoOperacao =
  | { ok: true; operacao: Operacao; consulta: boolean }
  | { ok: false; mensagem: string };

/**
 * La operación I/C del legado se sustituye por rutas; las acciones llaman a esta
 * función con valores fijos ("I" en la inclusión, "C" en la consulta).
 */
export function validarOperacao(op: string): ResultadoOperacao {
  // RK-d20a15a018e6 (CADPROG:51): operación distinta de I/C → "OPERACAO INVALIDA".
  if (op !== "I" && op !== "C") return { ok: false, mensagem: MENSAGENS_PROGRAMA.operacaoInvalida };
  // RK-a1d8765eea49 (CADPROG:56): operación C → rama de consulta.
  return { ok: true, operacao: op, consulta: op === "C" };
}

/** Resultado de la consulta por código. */
export function resultadoConsulta<T>(programa: T | null | undefined): { ok: true; programa: T } | { ok: false; mensagem: string } {
  // RK-7ca3bec5e5f6 (CADPROG:117): código inexistente → "PROGRAMA NAO ENCONTRADO".
  if (programa == null) return { ok: false, mensagem: MENSAGENS_PROGRAMA.naoEncontrado };
  return { ok: true, programa };
}

// ---------------------------------------------------------------------------
// FR-PRG-02 — unicidad

/** Devuelve el mensaje de error si el código ya existe; `null` si puede incluirse. */
export function verificarDuplicidade(jaExiste: boolean): string | null {
  // RK-1559882bffe4 (CADPROG:81): inclusión con código existente → "PROGRAMA JA CADASTRADO".
  return jaExiste ? MENSAGENS_PROGRAMA.jaCadastrado : null;
}

// ---------------------------------------------------------------------------
// FR-PRG-03 — FATOR-K y valor base ajustado

const CONSTANTE_FATOR_K = "0.347215";

/** FATOR-K como string N5.6 (truncado, como la asignación de Natural). */
export function calcularFatorK(fatorReajuste: string): string {
  // RK-275e4a632e83 (CADPROG:87): COMPUTE #FATOR-K = 1.00 + (#FATOR-REAJ * 0.347215)
  // LEGACY-QUIRK(D8): el valor base se graba ya × FATOR-K y E4 vuelve a aplicar
  // (1 + FATOR-REAJ). #FATOR-K es N5.6: la asignación trunca a 6 decimales.
  const bruto = dec("1.00").plus(dec(fatorReajuste).times(CONSTANTE_FATOR_K));
  return fatorParaString(truncarCasas(bruto, 6), 6);
}

/** Valor base (centavos) × FATOR-K, truncado a centavos (N9.2). */
export function calcularVlrBaseAjustado(vlrBaseCentavos: number, fatorK: string): number {
  // RK-bd6a7e52a48b (CADPROG:88): COMPUTE #VLR-CALC = #VLR-BASE * #FATOR-K
  // LEGACY-QUIRK(D8): se usa el FATOR-K ya truncado (N5.6) y el resultado se trunca a N9.2.
  return aCentavos(truncar(deCentavos(vlrBaseCentavos).times(truncarCasas(fatorK, 6))));
}

export function mensagemInclusao(vlrAjustadoCentavos: number): string {
  return `${MENSAGENS_PROGRAMA.incluidoSucesso} ${formatarReais(vlrAjustadoCentavos)}`;
}

// ---------------------------------------------------------------------------
// FR-PRG-04 — límites de los grupos (ADR-008: validados en el dominio)

export function validarLimiteFaixas(qtd: number): string | null {
  return qtd > MAX_FAIXAS ? `Limite de ${MAX_FAIXAS} faixas de cálculo excedido (máx. ${MAX_FAIXAS}).` : null;
}

export function validarLimiteParamsRegionais(qtd: number): string | null {
  return qtd > MAX_PARAMS_REGIONAIS
    ? `Limite de ${MAX_PARAMS_REGIONAIS} parâmetros regionais excedido (máx. ${MAX_PARAMS_REGIONAIS}).`
    : null;
}

// ---------------------------------------------------------------------------
// Esquemas zod (validación en el borde; reutilizados por las Server Actions)

const RE_FATOR_N3_4 = /^\d{1,3}(\.\d{1,4})?$/;
/** Máximo de centavos que cabe en la columna `Int` (32 bits) de Prisma/SQLite: R$ 21.474.836,47. */
export const MAX_CENTAVOS_INT32 = 2_147_483_647;

const centavos = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo}: valor inválido` })
    .int({ error: `${rotulo}: valor inválido` })
    .min(0, { error: `${rotulo}: não pode ser negativo` })
    .max(MAX_CENTAVOS_INT32, { error: `${rotulo}: valor acima do limite (máx. R$ 21.474.836,47)` });

const fatorN3_4 = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? "0" : s))
    .refine((s) => RE_FATOR_N3_4.test(s), { error: `${rotulo}: informe um decimal com até 4 casas` })
    .transform((s) => fatorParaString(s, 4));

const dataLegada = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo}: data inválida` })
    .int({ error: `${rotulo}: data inválida` })
    .refine(
      (n) => {
        if (n === 0) return true;
        try {
          return intParaData(n) !== null;
        } catch {
          return false;
        }
      },
      { error: `${rotulo}: data inválida` },
    );

const idade = (rotulo: string) =>
  z.coerce
    .number({ error: `${rotulo}: valor inválido` })
    .int({ error: `${rotulo}: valor inválido` })
    .min(0, { error: `${rotulo}: valor inválido` })
    .max(999, { error: `${rotulo}: máximo 3 dígitos` });

const simNao = (rotulo: string) => z.enum(["S", "N"], { error: `${rotulo}: informe S ou N` });

/** Código do programa: 1–4 caracteres [A-Z0-9] (DDM A4). */
export const codProgramaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,4}$/, { error: "Código: 1 a 4 letras ou números" });

export const inclusaoProgramaSchema = z.object({
  codPrograma: codProgramaSchema,
  nomePrograma: z
    .string()
    .trim()
    .min(1, { error: "Nome: obrigatório" })
    .max(60, { error: "Nome: máximo 60 caracteres" }),
  tipoPrograma: z.enum(TIPOS_PROGRAMA, { error: "Tipo: informe A, P ou T" }),
  vlrBase: centavos("Valor base"),
  codElegibilidade: z
    .string()
    .trim()
    .toUpperCase()
    .max(5, { error: "Código de elegibilidade: máximo 5 caracteres" })
    .transform((s) => (s === "" ? null : s)),
  dtInicio: dataLegada("Data início"),
  dtFim: dataLegada("Data fim"),
  rendaMaxima: centavos("Renda máxima"),
  idadeMin: idade("Idade mínima"),
  idadeMax: idade("Idade máxima"),
  fatorReajuste: fatorN3_4("Fator de reajuste"),
});
export type InclusaoPrograma = z.output<typeof inclusaoProgramaSchema>;

export const faixaCalculoSchema = z.object({
  rendaInicio: centavos("Renda início"),
  rendaFim: centavos("Renda fim"),
  fatorMultiplicador: fatorN3_4("Fator multiplicador"),
  vlrAdicional: centavos("Valor adicional"),
  indAcumulativo: simNao("Acumulativo"),
});
export type FaixaCalculo = z.output<typeof faixaCalculoSchema>;

export const paramRegionalSchema = z.object({
  codRegiao: z.coerce
    .number({ error: "Código região: valor inválido" })
    .int({ error: "Código região: valor inválido" })
    .min(1, { error: "Código região: 01 a 99" })
    .max(99, { error: "Código região: 01 a 99" }),
  fatorRegional: fatorN3_4("Fator regional"),
  vlrComplementoReg: centavos("Complemento"),
  indAtivoRegiao: simNao("Ativo"),
});
export type ParamRegional = z.output<typeof paramRegionalSchema>;

// ---------------------------------------------------------------------------
// Story 1.2 — alteración y cambio de situación (A ↔ I). Funcionalidad NUEVA, fuera
// del legado: CADPROG solo tiene I y C (FR-PRG-01). Decisión de diseño documentada
// en docs/prd.md (nota de FR-PRG-01) y docs/ux/DESIGN.md (4.3 / 4.3a).

export const MENSAGENS_ALTERACAO_PROGRAMA = {
  alteradoSucesso: "Programa alterado com sucesso.",
  versaoDesatualizada: "Programa alterado por outro usuário. Recarregue a página.",
  valorBaseObrigatorio: "Valor base: informe o valor base para recalcular com o novo fator de reajuste",
  jaInativo: "Programa já está inativo.",
  jaAtivo: "Programa já está ativo.",
  encerradoNaoReativa: "Programa encerrado não pode ser reativado.",
  somenteAtivoDesativa: "Somente programa ativo pode ser desativado.",
  semAlteracao: "Nenhuma alteração a gravar.",
  encerradoNaoAltera: "PROGRAMA ENCERRADO NAO PODE SER ALTERADO",
} as const;

/**
 * Código recibido en la ruta de alteración/situación: solo no vacío y ≤ 4 posiciones;
 * la existencia la decide la búsqueda en la base ("PROGRAMA NAO ENCONTRADO").
 */
export const codProgramaRotaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, { error: MENSAGENS_PROGRAMA.naoEncontrado })
  .max(4, { error: MENSAGENS_PROGRAMA.naoEncontrado });

/** Programa encerrado (E) no se altera; A e I sí (la alteración no cambia la situación). */
export function validarAlteracaoSituacao(sit: string): string | null {
  return sit === "E" ? MENSAGENS_ALTERACAO_PROGRAMA.encerradoNaoAltera : null;
}

export function podeAlterarPrograma(sit: string): boolean {
  return validarAlteracaoSituacao(sit) === null;
}

/** Textos de la auditoría (AL, tabla PROGRAMA). */
export const TABELA_AUDITORIA_PROGRAMA = "PROGRAMA";
export const DESCRICOES_AUDITORIA_PROGRAMA = {
  alteracao: "ALTERACAO PROGRAMA",
  desativado: "PROGRAMA DESATIVADO",
  reativado: "PROGRAMA REATIVADO",
} as const;

/**
 * Esquema de la alteración: mismas reglas y mensajes de la inclusión, sin el código
 * (inmutable, viene de la ruta). `vlrBase` vacío = "no cambia el valor base".
 */
export const alteracaoProgramaSchema = inclusaoProgramaSchema.omit({ codPrograma: true, vlrBase: true }).extend({
  vlrBase: z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? undefined : v),
    centavos("Valor base").optional(),
  ),
  numVersao: z.coerce
    .number({ error: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada })
    .int({ error: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada })
    .min(1, { error: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada }),
});
export type AlteracaoPrograma = z.output<typeof alteracaoProgramaSchema>;

export type ValorBaseGravado = { fatorReajuste: string; fatorK: string; vlrBaseIndividual: number };
export type DecisaoValorBase =
  | { ok: true; recalculado: false }
  | { ok: true; recalculado: true; fatorK: string; vlrBaseIndividual: number }
  | { ok: false; campo: "vlrBase"; mensagem: string };

/**
 * Valor base en la alteración ("igual que la inclusión", D8): si el operador informa el
 * valor base, se recalcula FATOR-K y se graba el valor ajustado como en la inclusión.
 * Sin valor base ni cambio de fator no se recalcula nada: el valor gravado ya está
 * × FATOR-K y aplicarlo otra vez lo duplicaría. Cambiar el fator exige informar el valor base.
 */
export function decidirValorBase(atual: ValorBaseGravado, novo: { vlrBase?: number; fatorReajuste: string }): DecisaoValorBase {
  const fatorMudou = fatorParaString(novo.fatorReajuste, 4) !== fatorParaString(atual.fatorReajuste, 4);
  if (novo.vlrBase === undefined) {
    if (fatorMudou) return { ok: false, campo: "vlrBase", mensagem: MENSAGENS_ALTERACAO_PROGRAMA.valorBaseObrigatorio };
    return { ok: true, recalculado: false };
  }
  // LEGACY-QUIRK(D8): mismo cálculo de la inclusión (RK-275e4a632e83, RK-bd6a7e52a48b).
  const fatorK = calcularFatorK(novo.fatorReajuste);
  const vlrBaseIndividual = calcularVlrBaseAjustado(novo.vlrBase, fatorK);
  if (vlrBaseIndividual > MAX_CENTAVOS_INT32) {
    return { ok: false, campo: "vlrBase", mensagem: "Valor ajustado acima do limite (máx. R$ 21.474.836,47)." };
  }
  return { ok: true, recalculado: true, fatorK, vlrBaseIndividual };
}

export type AcaoSituacao = "desativar" | "reativar";

/** Transición de situación: desactivar A → I; reactivar I → A. E (encerrado) no se reactiva. */
export function transicaoSituacao(
  atual: string,
  acao: AcaoSituacao,
): { ok: true; nova: "A" | "I"; descricao: string } | { ok: false; mensagem: string } {
  if (acao === "desativar") {
    if (atual === "I") return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.jaInativo };
    if (atual !== "A") return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.somenteAtivoDesativa };
    return { ok: true, nova: "I", descricao: DESCRICOES_AUDITORIA_PROGRAMA.desativado };
  }
  if (atual === "A") return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.jaAtivo };
  if (atual !== "I") return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.encerradoNaoReativa };
  return { ok: true, nova: "A", descricao: DESCRICOES_AUDITORIA_PROGRAMA.reativado };
}

/** Acción de situación que ofrece la UI: A → desativar, I → reativar, E → ninguna. */
export function acaoSituacaoDisponivel(sit: string): AcaoSituacao | null {
  return sit === "A" ? "desativar" : sit === "I" ? "reativar" : null;
}

/** Texto de la confirmación en la página. */
export function textoConfirmacaoSituacao(cod: string, acao: AcaoSituacao): string {
  return acao === "desativar"
    ? `Desativar o programa ${cod}? Beneficiários deste programa deixam de ser pagos no lote e são inelegíveis (PROGRAMA INATIVO).`
    : `Reativar o programa ${cod}? Beneficiários deste programa voltam a ser considerados no lote e na elegibilidade.`;
}

export function mensagemSituacao(cod: string, nova: "A" | "I"): string {
  return nova === "I" ? `Programa ${cod} desativado.` : `Programa ${cod} reativado.`;
}

// ---------------------------------------------------------------------------
// Resumen de auditoría de la alteración

/** Campos alterables del programa, en el orden del resumen de auditoría. */
export const CAMPOS_ALTERAVEIS_PROGRAMA = [
  "nomePrograma",
  "tipoPrograma",
  "dtCriacao",
  "dtEncerramento",
  "fatorReajuste",
  "codElegibilidade",
  "rendaMaxPercap",
  "idadeMin",
  "idadeMax",
  "fatorK",
  "vlrBaseIndividual",
] as const;
export type CampoAlteravelPrograma = (typeof CAMPOS_ALTERAVEIS_PROGRAMA)[number];
export type DadosAlteraveisPrograma = { [K in CampoAlteravelPrograma]?: string | number | null };

/**
 * Longitud de VLR-ANTERIOR / VLR-NOVO en la auditoría.
 * TODO(review): el DDM no fija el tamaño en el PRD/arquitectura; se asume A60 (ver conciliación).
 */
export const TAMANHO_VALOR_AUDITORIA = 60;

function fatorNormalizado(v: string, casas: number): string {
  try {
    return fatorParaString(v, casas);
  } catch {
    return v;
  }
}

/** Forma canónica para comparar: null/""/undefined iguales; factores con casas fijas. */
function normalizarCampo(campo: CampoAlteravelPrograma, v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v).trim();
  if (s === "") return "";
  if (campo === "fatorReajuste") return fatorNormalizado(s, 4);
  if (campo === "fatorK") return fatorNormalizado(s, 6);
  return s;
}

/** Escapa los separadores del resumen (`%`, `;`, `=`) con percent-encoding. */
function escaparValor(v: string): string {
  return v.replace(/[%;=]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/**
 * Campos que cambian (comparación normalizada) y el resumen `campo=valor;…` de cada lado,
 * con los valores escapados y cortado a `TAMANHO_VALOR_AUDITORIA`. Sin cambios → `campos` vacío.
 */
export function resumoAlteracaoPrograma(
  anterior: DadosAlteraveisPrograma,
  novo: DadosAlteraveisPrograma,
): { campos: CampoAlteravelPrograma[]; valorAnterior: string | null; valorPosterior: string | null } {
  const campos = CAMPOS_ALTERAVEIS_PROGRAMA.filter(
    (c) => c in novo && normalizarCampo(c, anterior[c]) !== normalizarCampo(c, novo[c]),
  );
  const resumo = (origem: DadosAlteraveisPrograma) =>
    campos.length
      ? campos
          .map((c) => `${c}=${escaparValor(normalizarCampo(c, origem[c]))}`)
          .join(";")
          .slice(0, TAMANHO_VALOR_AUDITORIA)
      : null;
  return { campos, valorAnterior: resumo(anterior), valorPosterior: resumo(novo) };
}

// ---------------------------------------------------------------------------
// Precarga del formulario de alteración con datos gravados (legados o inconsistentes)

/** Fecha AAAAMMDD gravada → la misma si es una fecha de calendario válida; si no, 0 (campo vacío). */
export function dataGravadaParaFormulario(dt: number): number {
  try {
    const iso = intParaData(dt);
    if (!iso) return 0;
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? dt : 0;
  } catch {
    return 0;
  }
}

/** Fator gravado → N3.4 canónico; inválido → vacío. */
export function fatorGravadoParaFormulario(fator: string): string {
  const s = fator.trim();
  if (!RE_FATOR_N3_4.test(s)) {
    try {
      return RE_FATOR_N3_4.test(fatorParaString(s, 4)) ? fatorParaString(s, 4) : "";
    } catch {
      return "";
    }
  }
  return fatorParaString(s, 4);
}

/** Tipo gravado → el mismo si es A/P/T; si no, vacío (opción "Selecione…"). */
export function tipoGravadoParaFormulario(tipo: string): TipoPrograma | "" {
  return (TIPOS_PROGRAMA as readonly string[]).includes(tipo) ? (tipo as TipoPrograma) : "";
}
