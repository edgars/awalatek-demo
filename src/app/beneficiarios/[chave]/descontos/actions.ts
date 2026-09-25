"use server";

import { revalidatePath } from "next/cache";
import { CAMPOS_DESCONTO, MENSAGENS_DESCONTOS, validarDescontosRegistrados } from "@/domain/beneficiario/descontosRegistrados";
import { resolverCpfPorChave } from "@/server/beneficiarios";
import { salvarDescontosRegistrados } from "@/server/descontosRegistrados";
import { ERRO_INESPERADO, falhaInesperadaMensagens } from "@/lib/falhas";

// Server Action de /beneficiarios/[chave]/descontos: zod en el borde; reglas en el dominio.

/** Estado devuelto al editor de descuentos. */
export type EstadoDescontos = {
  ok: boolean;
  mensagens: string[];
  /** Error por fila y campo (`"<índice>.<campo>"` → mensaje). */
  erros?: Record<string, string>;
  /** Indicador "vigente hoje" por fila grabada (mismo orden que el formulario). */
  vigentes?: boolean[];
} | null;

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

/** `chave` (opaca) viene de la ruta (ligada con bind; H2). Guardar reemplaza todas las filas. */
export async function salvarDescontosRegistradosAction(
  chave: string,
  _anterior: EstadoDescontos,
  dados: FormData,
): Promise<EstadoDescontos> {
  // Falha da base ao resolver a chave → mensagem genérica (log só tipo/código).
  const resolvido = await resolverCpfPorChave(chave, "descontos (chave)");
  if (!resolvido.ok) return { ok: false, mensagens: [ERRO_INESPERADO] };
  const cpf = resolvido.valor;
  if (!cpf) return { ok: false, mensagens: [MENSAGENS_DESCONTOS.beneficiarioNaoEncontrado] };

  const linhas = lerFilas(dados, CAMPOS_DESCONTO);
  if (!linhas) return { ok: false, mensagens: [FORMULARIO_INVALIDO] };
  const v = validarDescontosRegistrados(linhas);
  if (!v.ok) return { ok: false, mensagens: v.mensagens, erros: v.erros };

  try {
    const r = await salvarDescontosRegistrados(cpf, v.filas);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem] };
    revalidatePath(`/beneficiarios/${chave}/descontos`);
    return { ok: true, mensagens: [r.mensagem], vigentes: r.vigentes };
  } catch (e) {
    return falhaInesperadaMensagens("descontos", "gravação", e);
  }
}
