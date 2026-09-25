import { z } from "zod";
import { normalizaCpfNumerico, validaCpfCompleto } from "../cpf";
import { SITUACOES_BENEFICIARIO, UFS } from "./cadastro";

// Reglas del programa legado VALBENEF (FR-VAL-01..05): validación cadastral
// consolidada. A diferencia de CADBENEF, **acumula** todos los errores (máx. 10).
// Solo valida: no graba ni audita. TypeScript puro: sin Prisma ni Next.

/** Mensajes literales del legado (mayúsculas, sin tildes). */
export const MENSAGENS_VALBENEF = {
  cpfInvalido: "CPF INVALIDO - DIGITO VERIFICADOR",
  dataNascimentoInvalida: "DATA NASCIMENTO INVALIDA",
  nomeInvalido: "NOME INVALIDO - DEVE TER NOME E SOBRENOME",
  ufInvalida: "UF INVALIDA",
  statusInvalido: "STATUS INVALIDO",
} as const;

/** Mensaje de la pantalla nueva "Carregar do cadastro" (sin equivalente en VALBENEF). */
export const MSG_BENEFICIARIO_NAO_ENCONTRADO = "BENEFICIARIO NAO ENCONTRADO";

/** #MSG-ERRO(1:10): tamaño de la tabla de errores del legado. */
export const MAX_ERROS_VALBENEF = 10;

/** Tamaño del campo #NOME (A60). */
const TAMANHO_NOME = 60;

/** LEGACY-QUIRK(D16): febrero siempre con 29 días (no se verifica año bisiesto). */
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export type DadosValbenef = {
  /** CPF N11 como string de 11 dígitos (ceros a la izquierda). */
  numCpf: string;
  nomeCompleto: string;
  /** AAAAMMDD (0 = vacío). */
  dtNascimento: number;
  /** En blanco = no informada. */
  uf: string;
  sitBeneficiario: string;
};

export type ResultadoValbenef = { resultado: "V" | "I"; erros: string[] };

/** Año actual a partir de la fecha del sistema AAAAMMDD. */
export function anoAtualDe(datn: number): number {
  // RK-4e7cf0ea0beb (VALBENEF:110): COMPUTE #ANO-ATUAL = *DATN / 10000.
  return Math.trunc(datn / 10000);
}

/** Fecha de nacimiento AAAAMMDD válida (FR-VAL-03). */
export function validarDataNascimento(dtNasc: number, anoAtual: number): boolean {
  if (!Number.isInteger(dtNasc)) return false;
  // RK-dec345b9d4e4 (VALBENEF:244): COMPUTE #ANO = #DT-NASC / 10000.
  const ano = Math.trunc(dtNasc / 10000);
  // RK-1f589b644cd7 (VALBENEF:245): COMPUTE #MES = (#DT-NASC - (#ANO * 10000)) / 100.
  const mes = Math.trunc((dtNasc - ano * 10000) / 100);
  // RK-a34852e9ec02 (VALBENEF:246): COMPUTE #DIA = #DT-NASC - (#ANO * 10000) - (#MES * 100).
  const dia = dtNasc - ano * 10000 - mes * 100;
  // RK-39c31733e515 (VALBENEF:248): IF #ANO < 1900 OR #ANO > #ANO-ATUAL → inválida / ESCAPE ROUTINE.
  if (ano < 1900 || ano > anoAtual) return false;
  // RK-f60066fede08 (VALBENEF:252): IF #MES < 1 OR #MES > 12 → inválida / ESCAPE ROUTINE.
  if (mes < 1 || mes > 12) return false;
  // RK-db3b53eeb364 (VALBENEF:256): IF #DIA < 1 OR #DIA > #DIAS-MES(#MES) → inválida.
  // LEGACY-QUIRK(D16): #DIAS-MES(2) = 29 siempre; 29/02 de año no bisiesto es válido.
  if (dia < 1 || dia > (DIAS_MES[mes - 1] ?? 0)) return false;
  return true;
}

/** Nombre con nombre y apellido (FR-VAL-04). */
export function validarNome(nome: string): boolean {
  // Se simula el campo Natural A60: relleno con espacios y truncado a 60.
  const campo = String(nome ?? "").padEnd(TAMANHO_NOME).slice(0, TAMANHO_NOME);
  // RK-9c6ba0322e06 (VALBENEF:264): IF #NOME = ' ' → inválido / ESCAPE ROUTINE.
  if (campo.trim() === "") return false;
  // EXAMINE #NOME FOR ' ' GIVING POSITION #POS: posición 1-based del primer espacio (0 = no hay).
  const pos = campo.indexOf(" ") + 1;
  // RK-9eb88e2bb408 (VALBENEF:271): IF #POS > 1 THEN MOVE TRUE TO #TEM-ESPACO.
  // LEGACY-QUIRK(D19): por el relleno del A60, un nombre de una sola palabra encuentra
  // el espacio de relleno y es válido; solo falla si ocupa los 60 caracteres sin espacios
  // (o empieza por espacio).
  // TODO(review): D19 — confirmar con negocio que se mantiene la regla tal como el legado.
  const temEspaco = pos > 1;
  // RK-6e161797bb9a (VALBENEF:274): IF NOT #TEM-ESPACO → #NOME-VALIDO = FALSE.
  if (!temEspaco) return false;
  return true;
}

