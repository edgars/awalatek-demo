import { z } from "zod";
import { normalizaCpfNumerico } from "../cpf";

// Reglas del programa legado CADDEPEND (FR-DEP-01..05). TypeScript puro: sin Prisma ni Next.
// CADDEPEND solo incluye (no edita ni borra) y no registra auditoría.

/** Mensajes literales del legado (mayúsculas, sin tildes). */
export const MENSAGENS_CADDEPEND = {
  naoEncontrado: "BENEFICIARIO NAO ENCONTRADO",
  canceladoDesligado: "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO",
  limiteAtingido: "LIMITE DE DEPENDENTES ATINGIDO",
  nomeObrigatorio: "NOME DO DEPENDENTE OBRIGATORIO",
  parentescoInvalido: "PARENTESCO INVALIDO",
  cpfDuplicado: "DEPENDENTE JA CADASTRADO (CPF DUPLICADO)",
  incluidoTotal: "DEPENDENTE INCLUIDO - TOTAL:",
  incluirOutro: "INCLUIR OUTRO DEPENDENTE? (S/N)",
} as const;

/** Mensajes del sistema nuevo (sin equivalente en el legado). */
export const MENSAGENS_SISTEMA_DEPENDENTES = {
  concorrencia: "Os dependentes do titular foram alterados por outra operação. Recarregue a página e tente novamente.",
} as const;

/** "DEPENDENTE INCLUIDO - TOTAL: n" */
export function mensagemIncluido(total: number): string {
  return `${MENSAGENS_CADDEPEND.incluidoTotal} ${total}`;
}

/** Parentescos del código de CADDEPEND (D15: dominio del código, no el del DDM). */
export const PARENTESCOS = ["FI", "CO", "IR", "OU"] as const;
export type Parentesco = (typeof PARENTESCOS)[number];
export const ROTULOS_PARENTESCO: Record<string, string> = { FI: "Filho", CO: "Cônjuge", IR: "Irmão", OU: "Outro" };

/** Situaciones del titular que impiden incluir dependientes. */
export const SITUACOES_BLOQUEADAS = ["C", "D"] as const;

/**
 * LEGACY-QUIRK(D6): el legado corta con `numDependentes > 5`, así que permite llegar a 6
 * (el DDM admite 10 ocurrencias). Se replica tal cual.
 */
export const LIMITE_CORTE_DEPENDENTES = 5;

/** Titular tal como lo ve CADDEPEND. */
export type TitularDependentes = { sitBeneficiario: string; numDependentes: number };

/**
 * FR-DEP-01: titular identificado por CPF. `null` = no encontrado.
 * Devuelve el mensaje que impide incluir o `null` si puede seguir.
 */
export function verificarTitular(titular: TitularDependentes | null): string | null {
  // RK-6badeec05527 (CADDEPEND:51): FIND sin registros → "BENEFICIARIO NAO ENCONTRADO".
  if (!titular) return MENSAGENS_CADDEPEND.naoEncontrado;
  // RK-7f25da1eeff3 (CADDEPEND:56): status C o D → "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO".
  if ((SITUACOES_BLOQUEADAS as readonly string[]).includes(titular.sitBeneficiario)) {
    return MENSAGENS_CADDEPEND.canceladoDesligado;
  }
  return null;
}

/** FR-DEP-02: se evalúa antes de **cada** inclusión. */
export function verificarLimite(numDependentes: number): string | null {
  // RK-728f8d2bc779 (CADDEPEND:63): IF NUM-DEPENDENTES > 5 → "LIMITE DE DEPENDENTES ATINGIDO".
  // LEGACY-QUIRK(D6): `> 5` (no `>= 5`): con 5 dependientes todavía se incluye el 6.º.
  if (numDependentes > LIMITE_CORTE_DEPENDENTES) return MENSAGENS_CADDEPEND.limiteAtingido;
  return null;
}

/** Datos del dependiente que CADDEPEND valida. */
export type DadosValidacaoDependente = { nomeDependente: string; parentesco: string };

/**
 * FR-DEP-03: el legado escribe cada mensaje, así que se devuelven **todos** los errores
 * (nombre y parentesco) y no solo el primero.
 */
export function validarDadosDependente(dados: DadosValidacaoDependente): string[] {
  const erros: string[] = [];
  // RK-cf0d5200aad9 (CADDEPEND:79): nombre en blanco → "NOME DO DEPENDENTE OBRIGATORIO".
  if ((dados.nomeDependente ?? "").trim() === "") erros.push(MENSAGENS_CADDEPEND.nomeObrigatorio);
  // RK-bba959226637 (CADDEPEND:84): parentesco fuera de FI/CO/IR/OU → "PARENTESCO INVALIDO".
  if (!(PARENTESCOS as readonly string[]).includes((dados.parentesco ?? "").trim().toUpperCase())) {
    erros.push(MENSAGENS_CADDEPEND.parentescoInvalido);
  }
  return erros;
}

/** CPF del dependiente normalizado a N11; vacío o 0 → `null` (sin CPF, unique nullable). */
export function normalizaCpfDependente(texto: string | null | undefined): string | null {
  const cpf = normalizaCpfNumerico(texto ?? "");
  return /[1-9]/.test(cpf) ? cpf : null;
}

