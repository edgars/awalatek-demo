import { z } from "zod";
import { calculaDv1, calculaDv2, normalizaCpfNumerico } from "../cpf";
import type { Quirks } from "../quirks";

// Reglas del programa legado VALDOCS (FR-DOC-01..03): validación de documentos del
// beneficiario (CPF, RG y documento especial por prefijo). Acumula errores (máx. 5)
// en el orden CPF → RG. Solo valida: no graba ni audita. TypeScript puro: sin Prisma ni Next.

/** Mensajes literales del legado (mayúsculas, sin tildes). */
export const MENSAGENS_VALDOCS = {
  cpfInvalido: "CPF INVALIDO",
  rgInvalido: "RG INVALIDO OU FORMATO INCORRETO",
  docEspecial: "** DOCUMENTO ESPECIAL VALIDADO **",
} as const;

/** #MSG(1:5): tamaño de la tabla de errores de VALDOCS. */
export const MAX_ERROS_VALDOCS = 5;

/** Tamaño del campo #RG (A15). */
const TAMANHO_RG = 15;

/** Longitud mínima del RG (VALDOCS:160). */
const RG_TAMANHO_MINIMO = 5;

/** #PREF-ESP(1:8): prefijos de CPF de "documento especial" (LEGACY-QUIRK D4). */
export const PREFIXOS_DOC_ESPECIAL = ["000", "001", "002", "010", "011", "099", "100", "999"] as const;

export type DadosValdocs = {
  /** CPF N11 como string de 11 dígitos (ceros a la izquierda; "00000000000" = 0). */
  numCpf: string;
  /** RG A15. */
  rg: string;
  /** Título de elector A12 — recibido y no validado (igual que el legado). */
  tituloEleitor: string;
  /** CTPS A15 — recibida y no validada (igual que el legado). */
  ctps: string;
};

export type ResultadoValdocs = { resultado: "V" | "I"; erros: string[]; docEspecial: boolean };

/** VALIDA-CPF-DOC: CPF ≠ 0 y dígitos verificadores por módulo 11 (sin regla de repetidos). */
export function validarCpfDoc(numCpf: string): boolean {
  const cpf = String(numCpf ?? "");
  // RK-55a63d755481 (VALDOCS:102): IF #CPF = 0 THEN MOVE FALSE TO #CPF-OK / ESCAPE ROUTINE.
  if (/^0*$/.test(cpf)) return false;
  // N11: más de 11 dígitos o caracteres no numéricos no caben en el campo → inválido.
  if (!/^\d{11}$/.test(cpf)) return false;
  const dig = Array.from(cpf, Number);
  // Sumas, restos y DVs: RK-4187fc1c9b8e / RK-9d67b2c9881b / RK-1a2b8aca3fed / RK-533f71e705bc
  // (VALDOCS:114–121) y RK-4cd00622ae5a / RK-bb14087b5111 / RK-e3ad9c603136 / RK-06b627574a45
  // (VALDOCS:131–138), en calculaDv1/calculaDv2 (src/domain/cpf.ts).
  // RK-ca3109301dbc (VALDOCS:123): IF #DV1 NE #DIG(10) THEN MOVE FALSE TO #CPF-OK / ESCAPE ROUTINE.
  if (calculaDv1(dig) !== dig[9]) return false;
  // RK-08b9ede5ec74 (VALDOCS:140): IF #DV2 NE #DIG(11) THEN MOVE FALSE TO #CPF-OK.
  if (calculaDv2(dig) !== dig[10]) return false;
  return true;
}

