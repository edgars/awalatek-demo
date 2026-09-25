"use server";

import { revalidatePath } from "next/cache";
import {
  CAMPOS_FORMULARIO_DEPENDENTE,
  campoDoErroDependente,
  dependenteSchema,
  MENSAGENS_CADDEPEND,
} from "@/domain/beneficiario/dependentes";
import { resolverCpfPorChave } from "@/server/beneficiarios";
import { incluirDependente } from "@/server/dependentes";
import { lerQuirksServidor } from "@/server/quirksConfig";
import type { EstadoDependente } from "./_componentes/estado";

// Server Action de /beneficiarios/[chave]/dependentes: zod en el borde; reglas en el dominio.
// Solo inclusión: el legado no edita ni borra dependientes.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

function falhaInesperada(e: unknown): EstadoDependente {
  // Solo el tipo y el código del error: el mensaje de Prisma incluye los argumentos
  // de la consulta (CPF, nombre) y no puede ir al log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[dependentes] inclusão:", nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagens: [ERRO_INESPERADO] };
}

/** `chave` (opaca) del titular viene de la ruta (ligada con bind); el CPF se resuelve aquí (H2). */
export async function incluirDependenteAction(chave: string, _anterior: EstadoDependente, dados: FormData): Promise<EstadoDependente> {
  // Chave primeiro (antes do zod): malformada/inexistente → mensagem literal do legado, sem
  // revalidar nada; falha da base → mensagem genérica (log só tipo/código).
  const resolvido = await resolverCpfPorChave(chave, "dependentes (chave)");
  if (!resolvido.ok) return { ok: false, mensagens: [ERRO_INESPERADO] };
  const cpf = resolvido.valor;
  if (!cpf) return { ok: false, mensagens: [MENSAGENS_CADDEPEND.naoEncontrado] };
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
      revalidatePath(`/beneficiarios/${chave}/dependentes`);
      const erros: Record<string, string> = {};
      for (const m of r.mensagens) {
        const campo = campoDoErroDependente(m);
        if (campo) erros[campo] = m;
      }
      return { ok: false, mensagens: r.mensagens, erros };
    }
    revalidatePath("/beneficiarios");
    revalidatePath(`/beneficiarios/${chave}/dependentes`);
    return { ok: true, mensagens: r.mensagens, total: r.total };
  } catch (e) {
    return falhaInesperada(e);
  }
}
