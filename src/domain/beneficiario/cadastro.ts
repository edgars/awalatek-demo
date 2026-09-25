import { z } from "zod";
import { MSG_CPF_INVALIDO, validaModulo11 } from "../cpf";
import { idadePorAno, intParaData } from "../legacyDate";
import { codProgramaSchema } from "../programa";
import { corrige, QUIRKS_PADRAO, type Quirks } from "../quirks";

// Reglas del programa legado CADBENEF (FR-BEN-01/02/04/05). TypeScript puro: sin Prisma ni Next.
// CADBENEF no registra auditoría.

/** Mensajes literales del legado (mayúsculas, sin tildes). */
export const MENSAGENS_CADBENEF = {
  operacaoInvalida: "OPERACAO INVALIDA - INFORME I OU A",
  cpfObrigatorio: "CPF OBRIGATORIO",
  cpfInvalido: MSG_CPF_INVALIDO,
  nomeObrigatorio: "NOME OBRIGATORIO",
  dataNascimentoObrigatoria: "DATA NASCIMENTO OBRIGATORIA",
  sexoInvalido: "SEXO INVALIDO",
  jaCadastrado: "BENEFICIARIO JA CADASTRADO",
  naoEncontradoAlteracao: "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO",
  incluidoSucesso: "BENEFICIARIO INCLUIDO COM SUCESSO",
  alteradoSucesso: "BENEFICIARIO ALTERADO COM SUCESSO",
} as const;

/** Mensajes del sistema nuevo (sin equivalente en el legado). */
export const MENSAGENS_SISTEMA = {
  nisDuplicado: "NIS já cadastrado para outro beneficiário.",
  versaoDesatualizada: "O beneficiário foi alterado por outra operação. Recarregue a página e tente novamente.",
  campoNaoEditavel: "Campo não editável na alteração:",
  suspensoPorIdade: "Situação ajustada para SUSPENSO (idade > 75 — regra legada)",
} as const;

export const OPERACOES = ["I", "A"] as const;
export type OperacaoCadastro = (typeof OPERACOES)[number];

export const SEXOS = ["M", "F"] as const;
export const ROTULOS_SEXO: Record<string, string> = { M: "Masculino", F: "Feminino" };

