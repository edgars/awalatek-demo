"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CAMPOS_DESCONTO, MENSAGENS_DESCONTOS, validarDescontosRegistrados } from "@/domain/beneficiario/descontosRegistrados";
import { salvarDescontosRegistrados } from "@/server/descontosRegistrados";
import { falhaInesperadaMensagens } from "@/lib/falhas";

// Server Action de /beneficiarios/[cpf]/descontos: zod en el borde; reglas en el dominio.

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

const FORMULARIO_INVALIDO = "Formulário inválido: campos dos descontos incompletos. Recarregue a página.";

/**
 * Lee filas repetidas del formulario (`getAll` por campo, en orden de documento).
 * `null` si los campos tienen cantidades distintas: las columnas quedarían desalineadas.
 */
function lerFilas<K extends string>(dados: FormData, campos: readonly K[]): Record<K, string>[] | null {
  const colunas = campos.map((c) => dados.getAll(c).map((v) => (typeof v === "string" ? v : "")));
  const n = colunas[0]?.length ?? 0;
  if (colunas.some((c) => c.length !== n)) return null;
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(campos.map((c, j) => [c, colunas[j]?.[i] ?? ""])) as Record<K, string>,
  );
}

/** `cpf` viene de la ruta (ligado con bind). Guardar reemplaza todas las filas. */
export async function salvarDescontosRegistradosAction(
  cpf: string,
  _anterior: EstadoDescontos,
  dados: FormData,
): Promise<EstadoDescontos> {
  const cpfOk = cpfRotaSchema.safeParse(cpf);
  if (!cpfOk.success) return { ok: false, mensagens: [MENSAGENS_DESCONTOS.beneficiarioNaoEncontrado] };

  const linhas = lerFilas(dados, CAMPOS_DESCONTO);
  if (!linhas) return { ok: false, mensagens: [FORMULARIO_INVALIDO] };
  const v = validarDescontosRegistrados(linhas);
  if (!v.ok) return { ok: false, mensagens: v.mensagens, erros: v.erros };

  try {
    const r = await salvarDescontosRegistrados(cpfOk.data, v.filas);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem] };
    revalidatePath(`/beneficiarios/${cpfOk.data}/descontos`);
    return { ok: true, mensagens: [r.mensagem], vigentes: r.vigentes };
  } catch (e) {
    return falhaInesperadaMensagens("descontos", "gravação", e);
  }
}