/** UF (FR-VAL-05): solo si informada, debe pertenecer a las 27 UFs. */
export function validarUf(uf: string): boolean {
  const valor = String(uf ?? "");
  // RK-ac7976dff12d (VALBENEF:145): IF #UF NE ' ' → #UF-OK = FALSE / FOR #I = 1 TO 27.
  if (valor.trim() === "") return true;
  let ufOk = false;
  for (const item of UFS) {
    // RK-20056adb605d (VALBENEF:149): IF #UF = #UF-TAB(#I) → #UF-OK = TRUE / ESCAPE BOTTOM.
    if (valor === item) {
      ufOk = true;
      break;
    }
  }
  return ufOk;
}

/** Status ∈ {A, S, C, I, D}; en blanco es inválido (FR-VAL-01). */
export function validarStatus(status: string): boolean {
  return (SITUACOES_BENEFICIARIO as readonly string[]).includes(String(status ?? ""));
}

/** ADD 1 TO #QTD-ERROS / MOVE msg TO #MSG-ERRO(#QTD-ERROS), respetando el tamaño de la tabla. */
export function acumularErro(erros: string[], mensagem: string): void {
  if (erros.length < MAX_ERROS_VALBENEF) erros.push(mensagem);
}

/**
 * Validación consolidada de VALBENEF: acumula todos los errores en el orden del
 * legado (CPF → fecha → nombre → UF → status). `anoAtual` se inyecta.
 */
export function validarCadastroConsolidado(dados: DadosValbenef, anoAtual: number): ResultadoValbenef {
  const erros: string[] = [];
  // RK-d92621a0cc50 (VALBENEF:116): IF NOT #CPF-VALIDO → "CPF INVALIDO - DIGITO VERIFICADOR".
  if (!validaCpfCompleto(dados.numCpf)) acumularErro(erros, MENSAGENS_VALBENEF.cpfInvalido);
  // RK-b776e6f05132 (VALBENEF:126): IF NOT #DT-VALIDA → "DATA NASCIMENTO INVALIDA".
  if (!validarDataNascimento(dados.dtNascimento, anoAtual)) acumularErro(erros, MENSAGENS_VALBENEF.dataNascimentoInvalida);
  // RK-39e9b653aa4d (VALBENEF:136): IF NOT #NOME-VALIDO → "NOME INVALIDO - DEVE TER NOME E SOBRENOME".
  if (!validarNome(dados.nomeCompleto)) acumularErro(erros, MENSAGENS_VALBENEF.nomeInvalido);
  // RK-bb74de6a3c53 (VALBENEF:154): IF NOT #UF-OK → "UF INVALIDA".
  if (!validarUf(dados.uf)) acumularErro(erros, MENSAGENS_VALBENEF.ufInvalida);
  // RK-3414a3783a2e (VALBENEF:164): status fuera de A/S/C/I/D → "STATUS INVALIDO".
  if (!validarStatus(dados.sitBeneficiario)) acumularErro(erros, MENSAGENS_VALBENEF.statusInvalido);
  return { resultado: erros.length === 0 ? "V" : "I", erros };
}

// ---------------------------------------------------------------------------
// Borde (pantalla /validacao/cadastro): solo normaliza los campos al formato
// legado; la validez la decide validarCadastroConsolidado.

// Sin rechazos por tamaño: como en el legado, el valor se trunca al ancho del campo
// y la validación siempre se ejecuta.
const truncado = (largura: number) => z.string().transform((s) => s.slice(0, largura));

export const entradaValbenefSchema = z.object({
  // #CPF es N11: dígitos con ceros a la izquierda; en blanco = 0 = "00000000000"
  // (válido por LEGACY-QUIRK(D4b)). Más de 11 dígitos → no pasa el módulo 11.
  numCpf: z.string().transform(normalizaCpfNumerico),
  nomeCompleto: truncado(60), // #NOME A60
  // AAAAMMDD (N8); vacío o no numérico → 0 (fecha inválida).
  dtNascimento: z.string().transform((s) => (/^\d{1,8}$/.test(s.trim()) ? Number(s.trim()) : 0)),
  uf: truncado(2), // #UF A2
  sitBeneficiario: truncado(1), // #STATUS A1
});