export const SITUACOES_BENEFICIARIO = ["A", "S", "C", "I", "D"] as const;
export type SituacaoBeneficiario = (typeof SITUACOES_BENEFICIARIO)[number];
export const ROTULOS_SITUACAO_BENEFICIARIO: Record<string, string> = {
  A: "Ativo",
  S: "Suspenso",
  C: "Cancelado",
  I: "Inativo",
  D: "Desligado",
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Idade (em anos, por ano) acima da qual o beneficiário é suspenso. */
export const IDADE_LIMITE_SUSPENSAO = 75;

/** Campos que la pantalla legada valida en secuencia. */
export type DadosValidacaoCadastro = {
  numCpf: string;
  nomeCompleto: string;
  dtNascimento: number;
  sexo: string;
};

/**
 * Validación secuencial de CADBENEF: devuelve el **primer** mensaje de error
 * (un solo mensaje) o `null` si puede grabarse. `existe` = el CPF ya está registrado.
 */
export function validarCadastro(op: string, dados: DadosValidacaoCadastro, existe: boolean): string | null {
  // RK-c83257ae5f85 (CADBENEF:99): operación distinta de I/A → "OPERACAO INVALIDA - INFORME I OU A".
  if (op !== "I" && op !== "A") return MENSAGENS_CADBENEF.operacaoInvalida;
  // RK-40623cadda7c (CADBENEF:105): CPF = 0 → "CPF OBRIGATORIO".
  if (!/[1-9]/.test(dados.numCpf ?? "")) return MENSAGENS_CADBENEF.cpfObrigatorio;
  // RK-bc7d67f3dad4 (CADBENEF:113): módulo 11 inválido (utilidad de E0, no se reimplementa).
  if (!validaModulo11(dados.numCpf)) return MENSAGENS_CADBENEF.cpfInvalido;
  // RK-e1aba7261a6b (CADBENEF:119): nombre en blanco → "NOME OBRIGATORIO".
  if ((dados.nomeCompleto ?? "").trim() === "") return MENSAGENS_CADBENEF.nomeObrigatorio;
  // RK-a14601290959 (CADBENEF:125): fecha de nacimiento = 0 → "DATA NASCIMENTO OBRIGATORIA".
  if (!dados.dtNascimento) return MENSAGENS_CADBENEF.dataNascimentoObrigatoria;
  // RK-e17b444be69b (CADBENEF:131): sexo distinto de M/F → "SEXO INVALIDO".
  if (dados.sexo !== "M" && dados.sexo !== "F") return MENSAGENS_CADBENEF.sexoInvalido;
  // RK-7d4387e99f5a (CADBENEF:143): inclusión con CPF existente → "BENEFICIARIO JA CADASTRADO".
  if (op === "I" && existe) return MENSAGENS_CADBENEF.jaCadastrado;
  // RK-2f8766f52e1b (CADBENEF:149): alteración con CPF inexistente → "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO".
  if (op === "A" && !existe) return MENSAGENS_CADBENEF.naoEncontradoAlteracao;
  return null;
}

/**
 * RK-07ac728d731a (CADBENEF:171): con error se escribe el mensaje y se abandona la
 * rutina (nada se graba). RK-b89433734937 (CADBENEF:177): si no, rama por operación.
 */
export function decidirOperacao(
  op: string,
  dados: DadosValidacaoCadastro,
  existe: boolean,
): { ok: true; operacao: OperacaoCadastro } | { ok: false; mensagem: string } {
  const erro = validarCadastro(op, dados, existe);
  // RK-07ac728d731a (CADBENEF:171): IF #ERRO → WRITE #MSG / ESCAPE ROUTINE.
  if (erro) return { ok: false, mensagem: erro };
  // RK-b89433734937 (CADBENEF:177): DECIDE ON FIRST VALUE OF #OPER.
  return { ok: true, operacao: op as OperacaoCadastro };
}

/** Edad por año del legado. */
export function idadeCadastro(dtNascimento: number, anoAtual: number): number {
  // RK-46154d4f44a9 (CADBENEF:159): COMPUTE #IDADE = #ANO-ATUAL - #ANO-NASC.
  return idadePorAno(dtNascimento, anoAtual);
}

/** Status en blanco del legado (#STATUS A1 sin MOVE en la alteración, D18). */
export const STATUS_EM_BRANCO = " ";

/**
 * Status grabado. Inclusión → `A`; alteración → el status informado (o en blanco con
 * el flag D18). Edad > 75 → `S` en la inclusión y, en modo legado (D5), también en la
 * alteración. `quirks` default = legado D5 y D18 desactivado (status editable).
 */
export function statusResultante(
  op: OperacaoCadastro,
  dtNascimento: number,
  anoAtual: number,
  statusInformado?: string,
  quirks: Pick<Quirks, "corrigidos" | "statusBrancoAlteracao"> = QUIRKS_PADRAO,
): { status: string; suspensoPorIdade: boolean } {
  let status: string;
  if (op === "I") {
    // RK-e4b2970fefe6 (CADBENEF:162): IF #OPER = 'I' THEN MOVE 'A' TO #STATUS.
    status = "A";
  } else if (quirks.statusBrancoAlteracao) {
    // LEGACY-QUIRK(D18): CADBENEF no mueve nada a #STATUS en la alteración: se graba en
    // blanco (salvo edad > 75 → S, abajo). Solo con LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED=true.
    status = STATUS_EM_BRANCO;
  } else {
    // CORRECAO(D18): default (PRD FR-BEN-01) — la alteración conserva el status informado.
    // TODO(review): D18 — confirmar con negocio que la alteración conserva el status informado.
    status = statusInformado ?? "A";
  }
  // RK-9ffc13028ce4 (CADBENEF:167): IF #IDADE > 75 THEN MOVE 'S' TO #STATUS.
  if (idadeCadastro(dtNascimento, anoAtual) > IDADE_LIMITE_SUSPENSAO) {
    if (op === "A" && corrige(quirks, "D5")) {
      // CORRECAO(D5): la suspensión por edad solo se aplica en la inclusión; en la
      // alteración se conserva el status elegido (se puede reactivar a un mayor de 75).
      return { status, suspensoPorIdade: false };
    }
    // LEGACY-QUIRK(D5): se aplica también en la alteración (reactivar a un mayor de 75 no es posible).
    return { status: "S", suspensoPorIdade: status !== "S" };
  }
  return { status, suspensoPorIdade: false };
}

// ---------------------------------------------------------------------------
// Alteración: campos editables e inmutables (FR-BEN-01)

/** Campos que la alteración puede cambiar (además de dtUltAlteracao, que pone el sistema). */
export const CAMPOS_EDITAVEIS_ALTERACAO = [
  "nomeCompleto",
  "logradouro",
  "municipio",
  "uf",
  "cep",
  "telFixo",
  "rgNumero",
  "sitBeneficiario",
  "vlrRendaFamiliar",
  "numDependentes",
] as const;

/** Campos de solo lectura en la alteración; el servidor rechaza cambios. */
export const CAMPOS_IMUTAVEIS = {
  dtNascimento: "Data de nascimento",
  sexo: "Sexo",
  codPrograma: "Programa",
  codRegiao: "Região",
  nis: "NIS",
} as const;
export type CampoImutavel = keyof typeof CAMPOS_IMUTAVEIS;

type ValoresImutaveis = { [K in CampoImutavel]: string | number | null };

/** Lista de campos inmutables cuyo valor enviado difiere del registrado. */
export function camposImutaveisAlterados(registrado: ValoresImutaveis, enviado: ValoresImutaveis): CampoImutavel[] {
  return (Object.keys(CAMPOS_IMUTAVEIS) as CampoImutavel[]).filter(
    (c) => (registrado[c] ?? null) !== (enviado[c] ?? null),
  );
}

export function mensagemCampoNaoEditavel(campos: readonly CampoImutavel[]): string {
  return `${MENSAGENS_SISTEMA.campoNaoEditavel} ${campos.map((c) => CAMPOS_IMUTAVEIS[c]).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Esquemas zod (borde). Los campos validados por CADBENEF (CPF, nombre, nacimiento,
// sexo) solo se normalizan aquí: sus mensajes y su orden los decide validarCadastro.

/** RENDA-FAMILIAR N9.2 → máximo 9.999.999,99 en centavos. */
export const MAX_RENDA_CENTAVOS = 999_999_999;

const vazioParaNull = (s: string) => (s === "" ? null : s);

const textoOpcional = (rotulo: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `${rotulo}: máximo ${max} caracteres` })
    .transform(vazioParaNull);

/** CPF N11: solo dígitos, ceros a la izquierda (el legado es numérico). Vacío → "". */
const cpfSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length <= 11, { error: "CPF: máximo 11 dígitos" })
  .transform((s) => (s === "" ? "" : s.padStart(11, "0")));

const dtNascimentoSchema = z.coerce
  .number({ error: "Data de nascimento: data inválida" })
  .int({ error: "Data de nascimento: data inválida" })
  .refine(
    (n) => {
      if (n === 0) return true;
      try {
        return intParaData(n) !== null;
      } catch {
        return false;
      }
    },
    { error: "Data de nascimento: data inválida" },
  );

const inteiroLimitado = (rotulo: string, max: number) =>
  z
    .string()
    .trim()
    .transform((s) => (s === "" ? 0 : /^\d+$/.test(s) ? Number(s) : Number.NaN))
    .pipe(
      z
        .number({ error: `${rotulo}: valor inválido` })
        .int({ error: `${rotulo}: valor inválido` })
        .min(0, { error: `${rotulo}: valor inválido` })
        .max(max, { error: `${rotulo}: máximo ${String(max).length} dígitos` }),
    );

/** Campos comunes a I y A (la pantalla CADASTRO DE BENEFICIARIO completa). */
const camposCadastro = {
  numCpf: cpfSchema,
  nomeCompleto: z.string().trim().toUpperCase().max(60, { error: "Nome: máximo 60 caracteres" }),
  dtNascimento: dtNascimentoSchema,
  sexo: z.string().trim().toUpperCase(),
  logradouro: textoOpcional("Endereço", 80),
  municipio: textoOpcional("Município", 40),
  // UF no se valida en CADBENEF (la valida VALBENEF, historia 2.2): solo el tamaño del campo.
  uf: textoOpcional("UF", 2).transform((s) => (s === null ? null : s.toUpperCase())),
  cep: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s === "" || s.length === 8, { error: "CEP: informe 8 dígitos" })
    .transform((s) => (s === "" ? null : Number(s))),
  telFixo: textoOpcional("Telefone", 15),
  rgNumero: textoOpcional("RG", 15).transform((s) => (s === null ? null : s.toUpperCase())),
  codPrograma: codProgramaSchema,
  vlrRendaFamiliar: z.coerce
    .number({ error: "Renda familiar: valor inválido" })
    .int({ error: "Renda familiar: valor inválido" })
    .min(0, { error: "Renda familiar: não pode ser negativa" })
    .max(MAX_RENDA_CENTAVOS, { error: "Renda familiar: máximo R$ 9.999.999,99" }),
  numDependentes: inteiroLimitado("Nº dependentes", 99),
  codRegiao: inteiroLimitado("Região", 99),
  // NIS vacío → NULL (deferred de 0.1: el unique es sobre columna nullable).
  nis: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s === "" || s.length === 11, { error: "NIS: informe 11 dígitos" })
    .transform(vazioParaNull),
};

export const inclusaoBeneficiarioSchema = z.object(camposCadastro);
export type InclusaoBeneficiario = z.output<typeof inclusaoBeneficiarioSchema>;

export const alteracaoBeneficiarioSchema = z.object({
  ...camposCadastro,
  sitBeneficiario: z.enum(SITUACOES_BENEFICIARIO, { error: "Situação: informe A, S, C, I ou D" }),
  numVersao: z.coerce.number({ error: "Versão: valor inválido" }).int({ error: "Versão: valor inválido" }).min(1, { error: "Versão: valor inválido" }),
});
/**
 * Alteración con LEGACY-QUIRK(D18) activo: la pantalla no muestra el select de status y
 * lo que llegue en `sitBeneficiario` se descarta (el status lo decide statusResultante).
 */
export const alteracaoBeneficiarioStatusBrancoSchema = alteracaoBeneficiarioSchema.extend({
  sitBeneficiario: z.unknown().transform(() => undefined),
});

export type AlteracaoBeneficiario =
  | z.output<typeof alteracaoBeneficiarioSchema>
  | z.output<typeof alteracaoBeneficiarioStatusBrancoSchema>;

/** Esquema de la alteración según el flag D18. */
export function esquemaAlteracaoBeneficiario(quirks: Pick<Quirks, "statusBrancoAlteracao"> = QUIRKS_PADRAO) {
  return quirks.statusBrancoAlteracao ? alteracaoBeneficiarioStatusBrancoSchema : alteracaoBeneficiarioSchema;
}

/** Nombres de los campos de formulario (orden de pantalla). */
export const CAMPOS_FORMULARIO_CADASTRO = Object.keys(camposCadastro) as (keyof typeof camposCadastro)[];

/** Campo de pantalla al que corresponde cada mensaje de CADBENEF (para mostrarlo junto al control). */
export function campoDoErro(mensagem: string): string | undefined {
  switch (mensagem) {
    case MENSAGENS_CADBENEF.cpfObrigatorio:
    case MENSAGENS_CADBENEF.cpfInvalido:
    case MENSAGENS_CADBENEF.jaCadastrado:
    case MENSAGENS_CADBENEF.naoEncontradoAlteracao:
      return "numCpf";
    case MENSAGENS_CADBENEF.nomeObrigatorio:
      return "nomeCompleto";
    case MENSAGENS_CADBENEF.dataNascimentoObrigatoria:
      return "dtNascimento";
    case MENSAGENS_CADBENEF.sexoInvalido:
      return "sexo";
    case MENSAGENS_SISTEMA.nisDuplicado:
      return "nis";
    default:
      return undefined;
  }
}

/**
 * Validación de CADBENEF antes de consultar la base (sin el paso de existencia).
 * Se usa cuando el formulario también tiene errores de formato en otros campos:
 * el orden legado manda y se muestra un solo mensaje.
 */
export function primeiroErroDosCampos(op: string, bruto: Record<string, string>): string | null {
  const numCpf = cpfSchema.safeParse(bruto.numCpf ?? "");
  const dt = dtNascimentoSchema.safeParse(bruto.dtNascimento ?? "0");
  const dados: DadosValidacaoCadastro = {
    // Un CPF de más de 11 dígitos no pasa el módulo 11.
    numCpf: numCpf.success ? numCpf.data : String(bruto.numCpf ?? "").replace(/\D/g, ""),
    nomeCompleto: bruto.nomeCompleto ?? "",
    // Fecha con formato inválido: no es 0; el error de formato lo informa zod.
    dtNascimento: dt.success ? dt.data : -1,
    sexo: (bruto.sexo ?? "").trim().toUpperCase(),
  };
  return validarCadastro(op, dados, op === "A");
}
