"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensagemCodigoDesconhecido, type ResumoConciliacao } from "@/domain/cnab240";
import { mascaraCpfLista } from "@/domain/cpf";
import { conciliarRetorno } from "@/server/conciliacao";
import type { CampoConciliacao, EstadoConciliacao, ResumoConciliacaoTela } from "./estado";

// Server Action de /conciliacao (BATCHCON). Valida la forma de la entrada con zod
// (competencia + upload, que reemplaza la ruta #ARQ-RETORNO del legado); las reglas
// están en el dominio. La respuesta lleva los CPF enmascarados (NFR-04).

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";
const RE_COMPETENCIA = /^\d{4}(0[1-9]|1[0-2])$/;
/** Límite del archivo de retorno. */
const LIMITE_ARQUIVO = 5 * 1024 * 1024;

const entradaConciliacaoSchema = z.object({
  competencia: z.string().regex(RE_COMPETENCIA, "Informe a competência (mês/ano).").transform(Number),
  arquivo: z
    .instanceof(File, { message: "Selecione o arquivo de retorno (.ret ou .txt)." })
    .refine((f) => f.size > 0 && f.name !== "", "Selecione o arquivo de retorno (.ret ou .txt).")
    .refine((f) => /\.(ret|txt)$/i.test(f.name), "O arquivo de retorno deve ter extensão .ret ou .txt.")
    .refine((f) => f.size <= LIMITE_ARQUIVO, "O arquivo de retorno excede o limite de 5 MB."),
});

function falhaInesperada(e: unknown): { ok: false; mensagem: string } {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error("[conciliacao] conciliação bancária:", nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
}

function paraTela(r: ResumoConciliacao): ResumoConciliacaoTela {
  return {
    competencia: r.competencia,
    lidos: r.lidos,
    conciliados: r.conciliados,
    divergentes: r.divergentes,
    naoEncontrados: r.naoEncontrados,
    auditoria: r.auditoria,
    detalhes: r.detalhes,
    divergencias: r.divergencias.map((d) => ({ ...d, cpf: mascaraCpfLista(d.cpf) })),
    listaNaoEncontrados: r.listaNaoEncontrados.map((n) => ({ ...n, cpf: mascaraCpfLista(n.cpf) })),
    avisos: r.codigosDesconhecidos.map((c) => mensagemCodigoDesconhecido(c.codRet, mascaraCpfLista(c.cpf))),
  };
}

const CAMPOS: readonly CampoConciliacao[] = ["competencia", "arquivo"];

export async function conciliarRetornoAction(_anterior: EstadoConciliacao, dados: FormData): Promise<EstadoConciliacao> {
  const competencia = dados.get("competencia");
  const parsed = entradaConciliacaoSchema.safeParse({
    competencia: typeof competencia === "string" ? competencia.trim() : "",
    arquivo: dados.get("arquivo"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = CAMPOS.find((c) => c === issue?.path[0]);
    return { ok: false, mensagem: issue?.message ?? ERRO_INESPERADO, campo };
  }
  try {
    const conteudo = await parsed.data.arquivo.text();
    const r = await conciliarRetorno({ competencia: parsed.data.competencia, conteudo });
    if (!r.ok) return r;
    if (r.resumo.auditoria > 0) {
      // La consulta y el detalle de pagos muestran el status y el código de retorno.
      revalidatePath("/pagamentos");
      revalidatePath("/pagamentos/[num]", "page");
    }
    return { ok: true, resumo: paraTela(r.resumo) };
  } catch (e) {
    return falhaInesperada(e);
  }
}
