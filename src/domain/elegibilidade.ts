import { z } from "zod";
import { normalizaCpfNumerico } from "./cpf";
import { anoDe, idadePorAno } from "./legacyDate";
import { corrige, QUIRKS_PADRAO, type Quirks } from "./quirks";

// Reglas del programa legado VALELEG (FR-ELG-01..07): elegibilidad de un beneficiario
// para un programa social. Precondiciones que cortan, región 99 (D12) y luego
// acumulación de **todos** los motivos de rechazo (máx. 10) en el orden del legado:
// status → edad mín. → edad máx. → renta máx. → tipo → código específico.
// Solo lectura: no graba ni audita. TypeScript puro: sin Prisma ni Next.

/** Mensajes literales del legado (mayúsculas, portugués, sin tildes). */
export const MENSAGENS_VALELEG = {
  beneficiarioNaoEncontrado: "BENEFICIARIO NAO ENCONTRADO",
  programaNaoEncontrado: "PROGRAMA NAO ENCONTRADO",
  programaInativo: "PROGRAMA INATIVO",
  regiaoEspecial: "BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL",
  suspenso: "BENEFICIARIO SUSPENSO",
  canceladoDesligado: "BENEFICIARIO CANCELADO/DESLIGADO",
  inativo: "BENEFICIARIO INATIVO",
  idadeInferior: "IDADE INFERIOR AO MINIMO DO PROGRAMA",
  idadeSuperior: "IDADE SUPERIOR AO MAXIMO DO PROGRAMA",
  rendaAcimaTeto: "RENDA FAMILIAR ACIMA DO TETO DO PROGRAMA",
  assistencialRenda: "PROG ASSISTENCIAL: RENDA > 600 SEM DEPENDENTES",
  documentacaoIncompleta: "DOCUMENTACAO INCOMPLETA",
  previdenciarioIdade: "PROG PREVIDENCIARIO: IDADE < 60",
  trabalhoIdade: "PROG TRABALHO: IDADE FORA DA FAIXA 16-65",
  tipoDesconhecido: "TIPO PROGRAMA DESCONHECIDO",
  nisNaoCadastrado: "NIS NAO CADASTRADO",
  requerDependentes: "PROGRAMA REQUER DEPENDENTES",
  elegivel: "BENEFICIARIO ELEGIVEL PARA O PROGRAMA",
  naoElegivel: "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:",
} as const;

/** #MOTIVO (A60/10): tamaño de la tabla de motivos del legado. */
export const MAX_MOTIVOS_VALELEG = 10;

/** Región especial (internacional/diplomático) — LEGACY-QUIRK(D12). */
export const REGIAO_ESPECIAL = 99;

/** Umbral de renta del programa asistencial: 600,00 en centavos. */
export const RENDA_LIMITE_ASSISTENCIAL = 60000;

/** Campos del beneficiario que lee VALELEG (BENEFICIARIO-V). Montos en centavos. */
export type BeneficiarioElegibilidade = {
  dtNascimento: number;
  sitBeneficiario: string;
  vlrRendaFamiliar: number;
  numDependentes: number;
  codRegiao: number;
  nis: string | null;
  documentosOk: string | null;
};

/** Campos del programa que lee VALELEG (PROGRAMA-V). Montos en centavos; 0 = sin límite. */
export type ProgramaElegibilidade = {
  sitPrograma: string;
  tipoPrograma: string;
  codElegibilidade: string | null;
  rendaMaxPercap: number;
  idadeMin: number;
  idadeMax: number;
};

export type ResultadoElegibilidade =
  /** Precondición fallida (FR-ELG-01): solo el mensaje, nada más evaluado. */
  | { tipo: "precondicao"; mensagem: string }
  /** Región 99 (FR-ELG-02, D12): elegible sin verificaciones. */
  | { tipo: "regiaoEspecial"; elegivel: true; mensagem: string }
  /** Evaluación completa (FR-ELG-03..07). */
  | { tipo: "avaliado"; elegivel: boolean; mensagem: string; motivos: string[] };

/** Año actual a partir de la fecha del sistema AAAAMMDD. */
export function anoAtualDe(datn: number): number {
  // RK-ba073668b27b (VALELEG:59): COMPUTE #ANO-ATUAL = *DATN / 10000.
  return anoDe(datn);
}

/** Edad por año, como el legado (sin mes/día). */
export function idadeElegibilidade(dtNascimento: number, anoAtual: number): number {
  // RK-80016581d919 (VALELEG:72): COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000.
  // RK-8c8b79c28087 (VALELEG:73): COMPUTE #IDADE = #ANO-ATUAL - #ANO-NASC.
  return idadePorAno(dtNascimento, anoAtual);
}

/** `#COD-ELEG NE ' '`: null, "" o solo espacios = vacío. */
function codigoPreenchido(cod: string | null): cod is string {
  return cod != null && cod.trim() !== "";
}

/** `BENEFICIARIO-V.NIS = 0`: null, vacío o solo ceros (N11). */
function nisZero(nis: string | null): boolean {
  return nis == null || /^0*$/.test(nis.trim());
}

