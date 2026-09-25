// FR-CAL-01/02 — precondiciones del cálculo individual (CALCBENF:138-174).
// Dominio puro: recibe lo que el caso de uso leyó de la base (o `null` si no
// existe) y decide, en el orden del legado, si se puede calcular:
// competencia → beneficiario → status → programa.

import { validarCompetencia } from "./motor";

export const MSG_BENEFICIARIO_NAO_ENCONTRADO = "BENEFICIARIO NAO ENCONTRADO";
export const MSG_PROGRAMA_NAO_ENCONTRADO = "PROGRAMA NAO ENCONTRADO";

/** "BENEFICIARIO NAO ATIVO - STATUS:" + status (el WRITE de Natural separa con un espacio). */
export function mensagemBeneficiarioNaoAtivo(status: string): string {
  return `BENEFICIARIO NAO ATIVO - STATUS: ${status}`;
}

export type ResultadoPrecondicoes = { ok: true; ano: number; mes: number } | { ok: false; mensagem: string };

/**
 * Verifica las precondiciones en el orden del legado. `beneficiario`/`programa`
 * = `null` cuando la lectura no encontró el registro.
 */
export function verificarPrecondicoes(entrada: {
  competencia: number;
  beneficiario: { sitBeneficiario: string } | null;
  programa: object | null;
}): ResultadoPrecondicoes {
  // FR-CAL-01 (RK-7116b6a5174c / RK-140d297f9d0c / RK-886f1116333c, en motor.ts).
  const comp = validarCompetencia(entrada.competencia);
  if (!comp.ok) return comp;
  // RK-a88a2f157187 (CALCBENF:155) — beneficiario no encontrado por CPF → "BENEFICIARIO NAO ENCONTRADO"
  if (!entrada.beneficiario) return { ok: false, mensagem: MSG_BENEFICIARIO_NAO_ENCONTRADO };
  // RK-a116de8e94cf (CALCBENF:160) — STATUS NE 'A' → "BENEFICIARIO NAO ATIVO - STATUS:" + status
  if (entrada.beneficiario.sitBeneficiario !== "A") {
    return { ok: false, mensagem: mensagemBeneficiarioNaoAtivo(entrada.beneficiario.sitBeneficiario) };
  }
  // RK-b030809a3f7c (CALCBENF:174) — programa no encontrado → "PROGRAMA NAO ENCONTRADO".
  // En la base nueva Beneficiario.codPrograma es FK, así que solo es alcanzable si el
  // registro desaparece entre lecturas; se conserva por equivalencia con el legado.
  if (!entrada.programa) return { ok: false, mensagem: MSG_PROGRAMA_NAO_ENCONTRADO };
  return { ok: true, ano: comp.ano, mes: comp.mes };
}
