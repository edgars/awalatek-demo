// FR-DSC-01 — precondiciones del recálculo de descuentos de un pago (CALCDSCT:73-94).
// Dominio puro: recibe lo que el caso de uso leyó de la base (o `null` si no
// existe) y decide, en el orden del legado, si se puede recalcular:
// pago (del CPF informado) → beneficiario. CALCDSCT no verifica el status del
// beneficiario ni el del pago.

export const MSG_PAGAMENTO_NAO_ENCONTRADO = "PAGAMENTO NAO ENCONTRADO";
export const MSG_BENEFICIARIO_NAO_ENCONTRADO = "BENEFICIARIO NAO ENCONTRADO";

export type ResultadoPrecondicoesDescontos = { ok: true } | { ok: false; mensagem: string };

/** Primera precondición (CALCDSCT:75-85): el pago existe y es del CPF informado. */
export function verificarPagamento(numCpf: string, pagamento: { numCpf: string } | null): ResultadoPrecondicoesDescontos {
  // RK-314dbfb4a26e (CALCDSCT:75) — FIND PAGAMENTO-V WITH NUM-PAGTO: #FOUND solo si
  // PAGAMENTO-V.CPF-BENEF = #CPF (un pago de otro CPF cuenta como no encontrado).
  const encontrado = pagamento !== null && pagamento.numCpf === numCpf;
  // RK-8b1376b9c23d (CALCDSCT:82) — IF NOT #FOUND → "PAGAMENTO NAO ENCONTRADO"
  if (!encontrado) return { ok: false, mensagem: MSG_PAGAMENTO_NAO_ENCONTRADO };
  return { ok: true };
}

/** Segunda precondición (CALCDSCT:88-94): el beneficiario existe. */
export function verificarBeneficiario(beneficiario: object | null): ResultadoPrecondicoesDescontos {
  // RK-0a477ffc9ddc (CALCDSCT:91) — *NUMBER(BENEFICIARIO-V) = 0 → "BENEFICIARIO NAO ENCONTRADO".
  // En la base nueva Pagamento.numCpf es FK de Beneficiario, así que solo es alcanzable
  // si el registro desaparece entre lecturas; se conserva por equivalencia con el legado.
  if (!beneficiario) return { ok: false, mensagem: MSG_BENEFICIARIO_NAO_ENCONTRADO };
  return { ok: true };
}

/**
 * Las dos precondiciones en el orden del legado. `pagamento` = el leído por
 * NUM-PAGTO (o `null`); `beneficiario` = el leído por el CPF informado (o `null`).
 */
export function verificarPrecondicoesDescontos(entrada: {
  numCpf: string;
  pagamento: { numCpf: string } | null;
  beneficiario: object | null;
}): ResultadoPrecondicoesDescontos {
  const pag = verificarPagamento(entrada.numCpf, entrada.pagamento);
  if (!pag.ok) return pag;
  return verificarBeneficiario(entrada.beneficiario);
}
