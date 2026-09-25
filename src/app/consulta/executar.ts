import { entradaConsultaSchema } from "@/domain/beneficiario/consulta";
import { consultarBeneficiario, type ResultadoConsulta } from "@/server/consulta";
import { lerQuirksServidor } from "@/server/quirksConfig";

// Ejecución común de la consulta (Server Action y carga inicial por `?cpf=`).
// Solo lectura: CONSBENF no graba ni audita.

export const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function falhaInesperada(e: unknown): { ok: false; mensagem: string } {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[consulta] consulta de beneficiário:", nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
}

export async function executarConsulta(tipo: string, valor: string): Promise<ResultadoConsulta> {
  const parsed = entradaConsultaSchema.safeParse({ tipo, valor });
  if (!parsed.success) return { ok: false, mensagem: parsed.error.issues[0]?.message ?? ERRO_INESPERADO };
  // LEGACY-QUIRK(D7/D21): la configuración se lee una vez por solicitud y se inyecta en el dominio.
  // Configuración inválida → ya registrada (sin datos personales); mensaje genérico.
  const quirks = lerQuirksServidor("consulta");
  if (!quirks) return { ok: false, mensagem: ERRO_INESPERADO };
  try {
    return await consultarBeneficiario(parsed.data, undefined, quirks);
  } catch (e) {
    return falhaInesperada(e);
  }
}
