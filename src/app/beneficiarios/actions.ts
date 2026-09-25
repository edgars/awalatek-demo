"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  CAMPOS_FORMULARIO_CADASTRO,
  campoDoErro,
  esquemaAlteracaoBeneficiario,
  inclusaoBeneficiarioSchema,
  MENSAGENS_CADBENEF,
  primeiroErroDosCampos,
  type OperacaoCadastro,
} from "@/domain/beneficiario/cadastro";
import {
  alterarBeneficiario,
  chavePorCpf,
  cpfExatoDaBusca,
  cpfPorChave,
  incluirBeneficiario,
  type Resultado,
} from "@/server/beneficiarios";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { BENEF_NAO_ENCONTRADO, type EstadoAcao } from "./estado";

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

async function resposta(r: Resultado): Promise<EstadoAcao> {
  if (!r.ok) return falha(r.mensagem, campoDoErro(r.mensagem));
  // H2 (LGPD): o link e a revalidação usam a chave opaca, nunca o CPF.
  const chavePublica = (await chavePorCpf(r.numCpf)) ?? undefined;
  revalidatePath("/beneficiarios");
  if (chavePublica) revalidatePath(`/beneficiarios/${chavePublica}/editar`);
  return { ok: true, mensagens: [r.mensagem], chavePublica, status: r.status, suspensoPorIdade: r.suspensoPorIdade, numVersao: r.numVersao };
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
  // D5: la configuración se lee una vez por solicitud y se inyecta en el caso de uso.
  const quirks = lerQuirksServidor("beneficiarios");
  if (!quirks) return { ok: false, mensagens: [ERRO_INESPERADO] };
  try {
    return await resposta(await incluirBeneficiario(parsed.data, undefined, quirks));
  } catch (e) {
    return falhaInesperada("inclusão", e);
  }
}

/** `chave` (opaca) viene de la ruta (ligada con bind): el CPF del formulario no puede cambiarlo. */
export async function alterarBeneficiarioAction(chave: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const bruto: Record<string, string> = {
    ...Object.fromEntries(CAMPOS_FORMULARIO_CADASTRO.map((c) => [c, texto(dados, c)])),
    sitBeneficiario: texto(dados, "sitBeneficiario"),
    numVersao: texto(dados, "numVersao"),
  };
  let cpf: string | null;
  try {
    cpf = await cpfPorChave(chave);
  } catch (e) {
    return falhaInesperada("alteração", e);
  }
  if (!cpf) return falha(MENSAGENS_CADBENEF.naoEncontradoAlteracao);
  const cpfForm = (bruto.numCpf ?? "").replace(/\D/g, "");
  if (cpfForm && cpfForm !== cpf) return falha("Campo não editável na alteração: CPF.", "numCpf");
  bruto.numCpf = cpf;
  // D5 y D18: la configuración se lee una vez por solicitud. Con D18 legado el status no
  // se valida (la pantalla no lo envía) y el dominio lo graba en blanco (o S por edad).
  const quirks = lerQuirksServidor("beneficiarios");
  if (!quirks) return { ok: false, mensagens: [ERRO_INESPERADO] };
  const parsed = esquemaAlteracaoBeneficiario(quirks).safeParse(bruto);
  if (!parsed.success) return falhaValidacao("A", bruto, parsed.error);
  try {
    return await resposta(await alterarBeneficiario(parsed.data, undefined, quirks));
  } catch (e) {
    return falhaInesperada("alteração", e);
  }
}

/**
 * Búsqueda de la lista (POST, H2/LGPD): un CPF exacto nunca va a la URL; se cambia por la
 * clave opaca (`?benef=`). Los demás términos (nombre) siguen en `?q=` como antes.
 */
export async function buscarBeneficiariosAction(dados: FormData): Promise<void> {
  const termo = texto(dados, "q").trim();
  const cpf = cpfExatoDaBusca(termo);
  if (cpf) {
    const chave = await chavePorCpf(cpf);
    redirect(`/beneficiarios?benef=${encodeURIComponent(chave ?? BENEF_NAO_ENCONTRADO)}`);
  }
  redirect(termo ? `/beneficiarios?q=${encodeURIComponent(termo)}` : "/beneficiarios");
}