/** Ocurrencia del PE ya grabada. */
export type OcorrenciaDependente = { occurrence: number; cpfDependente: string | null };

/**
 * FR-DEP-04: el legado recorre las ocurrencias 1..NUM-DEPENDENTES del titular; las
 * ocurrencias por encima del contador no cuentan.
 */
export function cpfDuplicado(cpf: string | null, ocorrencias: readonly OcorrenciaDependente[], numDependentes: number): boolean {
  if (!cpf) return false;
  return ocorrencias.some((o) => o.occurrence >= 1 && o.occurrence <= numDependentes && o.cpfDependente === cpf);
}

/** Ocurrencia del PE donde se escribe el nuevo dependiente: `MOVE ... (#IDX)` con #IDX = n + 1. */
export function proximaOcorrencia(numDependentes: number): number {
  return numDependentes + 1;
}

export type DadosInclusaoDependente = DadosValidacaoDependente & { cpfDependente: string | null };

export type DecisaoInclusao = { ok: true; occurrence: number; total: number } | { ok: false; mensagens: string[] };

/**
 * Secuencia completa de CADDEPEND para una inclusión: titular → límite → datos →
 * duplicado. Con cualquier error no se graba y se vuelve a pedir el dependiente.
 */
export function decidirInclusao(
  titular: TitularDependentes | null,
  dados: DadosInclusaoDependente,
  ocorrencias: readonly OcorrenciaDependente[],
): DecisaoInclusao {
  const erroTitular = verificarTitular(titular);
  if (erroTitular || !titular) return { ok: false, mensagens: [erroTitular ?? MENSAGENS_CADDEPEND.naoEncontrado] };
  const erroLimite = verificarLimite(titular.numDependentes);
  if (erroLimite) return { ok: false, mensagens: [erroLimite] };

  const erros = validarDadosDependente(dados);
  // RK-4dfeeb238cf7 (CADDEPEND:90): IF #ERRO → no graba y vuelve a pedir el dependiente.
  if (erros.length) return { ok: false, mensagens: erros };

  // RK-d08414712f34 (CADDEPEND:97): CPF ≠ 0 repetido entre las ocurrencias → "DEPENDENTE JA CADASTRADO (CPF DUPLICADO)".
  const dup = cpfDuplicado(dados.cpfDependente, ocorrencias, titular.numDependentes);
  // RK-f8707d9be137 (CADDEPEND:105): IF #ERRO → no graba y vuelve a pedir el dependiente.
  if (dup) return { ok: false, mensagens: [MENSAGENS_CADDEPEND.cpfDuplicado] };

  const occurrence = proximaOcorrencia(titular.numDependentes);
  return { ok: true, occurrence, total: occurrence };
}

/**
 * RK-db6fc93c9e4c (CADDEPEND:126): tras cada inclusión, "INCLUIR OUTRO DEPENDENTE? (S/N)";
 * cualquier respuesta distinta de S termina. En la pantalla: "Incluir outro dependente" = S,
 * "Concluir" = N.
 */
export function continuarInclusao(resposta: string): boolean {
  return (resposta ?? "").trim().toUpperCase() === "S";
}

// ---------------------------------------------------------------------------
// Esquema zod (borde). Nombre y parentesco solo se normalizan: sus mensajes los
// decide validarDadosDependente. Fecha y CPF no se validan (el legado no valida).

export const SEXOS_DEPENDENTE = ["M", "F"] as const;

export const dependenteSchema = z.object({
  nomeDependente: z.string().trim().toUpperCase().max(60, { error: "Nome: máximo 60 caracteres" }),
  dtNascDepend: z
    .string()
    .trim()
    .transform((s) => (s === "" ? 0 : /^\d{1,8}$/.test(s) ? Number(s) : Number.NaN))
    .pipe(z.number({ error: "Data de nascimento: data inválida" }).int({ error: "Data de nascimento: data inválida" })),
  parentesco: z.string().trim().toUpperCase(),
  cpfDependente: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s.length <= 11, { error: "CPF: máximo 11 dígitos" })
    .transform((s) => normalizaCpfDependente(s)),
  docDependente: z
    .string()
    .trim()
    .toUpperCase()
    .max(15, { error: "Documento: máximo 15 caracteres" })
    .transform((s) => (s === "" ? null : s)),
  sexoDependente: z
    .string()
    .trim()
    .toUpperCase()
    .refine((s) => s === "" || (SEXOS_DEPENDENTE as readonly string[]).includes(s), { error: "Sexo: informe M ou F" })
    .transform((s) => (s === "" ? null : s)),
});
export type DadosDependente = z.output<typeof dependenteSchema>;

export const CAMPOS_FORMULARIO_DEPENDENTE = Object.keys(dependenteSchema.shape) as (keyof typeof dependenteSchema.shape)[];

/** Campo de pantalla al que corresponde cada mensaje (para mostrarlo junto al control). */
export function campoDoErroDependente(mensagem: string): string | undefined {
  switch (mensagem) {
    case MENSAGENS_CADDEPEND.nomeObrigatorio:
      return "nomeDependente";
    case MENSAGENS_CADDEPEND.parentescoInvalido:
      return "parentesco";
    case MENSAGENS_CADDEPEND.cpfDuplicado:
      return "cpfDependente";
    default:
      return undefined;
  }
}
