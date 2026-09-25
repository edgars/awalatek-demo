"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  alteracaoBeneficiarioSchema,
  CAMPOS_FORMULARIO_CADASTRO,
  campoDoErro,
  inclusaoBeneficiarioSchema,
  primeiroErroDosCampos,
  type OperacaoCadastro,
} from "@/domain/beneficiario/cadastro";
import { alterarBeneficiario, incluirBeneficiario, type Resultado } from "@/server/beneficiarios";
import type { EstadoAcao } from "./estado";

// Server Actions de /beneficiarios: zod en el borde; reglas en el dominio.
// La operación I/A del legado se sustituye por rutas (novo = I, editar = A).
// Sin exclusión: el legado no borra beneficiarios.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

function falha(mensagem: string, campo?: string): EstadoAcao {
  return { ok: false, mensagens: [mensagem], erros: campo ? { [campo]: mensagem } : undefined };
}

/** Un solo mensaje: primero el orden legado de CADBENEF; si pasa, el primer error de formato. */
function falhaValidacao(op: OperacaoCadastro, bruto: Record<string, string>, erro: z.ZodError): EstadoAcao {
  const legado = primeiroErroDosCampos(op, bruto);
  if (legado) return falha(legado, campoDoErro(legado));
  const primeiro = erro.issues[0];
  return falha(primeiro?.message ?? ERRO_INESPERADO, primeiro?.path.join("."));
}

function resposta(r: Resultado): EstadoAcao {
  if (!r.ok) return falha(r.mensagem, campoDoErro(r.mensagem));
  revalidatePath("/beneficiarios");
  revalidatePath(`/beneficiarios/${r.numCpf}/editar`);
  return { ok: true, mensagens: [r.mensagem], numCpf: r.numCpf, status: r.status, suspensoPorIdade: r.suspensoPorIdade, numVersao: r.numVersao };
}

function falhaInesperada(contexto: string, e: unknown): EstadoAcao {
  // Solo el tipo y el código del error: el mensaje de Prisma incluye los argumentos
  // de la consulta (CPF, nombre, NIS, renda) y no puede ir al log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error(`[beneficiarios] ${contexto}:`, nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagens: [ERRO_INESPERADO] };
}

export async function incluirBeneficiarioAction(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const bruto = Object.fromEntries(CAMPOS_FORMULARIO_CADASTRO.map((c) => [c, texto(dados, c)]));
  const parsed = inclusaoBeneficiarioSchema.safeParse(bruto);
  if (!parsed.success) return falhaValidacao("I", bruto, parsed.error);
  try {
    return resposta(await incluirBeneficiario(parsed.data));
  } catch (e) {
    return falhaInesperada("inclusão", e);
  }
}

/** `cpf` viene de la ruta (ligado con bind): el CPF del formulario no puede cambiarlo. */
export async function alterarBeneficiarioAction(cpf: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const bruto: Record<string, string> = {
    ...Object.fromEntries(CAMPOS_FORMULARIO_CADASTRO.map((c) => [c, texto(dados, c)])),
    sitBeneficiario: texto(dados, "sitBeneficiario"),
    numVersao: texto(dados, "numVersao"),
  };
  const cpfForm = (bruto.numCpf ?? "").replace(/\D/g, "");
  if (cpfForm && cpfForm !== cpf) return falha("Campo não editável na alteração: CPF.", "numCpf");
  bruto.numCpf = cpf;
  const parsed = alteracaoBeneficiarioSchema.safeParse(bruto);
  if (!parsed.success) return falhaValidacao("A", bruto, parsed.error);
  try {
    return resposta(await alterarBeneficiario(parsed.data));
  } catch (e) {
    return falhaInesperada("alteração", e);
  }
}
