import { z } from "zod";
import { mascaraCpfConsulta, normalizaCpfNumerico } from "../cpf";
import { corrige, QUIRKS_PADRAO, type Quirks } from "../quirks";

// Reglas del programa legado CONSBENF (FR-CON-01..04): consulta de beneficiario
// por CPF o NIS con ficha cadastral e historial de pagos. Solo lectura: CONSBENF
// no graba ni audita. TypeScript puro: sin Prisma ni Next.

// RK-7ede98209218 (CONSBENF:86) — NONE → WRITE 'TIPO BUSCA INVALIDO'.
export const MSG_TIPO_BUSCA_INVALIDO = "TIPO BUSCA INVALIDO";
// RK-7b5ef292a4dd (CONSBENF:100) — IF NOT #FOUND → WRITE 'BENEFICIARIO NAO ENCONTRADO'.
export const MSG_BENEFICIARIO_NAO_ENCONTRADO = "BENEFICIARIO NAO ENCONTRADO";
// RK-95a55083feb2 (CONSBENF:166) — IF #QTD-HIST = 0 → WRITE 'NENHUM PAGAMENTO ENCONTRADO'.
export const MSG_NENHUM_PAGAMENTO = "NENHUM PAGAMENTO ENCONTRADO";

/** #HIST-*(1:12): tamaño de la tabla de historial del legado. */
export const MAX_HISTORICO = 12;

export type TipoBusca = "C" | "N";

/**
 * Entrada de la pantalla. #TIPO-BUSCA es A1 y #CPF-BUSCA/#NIS-BUSCA son N11.
 *
 * RK-9d9bab8eef93 (CONSBENF:72) — `IF *ERROR-NR NE 0` muestra una pantalla
 * alternativa sin MAP con los mismos tres campos. En la web hay una sola pantalla
 * (DESIGN 4.8) que sustituye al MAP y a la alternativa: el camino es siempre el
 * por defecto (entrada → tipo de busca → búsqueda).
 */
export const entradaConsultaSchema = z.object({
  // #TIPO-BUSCA A1: solo la 1.ª posición; nunca se rechaza (el inválido lo decide RK-7ede98209218).
  tipo: z.string().transform((s) => s.slice(0, 1)),
  // #CPF-BUSCA/#NIS-BUSCA N11: solo dígitos; más de 11 no se trunca (la búsqueda no encuentra).
  valor: z.string().transform((s) => s.replace(/\D/g, "")),
});
export type EntradaConsulta = z.input<typeof entradaConsultaSchema>;

/** NIS numérico N11: solo dígitos con ceros a la izquierda; >11 dígitos se devuelve tal cual (no encuentra). */
export function normalizaNisNumerico(texto: string): string {
  const d = String(texto ?? "").replace(/\D/g, "");
  return d.length <= 11 ? d.padStart(11, "0") : d;
}

export type Busca = { ok: true; tipo: "C"; numCpf: string } | { ok: true; tipo: "N"; nis: string } | { ok: false; mensagem: string };

/** Decide el tipo de búsqueda y normaliza la clave (CONSBENF:80–98). */
export function resolverBusca(tipoInformado: string, valor: string): Busca {
  // #TIPO-BUSCA es A1: solo cuenta la 1.ª posición.
  let tipo = String(tipoInformado ?? "").slice(0, 1);
  // RK-98c65e845b23 (CONSBENF:80) — IF #TIPO-BUSCA = ' ' → MOVE 'C' TO #TIPO-BUSCA.
  if (tipo.trim() === "") tipo = "C";
  // RK-7ede98209218 (CONSBENF:86) — DECIDE ON FIRST VALUE OF #TIPO-BUSCA: C → CPF, N → NIS, NONE → inválido.
  if (tipo === "C") return { ok: true, tipo: "C", numCpf: normalizaCpfNumerico(valor) };
  if (tipo === "N") return { ok: true, tipo: "N", nis: normalizaNisNumerico(valor) };
  return { ok: false, mensagem: MSG_TIPO_BUSCA_INVALIDO };
}

/** Descripción del status del beneficiario (FR-CON-02). */
export function descricaoStatus(status: string): string {
  // RK-bbda5babb7d9 (CONSBENF:110) — DECIDE ON FIRST VALUE OF BENEFICIARIO-V.STATUS.
  switch (status) {
    case "A":
      return "ATIVO";
    case "S":
      return "SUSPENSO";
    case "C":
      return "CANCELADO";
    case "I":
      return "INATIVO";
    case "D":
      return "DESLIGADO";
    default:
      return "DESCONHECIDO";
  }
}

