/** Resumo da conciliação para a tela: CPFs já mascarados (NFR-04). Valores em centavos. */
export interface ResumoConciliacaoTela {
  competencia: number;
  lidos: number;
  conciliados: number;
  divergentes: number;
  naoEncontrados: number;
  auditoria: number;
  /** Registros de detalhe (tipo 3); 0 → aviso "arquivo sem registros de detalhe". */
  detalhes: number;
  divergencias: { numPagamento: number; cpf: string; vlrSifap: number; vlrBanco: number }[];
  listaNaoEncontrados: { cpf: string; documento: string }[];
  /** Mensagens "COD RETORNO DESCONHECIDO: …" com o CPF mascarado. */
  avisos: string[];
  /** CORRECAO(D23): mensagens "DATA PAGAMENTO INVALIDA: DOC=…" (vazio em modo legado). */
  avisosDataPagamento: string[];
}

/**
 * `campo`: controle rejeitado pela validação de forma (zod).
 * `ok: false` com `resumo`: conciliação interrompida por erro inesperado (resumo parcial).
 */
export type EstadoConciliacao =
  | { ok: true; resumo: ResumoConciliacaoTela }
  | { ok: false; mensagem: string; campo?: CampoConciliacao; resumo?: ResumoConciliacaoTela }
  | null;

export type CampoConciliacao = "competencia" | "arquivo";
