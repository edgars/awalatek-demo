"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  alteracaoProgramaSchema,
  codProgramaRotaSchema,
  codProgramaSchema,
  faixaCalculoSchema,
  inclusaoProgramaSchema,
  paramRegionalSchema,
  validarOperacao,
} from "@/domain/programa";
import {
  alterarPrograma,
  alterarSituacaoPrograma,
  incluirPrograma,
  salvarFaixas,
  salvarParamsRegionais,
} from "@/server/programas";
import type { EstadoAcao } from "./estado";
import { falhaInesperadaMensagens } from "@/lib/falhas";

// Server Actions de /programas: validación zod en el borde; reglas en el dominio.
// Inclusión y consulta (+ grupos) del legado; alteración y desactivar/reactivar son
// funcionalidad nueva (story 1.2). Nunca se excluye un programa.

const CAMPOS_INCLUSAO = [
  "codPrograma",
  "nomePrograma",
  "tipoPrograma",
  "vlrBase",
  "codElegibilidade",
  "dtInicio",
  "dtFim",
  "rendaMaxima",
  "idadeMin",
  "idadeMax",
  "fatorReajuste",
] as const;

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

function falhaValidacao(erro: z.ZodError, prefixo = ""): EstadoAcao {
  const erros: Record<string, string> = {};
  for (const i of erro.issues) {
    const campo = i.path.join(".");
    erros[campo] ??= i.message;
  }
  return { ok: false, mensagens: erro.issues.map((i) => `${prefixo}${i.message}`), erros };
}

export async function incluirProgramaAction(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const op = validarOperacao("I");
  if (!op.ok) return { ok: false, mensagens: [op.mensagem] };

  const bruto = Object.fromEntries(CAMPOS_INCLUSAO.map((c) => [c, texto(dados, c)]));
  const parsed = inclusaoProgramaSchema.safeParse(bruto);
  if (!parsed.success) return falhaValidacao(parsed.error);

  try {
    const r = await incluirPrograma(parsed.data);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem], erros: { codPrograma: r.mensagem } };
    revalidatePath("/programas");
    return { ok: true, mensagens: [r.mensagem], codPrograma: r.dados.codPrograma };
  } catch (e) {
    return falhaInesperadaMensagens("programas", "inclusão", e);
  }
}

const CAMPOS_ALTERACAO = [...CAMPOS_INCLUSAO.filter((c) => c !== "codPrograma"), "numVersao"] as const;

/** Revalida la lista, el detalle y la alteración (layout de `/programas/[cod]`). */
function revalidarPrograma() {
  revalidatePath("/programas");
  revalidatePath("/programas/[cod]", "layout");
}

/** Story 1.2 — alteración (el código es inmutable: viene de la ruta, no del formulario). */
export async function alterarProgramaAction(codBruto: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const cod = codProgramaRotaSchema.safeParse(codBruto);
  if (!cod.success) return falhaValidacao(cod.error);
  const bruto = Object.fromEntries(CAMPOS_ALTERACAO.map((c) => [c, texto(dados, c)]));
  const parsed = alteracaoProgramaSchema.safeParse(bruto);
  if (!parsed.success) return falhaValidacao(parsed.error);

  try {
    const r = await alterarPrograma(cod.data, parsed.data);
    if (!r.ok) {
      return {
        ok: false,
        mensagens: [r.mensagem],
        erros: r.campo ? { [r.campo]: r.mensagem } : undefined,
        conflito: r.conflito,
      };
    }
    if (!r.semAlteracao) revalidarPrograma();
    return { ok: true, mensagens: [r.mensagem], codPrograma: cod.data, numVersao: r.numVersao };
  } catch (e) {
    return falhaInesperadaMensagens("programas", "alteração", e);
  }
}

const situacaoSchema = z.object({
  acao: z.enum(["desativar", "reativar"], { error: "Ação inválida" }),
  numVersao: alteracaoProgramaSchema.shape.numVersao,
});

/** Story 1.2 — desativar (A → I) / reativar (I → A), tras la confirmación en la página. */
export async function alterarSituacaoProgramaAction(codBruto: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const cod = codProgramaRotaSchema.safeParse(codBruto);
  if (!cod.success) return falhaValidacao(cod.error);
  const parsed = situacaoSchema.safeParse({ acao: texto(dados, "acao"), numVersao: texto(dados, "numVersao") });
  if (!parsed.success) return falhaValidacao(parsed.error);

  try {
    const r = await alterarSituacaoPrograma(cod.data, parsed.data.acao, parsed.data.numVersao);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem], conflito: r.conflito };
    revalidarPrograma();
    return { ok: true, mensagens: [r.mensagem], codPrograma: cod.data, numVersao: r.numVersao };
  } catch (e) {
    return falhaInesperadaMensagens("programas", "situação", e);
  }
}

/** Lee filas repetidas del formulario (`getAll` por campo, en orden de documento). */
function lerFilas<K extends string>(dados: FormData, campos: readonly K[]): Record<K, string>[] {
  const colunas = campos.map((c) => dados.getAll(c).map((v) => (typeof v === "string" ? v : "")));
  const n = Math.max(0, ...colunas.map((c) => c.length));
  return Array.from({ length: n }, (_, i) =>
    Object.fromEntries(campos.map((c, j) => [c, colunas[j]?.[i] ?? ""])) as Record<K, string>,
  );
}

async function salvarGrupo<S extends z.ZodType>(
  codBruto: string,
  dados: FormData,
  campos: readonly string[],
  schema: S,
  rotuloLinha: string,
  salvar: (cod: string, filas: z.output<S>[]) => Promise<{ ok: boolean; mensagem: string }>,
): Promise<EstadoAcao> {
  const op = validarOperacao("C");
  if (!op.ok) return { ok: false, mensagens: [op.mensagem] };
  const cod = codProgramaSchema.safeParse(codBruto);
  if (!cod.success) return falhaValidacao(cod.error);

  const filas: z.output<S>[] = [];
  const mensagens: string[] = [];
  const erros: Record<string, string> = {};
  lerFilas(dados, campos).forEach((linha, i) => {
    const r = schema.safeParse(linha);
    if (r.success) filas.push(r.data);
    else
      for (const issue of r.error.issues) {
        mensagens.push(`${rotuloLinha} ${i + 1} — ${issue.message}`);
        erros[`${i}.${issue.path.join(".")}`] ??= issue.message;
      }
  });
  if (mensagens.length) return { ok: false, mensagens, erros };

  try {
    const r = await salvar(cod.data, filas);
    if (!r.ok) return { ok: false, mensagens: [r.mensagem] };
    revalidatePath(`/programas/${cod.data}`);
    return { ok: true, mensagens: [r.mensagem] };
  } catch (e) {
    return falhaInesperadaMensagens("programas", `grupo ${rotuloLinha}`, e);
  }
}

export async function salvarFaixasAction(cod: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  return salvarGrupo(
    cod,
    dados,
    ["rendaInicio", "rendaFim", "fatorMultiplicador", "vlrAdicional", "indAcumulativo"],
    faixaCalculoSchema,
    "Faixa",
    salvarFaixas,
  );
}

export async function salvarParamsRegionaisAction(cod: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  return salvarGrupo(
    cod,
    dados,
    ["codRegiao", "fatorRegional", "vlrComplementoReg", "indAtivoRegiao"],
    paramRegionalSchema,
    "Parâmetro",
    salvarParamsRegionais,
  );
}
