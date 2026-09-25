"use server";

import { entradaValdocsSchema, validarDocumentos } from "@/domain/beneficiario/documentos";
import { lerQuirksServidor } from "@/server/quirksConfig";
import type { EstadoValidacaoDocumentos } from "./estado";

// Server Action de /validacao/documentos (VALDOCS). Solo valida: VALDOCS no graba
// ni audita, así que aquí no hay acceso a la base ni registrarEvento.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

export async function validarDocumentosAction(
  _anterior: EstadoValidacaoDocumentos,
  dados: FormData,
): Promise<EstadoValidacaoDocumentos> {
  const parsed = entradaValdocsSchema.safeParse({
    numCpf: texto(dados, "numCpf"),
    rg: texto(dados, "rg"),
    tituloEleitor: texto(dados, "tituloEleitor"),
    ctps: texto(dados, "ctps"),
  });
  if (!parsed.success) return { ok: false, mensagem: parsed.error.issues[0]?.message ?? ERRO_INESPERADO };
  // LEGACY-QUIRK(D4) y D20: la configuración se lee en el servidor en cada ejecución y se
  // inyecta en el dominio. Inválida → el log nombra la variable (sin PII); al usuario, el genérico.
  const quirks = lerQuirksServidor("validacao-documentos");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    const r = validarDocumentos(parsed.data, quirks);
    return { ok: true, resultado: r.resultado, erros: r.erros, docEspecial: r.docEspecial };
  } catch (e) {
    // Solo el tipo: nada de datos personales en el log (NFR-04).
    console.error("[validacao-documentos] validação:", e instanceof Error ? e.name : "erro desconhecido");
    return { ok: false, mensagem: ERRO_INESPERADO };
  }
}
