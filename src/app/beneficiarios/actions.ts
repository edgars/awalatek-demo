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
  cpfExatoDaBusca,
  incluirBeneficiario,
  resolverChavePorCpf,
  resolverCpfPorChave,
  type Resultado,
} from "@/server/beneficiarios";
import { lerQuirksServidor } from "@/server/quirksConfig";
import { BENEF_ERRO, BENEF_NAO_ENCONTRADO } from "@/domain/chavePublica";
import type { EstadoAcao } from "./estado";
import { ERRO_INESPERADO, falhaInesperadaMensagens } from "@/lib/falhas";

// Server Actions de /beneficiarios: zod en el borde; reglas en el dominio.
// La operación I/A del legado se sustituye por rutas (novo = I, editar = A).
// Sin exclusión: el legado no borra beneficiarios.

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
  // H2 (LGPD): o link e a revalidação usam a chave opaca devolvida pelo caso de uso, nunca o CPF.
  revalidatePath("/beneficiarios");
  revalidatePath(`/beneficiarios/${r.chavePublica}/editar`);
  return {
    ok: true,
    mensagens: [r.mensagem],
    chavePublica: r.chavePublica,
    status: r.status,
    suspensoPorIdade: r.suspensoPorIdade,
    numVersao: r.numVersao,
  };
}

export async function incluirBeneficiarioAction(_anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const bruto = Object.fromEntries(CAMPOS_FORMULARIO_CADASTRO.map((c) => [c, texto(dados, c)]));
  const parsed = inclusaoBeneficiarioSchema.safeParse(bruto);
  if (!parsed.success) return falhaValidacao("I", bruto, parsed.error);
  // D5: la configuración se lee una vez por solicitud y se inyecta en el caso de uso.
  const quirks = lerQuirksServidor("beneficiarios");
  if (!quirks) return { ok: false, mensagens: [ERRO_INESPERADO] };
  try {
    return resposta(await incluirBeneficiario(parsed.data, undefined, quirks));
  } catch (e) {
    return falhaInesperadaMensagens("beneficiarios", "inclusão", e);
  }
}

/** `chave` (opaca) viene de la ruta (ligada con bind): el CPF del formulario no puede cambiarlo. */
export async function alterarBeneficiarioAction(chave: string, _anterior: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const bruto: Record<string, string> = {
    ...Object.fromEntries(CAMPOS_FORMULARIO_CADASTRO.map((c) => [c, texto(dados, c)])),
    sitBeneficiario: texto(dados, "sitBeneficiario"),
    numVersao: texto(dados, "numVersao"),
  };
  const resolvido = await resolverCpfPorChave(chave, "alteração (chave)");
  if (!resolvido.ok) return { ok: false, mensagens: [ERRO_INESPERADO] };
  const cpf = resolvido.valor;
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
    return resposta(await alterarBeneficiario(parsed.data, undefined, quirks));
  } catch (e) {
    return falhaInesperadaMensagens("beneficiarios", "alteração", e);
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
    const r = await resolverChavePorCpf(cpf, "busca da lista");
    redirect(`/beneficiarios?benef=${encodeURIComponent(!r.ok ? BENEF_ERRO : (r.valor ?? BENEF_NAO_ENCONTRADO))}`);
  }
  redirect(termo ? `/beneficiarios?q=${encodeURIComponent(termo)}` : "/beneficiarios");
}