/**
 * Evalúa la elegibilidad del beneficiario para el programa (VALELEG).
 * `null` = registro no encontrado. `anoAtual` se inyecta (fecha del sistema).
 * `quirks` decide D12 (default = legado).
 */
export function avaliarElegibilidade(
  benef: BeneficiarioElegibilidade | null,
  programa: ProgramaElegibilidade | null,
  anoAtual: number,
  quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO,
): ResultadoElegibilidade {
  // RK-d1fd785bcf1c (VALELEG:81): IF NOT #FOUND-B → 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE.
  if (!benef) return { tipo: "precondicao", mensagem: MENSAGENS_VALELEG.beneficiarioNaoEncontrado };
  const idade = idadeElegibilidade(benef.dtNascimento, anoAtual);
  // RK-994493fceb7b (VALELEG:94): IF NOT #FOUND-P → 'PROGRAMA NAO ENCONTRADO' / ESCAPE ROUTINE.
  if (!programa) return { tipo: "precondicao", mensagem: MENSAGENS_VALELEG.programaNaoEncontrado };
  // RK-74d42c778166 (VALELEG:99): IF PROGRAMA-V.STATUS-PROG NE 'A' → 'PROGRAMA INATIVO' / ESCAPE ROUTINE.
  if (programa.sitPrograma !== "A") return { tipo: "precondicao", mensagem: MENSAGENS_VALELEG.programaInativo };

  // RK-86ee7c50f9f4 (VALELEG:107): IF #COD-REG = 99 → 'BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL' / ESCAPE ROUTINE.
  // LEGACY-QUIRK(D12): la región 99 es elegible sin NINGUNA otra verificación (status,
  // documentos, edad, renta). Decisión registrada: replicar por defecto.
  // CORRECAO(D12): con D12 corregido la región 99 no corta y pasa por todas las
  // verificaciones normales (sigue abajo como cualquier otra región).
  if (benef.codRegiao === REGIAO_ESPECIAL && !corrige(quirks, "D12")) {
    return { tipo: "regiaoEspecial", elegivel: true, mensagem: MENSAGENS_VALELEG.regiaoEspecial };
  }

  const motivos: string[] = [];
  // ADD 1 TO #QTD-MOT / MOVE … TO #MOTIVO(#QTD-MOT) / MOVE FALSE TO #ELEGIVEL.
  // El máximo alcanzable hoy es 7: el tope de la tabla A60/10 nunca se alcanza.
  const acumular = (m: string) => {
    if (motivos.length < MAX_MOTIVOS_VALELEG) motivos.push(m);
  };

  const status = benef.sitBeneficiario;
  // RK-9a4651f7dd24 (VALELEG:116): IF #STATUS-BENEF NE 'A' (un status fuera de S/C/D/I no genera motivo).
  // LEGACY-QUIRK(D18): un status en blanco (grabado por CADBENEF en la alteración con el flag
  // D18) no es 'A' pero tampoco S/C/D/I: VALELEG no tiene regla para él y no genera motivo de
  // status (el resto de verificaciones sigue). Se replica.
  if (status !== "A") {
    // RK-7c608b834e79 (VALELEG:117): IF #STATUS-BENEF = 'S' → 'BENEFICIARIO SUSPENSO'.
    if (status === "S") acumular(MENSAGENS_VALELEG.suspenso);
    // RK-fc541e8adcfc (VALELEG:122): IF #STATUS-BENEF = 'C' OR = 'D' → 'BENEFICIARIO CANCELADO/DESLIGADO'.
    else if (status === "C" || status === "D") acumular(MENSAGENS_VALELEG.canceladoDesligado);
    // RK-4ff3d6cc6794 (VALELEG:127): IF #STATUS-BENEF = 'I' → 'BENEFICIARIO INATIVO'.
    else if (status === "I") acumular(MENSAGENS_VALELEG.inativo);
  }

  // RK-06883f7fa2f7 (VALELEG:139): IF PROGRAMA-V.IDADE-MIN > 0.
  if (programa.idadeMin > 0) {
    // RK-2cb07a956769 (VALELEG:140): IF #IDADE < IDADE-MIN → 'IDADE INFERIOR AO MINIMO DO PROGRAMA'.
    if (idade < programa.idadeMin) acumular(MENSAGENS_VALELEG.idadeInferior);
  }
  // RK-dd82bfe9d500 (VALELEG:146): IF PROGRAMA-V.IDADE-MAX > 0.
  if (programa.idadeMax > 0) {
    // RK-50e8ebafa202 (VALELEG:147): IF #IDADE > IDADE-MAX → 'IDADE SUPERIOR AO MAXIMO DO PROGRAMA'.
    if (idade > programa.idadeMax) acumular(MENSAGENS_VALELEG.idadeSuperior);
  }
  // RK-5f1dcae4ccb7 (VALELEG:157): IF PROGRAMA-V.RENDA-MAX > 0 (centavos).
  if (programa.rendaMaxPercap > 0) {
    // RK-4c6d057f4ecb (VALELEG:158): IF #RENDA > RENDA-MAX → 'RENDA FAMILIAR ACIMA DO TETO DO PROGRAMA'.
    if (benef.vlrRendaFamiliar > programa.rendaMaxPercap) acumular(MENSAGENS_VALELEG.rendaAcimaTeto);
  }

  // RK-d9a36a3c8a42 (VALELEG:168): DECIDE ON FIRST VALUE OF #TIPO-PROG (A / P / T / NONE).
  switch (programa.tipoPrograma) {
    case "A":
      // RK-e5d581584c6d (VALELEG:171): IF #RENDA > 600.00 (60000 centavos).
      if (benef.vlrRendaFamiliar > RENDA_LIMITE_ASSISTENCIAL) {
        // RK-b63f2863cdab (VALELEG:172): IF #NUM-DEP < 1 → 'PROG ASSISTENCIAL: RENDA > 600 SEM DEPENDENTES'.
        if (benef.numDependentes < 1) acumular(MENSAGENS_VALELEG.assistencialRenda);
      }
      // RK-aa4425811246 (VALELEG:178): IF #DOCS-OK NE 'S' → 'DOCUMENTACAO INCOMPLETA' (independiente de la renta).
      if (benef.documentosOk !== "S") acumular(MENSAGENS_VALELEG.documentacaoIncompleta);
      break;
    case "P":
      // RK-093a02fbe84e (VALELEG:185): IF #IDADE < 60 → 'PROG PREVIDENCIARIO: IDADE < 60'.
      if (idade < 60) acumular(MENSAGENS_VALELEG.previdenciarioIdade);
      break;
    case "T":
      // RK-7aeaee84c79d (VALELEG:192): IF #IDADE < 16 OR #IDADE > 65 → 'PROG TRABALHO: IDADE FORA DA FAIXA 16-65'.
      if (idade < 16 || idade > 65) acumular(MENSAGENS_VALELEG.trabalhoIdade);
      break;
    default:
      // NONE (VALELEG:197) → 'TIPO PROGRAMA DESCONHECIDO'.
      acumular(MENSAGENS_VALELEG.tipoDesconhecido);
  }

  const cod = programa.codElegibilidade;
  // RK-0cfdfa24b877 (VALELEG:206): IF #COD-ELEG NE ' ' → PERFORM VERIF-ELEG-ESPECIFICA.
  if (codigoPreenchido(cod)) {
    // RK-3e570ba9c17c (VALELEG:226): IF SUBSTR(#COD-ELEG,1,1) = 'R' (requiere NIS válido).
    if (cod[0] === "R") {
      // RK-d7bb85d92636 (VALELEG:228): IF BENEFICIARIO-V.NIS = 0 → 'NIS NAO CADASTRADO'.
      if (nisZero(benef.nis)) acumular(MENSAGENS_VALELEG.nisNaoCadastrado);
    }
    // RK-af932d091e75 (VALELEG:234): IF SUBSTR(#COD-ELEG,2,1) = 'D' (requiere dependientes).
    if (cod[1] === "D") {
      // RK-5f5731566730 (VALELEG:236): IF #NUM-DEP = 0 → 'PROGRAMA REQUER DEPENDENTES'.
      if (benef.numDependentes === 0) acumular(MENSAGENS_VALELEG.requerDependentes);
    }
  }

  // RK-bd27c2ba8977 (VALELEG:213): IF #ELEGIVEL → 'BENEFICIARIO ELEGIVEL PARA O PROGRAMA'
  // ELSE 'BENEFICIARIO NAO ELEGIVEL - MOTIVOS:' + FOR #I: WRITE #I '-' #MOTIVO(#I).
  const elegivel = motivos.length === 0;
  return {
    tipo: "avaliado",
    elegivel,
    mensagem: elegivel ? MENSAGENS_VALELEG.elegivel : MENSAGENS_VALELEG.naoElegivel,
    motivos,
  };
}

/** Salida en el formato del legado: resultado + "n - motivo" por línea. */
export function linhasResultado(r: ResultadoElegibilidade): string[] {
  if (r.tipo !== "avaliado") return [r.mensagem];
  return [r.mensagem, ...r.motivos.map((m, i) => `${i + 1} - ${m}`)];
}

// ---------------------------------------------------------------------------
// Borde (pantalla /elegibilidade): solo normaliza la entrada al formato legado;
// la existencia la deciden las precondiciones (CPF vacío = 0 → no encontrado).

export const entradaElegibilidadeSchema = z.object({
  // #CPF N11: dígitos con ceros a la izquierda.
  numCpf: z.string().transform(normalizaCpfNumerico),
  // #COD-PROG: código del programa (String(4) en el modelo).
  codPrograma: z.string().transform((s) => s.trim().toUpperCase().slice(0, 4)),
});

export type EntradaElegibilidade = z.infer<typeof entradaElegibilidadeSchema>;