/** VALIDA-RG: no vacío y longitud (hasta el primer espacio del A15) ≥ 5. */
export function validarRg(rg: string): boolean {
  // Se simula el campo Natural A15: relleno con espacios y truncado a 15.
  const campo = String(rg ?? "").padEnd(TAMANHO_RG).slice(0, TAMANHO_RG);
  // RK-2b0e2875eb48 (VALDOCS:148): IF #RG = ' ' THEN MOVE FALSE TO #RG-OK / ESCAPE ROUTINE.
  if (campo.trim() === "") return false;
  // EXAMINE #RG FOR ' ' GIVING POSITION #RG-LEN: posición 1-based del primer espacio (0 = no hay).
  let rgLen = campo.indexOf(" ") + 1;
  // RK-f018750c00d0 (VALDOCS:155): IF #RG-LEN > 0 THEN SUBTRACT 1 FROM #RG-LEN (si no, A15 lleno = 15).
  if (rgLen > 0) rgLen = rgLen - 1;
  else rgLen = TAMANHO_RG;
  // LEGACY-QUIRK(D20): la longitud se mide hasta el primer espacio; un RG con espacio interno
  // cuenta solo hasta ahí ("12 345678" → 2 → inválido) y uno que empieza por espacio mide 0.
  // TODO(review): D20 — confirmar con negocio que se mantiene la medición del legado.
  // RK-cf4926ddfa8b (VALDOCS:160): IF #RG-LEN < 5 THEN MOVE FALSE TO #RG-OK.
  if (rgLen < RG_TAMANHO_MINIMO) return false;
  return true;
}

/** CHECK-DOC-ESPECIAL: el CPF (11 dígitos) empieza por uno de los prefijos especiales. */
export function ehDocEspecial(numCpf: string): boolean {
  const cpf = String(numCpf ?? "");
  if (!/^\d{11}$/.test(cpf)) return false;
  const prefCpf = cpf.slice(0, 3);
  for (const pref of PREFIXOS_DOC_ESPECIAL) {
    // RK-4aa29d42f19a (VALDOCS:174): IF #PREF-CPF = #PREF-ESP(#I) THEN MOVE TRUE TO #DOC-ESP-OK / MOVE TRUE TO #CPF-OK.
    if (prefCpf === pref) return true;
  }
  return false;
}

/** ADD 1 TO #QTD-ERROS / MOVE msg TO #MSG(#QTD-ERROS), respetando el tamaño de la tabla. */
export function acumularErroDoc(erros: string[], mensagem: string): void {
  if (erros.length < MAX_ERROS_VALDOCS) erros.push(mensagem);
}

/**
 * Validación de documentos de VALDOCS: acumula errores en el orden del legado
 * (CPF → RG). Título de elector y CTPS no se validan. El flag D4 se inyecta.
 */
export function validarDocumentos(dados: DadosValdocs, quirks: Quirks): ResultadoValdocs {
  const erros: string[] = [];
  // RK-82c01a2ea13d (VALDOCS:69): IF NOT #CPF-OK → "CPF INVALIDO".
  if (!validarCpfDoc(dados.numCpf)) acumularErroDoc(erros, MENSAGENS_VALDOCS.cpfInvalido);
  // RK-b0821b60ecb6 (VALDOCS:79): IF NOT #RG-OK → "RG INVALIDO OU FORMATO INCORRETO".
  if (!validarRg(dados.rg)) acumularErroDoc(erros, MENSAGENS_VALDOCS.rgInvalido);

  // LEGACY-QUIRK(D4): un CPF con prefijo especial anula todos los errores (incluido el RG)
  // y el resultado pasa a V. Riesgo de seguridad: solo con LEGACY_DOC_ESPECIAL_ENABLED=true
  // (desactivado por defecto); con el flag en false el prefijo no tiene efecto.
  if (quirks.docEspecialHabilitado && ehDocEspecial(dados.numCpf)) {
    // RK-5549fc642f21 (VALDOCS:95): IF #DOC-ESP-OK THEN WRITE '** DOCUMENTO ESPECIAL VALIDADO **'.
    return { resultado: "V", erros: [], docEspecial: true };
  }
  return { resultado: erros.length === 0 ? "V" : "I", erros, docEspecial: false };
}

// ---------------------------------------------------------------------------
// Borde (pantalla /validacao/documentos): solo normaliza los campos al formato
// legado; la validez la decide validarDocumentos.

// Sin rechazos por tamaño: como en el legado, el valor se trunca al ancho del campo
// y la validación siempre se ejecuta.
const truncado = (largura: number) => z.string().transform((s) => s.slice(0, largura));

export const entradaValdocsSchema = z.object({
  // #CPF es N11: dígitos con ceros a la izquierda; en blanco = 0 → "CPF INVALIDO".
  // Más de 11 dígitos → no cabe en N11 y es inválido.
  numCpf: z.string().transform(normalizaCpfNumerico),
  rg: truncado(TAMANHO_RG), // #RG A15
  tituloEleitor: truncado(12), // #TITULO A12
  ctps: truncado(15), // #CTPS A15
});
