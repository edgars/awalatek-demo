"use server";

import { redirect } from "next/navigation";
import { BENEF_CPF_INCOMPLETO, BENEF_ERRO, BENEF_NAO_ENCONTRADO } from "@/domain/chavePublica";
import { lerFiltrosPagamentos } from "@/domain/pagamento";
import { resolverChavePorCpf } from "@/server/beneficiarios";
import { PARAMS_LISTA } from "./filtros";

// Filtros de /pagamentos (POST, H2/LGPD): el CPF se cambia por la clave opaca del
// beneficiario antes de ir a la URL. Solo lee: no graba nada (ADR-009, excepción documentada
// en docs/architecture.md; el e2e verifica que no escribe).

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

async function benefDoCpf(cpfBruto: string): Promise<string> {
  // Misma regla que la lista: solo CPF exacto de 11 dígitos (admite máscara).
  const cpf = lerFiltrosPagamentos({ cpf: cpfBruto }).cpf;
  if (cpf === null) return BENEF_CPF_INCOMPLETO;
  if (!cpf) return "";
  const r = await resolverChavePorCpf(cpf, "filtro de pagamentos");
  return !r.ok ? BENEF_ERRO : (r.valor ?? BENEF_NAO_ENCONTRADO);
}

export async function filtrarPagamentosAction(dados: FormData): Promise<void> {
  const q = new URLSearchParams();
  const cpfBruto = texto(dados, "cpf");
  // Campo CPF vazio: conserva o filtro vigente pela chave (campo oculto `benef`).
  const benef = cpfBruto ? await benefDoCpf(cpfBruto) : texto(dados, "benef");
  if (benef) q.set("benef", benef);
  for (const k of PARAMS_LISTA) {
    const v = texto(dados, k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  redirect(s ? `/pagamentos?${s}` : "/pagamentos");
}
