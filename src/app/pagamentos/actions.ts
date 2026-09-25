"use server";

import { redirect } from "next/navigation";
import { lerFiltrosPagamentos } from "@/domain/pagamento";
import { chavePorCpf } from "@/server/beneficiarios";
import { BENEF_CPF_INCOMPLETO, BENEF_NAO_ENCONTRADO, PARAMS_LISTA } from "./filtros";

// Filtros de /pagamentos (POST, H2/LGPD): el CPF se cambia por la clave opaca del
// beneficiario antes de ir a la URL. Solo lee: no graba nada (ADR-009).

function texto(dados: FormData, campo: string): string {
  const v = dados.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function filtrarPagamentosAction(dados: FormData): Promise<void> {
  const q = new URLSearchParams();
  const cpfBruto = texto(dados, "cpf");
  if (cpfBruto) {
    // Misma regla que la lista: solo CPF exacto de 11 dígitos (admite máscara).
    const cpf = lerFiltrosPagamentos({ cpf: cpfBruto }).cpf;
    q.set("benef", cpf === null ? BENEF_CPF_INCOMPLETO : ((cpf && (await chavePorCpf(cpf))) || BENEF_NAO_ENCONTRADO));
  }
  for (const k of PARAMS_LISTA) {
    const v = texto(dados, k);
    if (v) q.set(k, v);
  }
  const s = q.toString();
  redirect(s ? `/pagamentos?${s}` : "/pagamentos");
}
