"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CAMPOS_DESCONTO, MENSAGENS_DESCONTOS, validarDescontosRegistrados } from "@/domain/beneficiario/descontosRegistrados";
import { salvarDescontosRegistrados } from "@/server/descontosRegistrados";

// Server Action de /beneficiarios/[cpf]/descontos: zod en el borde; reglas en el dominio.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

/** Estado devuelto al editor de descuentos. */
export type EstadoDescontos = {
  ok: boolean;
  mensagens: string[];
  /** Error por fila y campo (`"<índice>.<campo>"` → mensaje). */
  erros?: Record<string, string>;
  /** Indicador "vigente hoje" por fila grabada (mismo orden que el formulario). */
  vigentes?: boolean[];
} | null;

const cpfRotaSchema = z.string().regex(/^\d{11}$/);

/** Lee filas repetidas del formulario (`getAll` por campo, en orden de documento). */
function lerFilas<K extends string>(dados: FormData, campos: readonly K[]): Record<K, string>[] {
  const colunas = campos.map((c) => dados.getAll(c).map((v) => (typeof v === "string" ? v : "")));
  const n = Math.max(0, ...colunas.map((c) => c.length));
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(campos.map((c, j) => [c, colunas[j]?.[i] ?? ""])) as Record<K, string>,
  );
}

function falhaInesperada(e: unknown): EstadoDescontos {
  // Solo el tipo y el código del error: el mensaje de Prisma incluye los argumentos
  // de la consulta y no puede ir al log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[descontos] gravação:", nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagens: [ERRO_INESPERADO] };
}

/** `cpf` viene de la ruta (ligado con bind). Guardar reemplaza todas las filas. */
export async function salvarDescontosRegistradosAction(
  cpf: string,
  _anterior: EstadoDescontos,
  dados: FormData,
): Promise<EstadoDescontos> {
  const cpfOk = cpfRotaSchema.safeParse(cpf);
  if (!cpfOk.success) return { ok: false, mensagens: [MENSAGENS_DESCONTOS.beneficiarioNaoEncontrado] };

  const v = validarDescontosRegistrados(lerFilas(dados, CAMPOS_DESCONTO));
  if (!v.ok) return { ok: false, mensagens: v.mensagens, erros: v.erros };

  try {
    const r = await salvarDescontosRegistrados(cpfOk.data, v.filas);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem] };
    revalidatePath(`/beneficiarios/${cpfOk.data}/descontos`);
    return { ok: true, mensagens: [r.mensagem], vigentes: r.vigentes };
  } catch (e) {
    return falhaInesperada(e);
  }
}