export type PagamentoConsulta = {
  numPagamento: number;
  numCpf: string;
  anoMesRef: number;
  vlrBruto: number;
  vlrLiquido: number;
  sitPagamento: string;
  tipoPgto: string;
};

export type LinhaHistorico = Pick<PagamentoConsulta, "anoMesRef" | "vlrBruto" | "vlrLiquido" | "sitPagamento" | "tipoPgto">;

/**
 * `maisRecentesPrimeiro` solo aparece con D21 corregido: las líneas son los últimos
 * 12 pagos (mayor `numPagamento`) del más reciente al más antiguo.
 */
export type Historico = { linhas: LinhaHistorico[]; mensagem: string | null; maisRecentesPrimeiro?: true };

/**
 * Historial de pagos del CPF (FR-CON-03). Recorre en orden de inserción
 * (`numPagamento` ascendente como aproximación del ISN de Adabas).
 * `quirks` (default = legado) decide si se corrige D21.
 */
export function selecionarHistorico(
  numCpf: string,
  pagamentos: readonly PagamentoConsulta[],
  quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO,
): Historico {
  const recentes = corrige(quirks, "D21");
  // LEGACY-QUIRK(D21): orden de inserción (numPagamento ascendente).
  // CORRECAO(D21): numPagamento DESCENDENTE → los últimos 12, del más reciente al más antiguo.
  const ordenados = [...pagamentos].sort((a, b) => (recentes ? b.numPagamento - a.numPagamento : a.numPagamento - b.numPagamento));
  const linhas: LinhaHistorico[] = [];
  for (const p of ordenados) {
    // RK-e17f09d66201 (CONSBENF:152) — READ BY CPF-BENEF + IF CPF-BENEF NE BENEFICIARIO-V.CPF → ESCAPE BOTTOM:
    // la consulta ya filtra por CPF (equivalente a leer por el descriptor y parar al cambiar
    // de CPF); aquí se descartan por seguridad los de otro CPF, con el mismo resultado.
    if (p.numCpf !== numCpf) continue;
    // RK-0550647253b2 (CONSBENF:156) — ADD 1 TO #QTD-HIST; IF #QTD-HIST > 12 → ESCAPE BOTTOM.
    // LEGACY-QUIRK(D21): se muestran los PRIMEROS 12 pagos leídos (orden de inserción),
    // no los últimos, aunque el título diga "ÚLTIMOS 12".
    // CORRECAO(D21): con el orden descendente, el mismo corte deja los ÚLTIMOS 12.
    if (linhas.length + 1 > MAX_HISTORICO) break;
    linhas.push({ anoMesRef: p.anoMesRef, vlrBruto: p.vlrBruto, vlrLiquido: p.vlrLiquido, sitPagamento: p.sitPagamento, tipoPgto: p.tipoPgto });
  }
  // RK-95a55083feb2 (CONSBENF:166) — IF #QTD-HIST = 0 → 'NENHUM PAGAMENTO ENCONTRADO'.
  const mensagem = linhas.length === 0 ? MSG_NENHUM_PAGAMENTO : null;
  return recentes ? { linhas, mensagem, maisRecentesPrimeiro: true } : { linhas, mensagem };
}

export type BeneficiarioConsulta = {
  numCpf: string;
  nomeCompleto: string;
  dtNascimento: number;
  sexo: string;
  logradouro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: number | null;
  sitBeneficiario: string;
  codPrograma: string;
  vlrRendaFamiliar: number;
  numDependentes: number;
  codRegiao: number;
  nis: string | null;
  dtCadastro: number;
};

/** Ficha FR-CON-01. El CPF sale solo enmascarado (NFR-04). */
export type FichaConsulta = Omit<BeneficiarioConsulta, "numCpf"> & { cpfMascarado: string; statusDescricao: string };

export function montarFicha(b: BeneficiarioConsulta, quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO): FichaConsulta {
  return {
    // LEGACY-QUIRK(D7) / CORRECAO(D7): la máscara depende de la configuración.
    cpfMascarado: mascaraCpfConsulta(b.numCpf, quirks),
    nomeCompleto: b.nomeCompleto,
    dtNascimento: b.dtNascimento,
    sexo: b.sexo,
    logradouro: b.logradouro,
    municipio: b.municipio,
    uf: b.uf,
    cep: b.cep,
    sitBeneficiario: b.sitBeneficiario,
    statusDescricao: descricaoStatus(b.sitBeneficiario),
    codPrograma: b.codPrograma,
    vlrRendaFamiliar: b.vlrRendaFamiliar,
    numDependentes: b.numDependentes,
    codRegiao: b.codRegiao,
    nis: b.nis,
    dtCadastro: b.dtCadastro,
  };
}
