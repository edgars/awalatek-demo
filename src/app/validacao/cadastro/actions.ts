"use server";

import {
  anoAtualDe,
  entradaValbenefSchema,
  MSG_BENEFICIARIO_NAO_ENCONTRADO,
  validarCadastroConsolidado,
} from "@/domain/beneficiario/validacao";
import { normalizaCpfNumerico } from "@/domain/cpf";
import { hoje } from "@/domain/legacyDate";
import { obterBeneficiario } from "@/server/beneficiarios";
import type { EstadoCarga, EstadoValidacao } from "./estado";

// Server Actions de /validacao/cadastro (VALBENEF). Solo validan y leen:
// VALBENEF no graba ni audita, así que aquí no hay escrituras ni registrarEvento.

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";
const CPF_PARA_CARREGAR = "Informe o CPF (até 11 dígitos) para carregar do cadastro.";

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v : "";
}

function falhaInesperada(contexto: string, e: unknown): { ok: false; mensagem: string } {
  // Solo tipo y código: nada de datos personales en el log (NFR-04).
  const nome = e instanceof Error ? e.name : "erro desconhecido";
  const codigo = (e as { code?: unknown } | null)?.code;
  console.error(`[validacao-cadastro] ${contexto}:`, nome, typeof codigo === "string" ? codigo : "");
  return { ok: false, mensagem: ERRO_INESPERADO };
}

export async function validarCadastroAction(_anterior: EstadoValidacao, dados: FormData): Promise<EstadoValidacao> {
  const parsed = entradaValbenefSchema.safeParse({
    numCpf: texto(dados, "numCpf"),
    nomeCompleto: texto(dados, "nomeCompleto"),
    dtNascimento: texto(dados, "dtNascimento"),
    uf: texto(dados, "uf"),
    sitBeneficiario: texto(dados, "sitBeneficiario"),
  });
  if (!parsed.success) return { ok: false, mensagem: parsed.error.issues[0]?.message ?? ERRO_INESPERADO };
  try {
    // RK-4e7cf0ea0beb (VALBENEF:110): ano atual a partir da data do sistema.
    const r = validarCadastroConsolidado(parsed.data, anoAtualDe(hoje().data));
    return { ok: true, resultado: r.resultado, erros: r.erros };
  } catch (e) {
    return falhaInesperada("validação", e);
  }
}

/** "Carregar do cadastro": lee el beneficiario por CPF para rellenar el formulario. */
export async function carregarDoCadastroAction(cpf: string): Promise<EstadoCarga> {
  const digitos = String(cpf ?? "").replace(/\D/g, "");
  if (!/^\d{1,11}$/.test(digitos)) return { ok: false, mensagem: CPF_PARA_CARREGAR };
  const numCpf = normalizaCpfNumerico(digitos);
  try {
    const b = await obterBeneficiario(numCpf);
    if (!b) return { ok: false, mensagem: MSG_BENEFICIARIO_NAO_ENCONTRADO };
    return {
      ok: true,
      dados: {
        numCpf: b.numCpf,
        nomeCompleto: b.nomeCompleto,
        dtNascimento: b.dtNascimento,
        uf: b.uf ?? "",
        sitBeneficiario: b.sitBeneficiario,
      },
    };
  } catch (e) {
    return falhaInesperada("carga do cadastro", e);
  }
}
