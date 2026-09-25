import { entradaConsultaSchema } from "@/domain/beneficiario/consulta";
import { consultarBeneficiario, type ResultadoConsulta } from "@/server/consulta";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { ERRO_INESPERADO, falhaInesperada } from "@/lib/falhas";

export { ERRO_INESPERADO };

// Ejecución común de la consulta (Server Action y carga inicial por `?cpf=`).
// Solo lectura: CONSBENF no graba ni audita.

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
    return falhaInesperada("consulta", "consulta de beneficiário", e);
  }
}
