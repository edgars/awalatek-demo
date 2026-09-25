"use server";

import type { EstadoConsulta } from "./estado";
import { executarConsulta } from "./executar";

// Server Action de /consulta (CONSBENF). Solo lee: no hay escrituras ni registrarEvento.
// La forma de la entrada se valida con zod (entradaConsultaSchema) en executarConsulta.

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

export async function consultarBeneficiarioAction(_anterior: EstadoConsulta, dados: FormData): Promise<EstadoConsulta> {
  return executarConsulta(texto(dados, "tipo"), texto(dados, "valor"));
}
