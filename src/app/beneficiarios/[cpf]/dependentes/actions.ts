"use server";

import { revalidatePath } from "next/cache";
import { CAMPOS_FORMULARIO_DEPENDENTE, campoDoErroDependente, dependenteSchema } from "@/domain/beneficiario/dependentes";
import { incluirDependente } from "@/server/dependentes";
import { lerQuirksServidor } from "@/server/quirksConfig";
import type { EstadoDependente } from "./_componentes/estado";
import { ERRO_INESPERADO, falhaInesperadaMensagens } from "@/lib/falhas";

// Server Action de /beneficiarios/[cpf]/dependentes: zod en el borde; reglas en el dominio.
// Solo inclusión: el legado no edita ni borra dependientes.

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

/** `cpf` del titular viene de la ruta (ligado con bind). */
export async function incluirDependenteAction(cpf: string, _anterior: EstadoDependente, dados: FormData): Promise<EstadoDependente> {
  const bruto = Object.fromEntries(CAMPOS_FORMULARIO_DEPENDENTE.map((c) => [c, texto(dados, c)]));
  const parsed = dependenteSchema.safeParse(bruto);
  if (!parsed.success) {
    const erros: Record<string, string> = {};
    for (const i of parsed.error.issues) erros[i.path.join(".")] ??= i.message;
    return { ok: false, mensagens: Object.values(erros), erros };
  }
  // D6: la configuración se lee una vez por solicitud y se inyecta en el caso de uso.
  const quirks = lerQuirksServidor("dependentes");
  if (!quirks) return { ok: false, mensagens: [ERRO_INESPERADO] };
  try {
    const r = await incluirDependente(cpf, parsed.data, undefined, quirks);
    if (!r.ok) {
      // Límite/concurrencia/titular bloqueado: la pantalla se refresca con el estado real.
      revalidatePath(`/beneficiarios/${cpf}/dependentes`);
      const erros: Record<string, string> = {};
      for (const m of r.mensagens) {
        const campo = campoDoErroDependente(m);
        if (campo) erros[campo] = m;
      }
      return { ok: false, mensagens: r.mensagens, erros };
    }
    revalidatePath("/beneficiarios");
    revalidatePath(`/beneficiarios/${r.numCpf}/dependentes`);
    return { ok: true, mensagens: r.mensagens, total: r.total };
  } catch (e) {
    return falhaInesperadaMensagens("dependentes", "inclusão", e);
  }
}
