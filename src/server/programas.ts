import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { formatarReais } from "@/domain/money";
import {
  calcularFatorK,
  calcularVlrBaseAjustado,
  decidirValorBase,
  DESCRICOES_AUDITORIA_PROGRAMA,
  MAX_CENTAVOS_INT32,
  MENSAGENS_ALTERACAO_PROGRAMA,
  MENSAGENS_PROGRAMA,
  mensagemInclusao,
  mensagemSituacao,
  resultadoConsulta,
  TABELA_AUDITORIA_PROGRAMA,
  transicaoSituacao,
  validarLimiteFaixas,
  validarLimiteParamsRegionais,
  verificarDuplicidade,
  type AcaoSituacao,
  type AlteracaoPrograma,
  type FaixaCalculo,
  type InclusaoPrograma,
  type ParamRegional,
} from "@/domain/programa";
import { registrarEvento } from "@/server/auditoria";
import { prisma } from "@/server/db";
import { comRetry, ehColisaoNumAuditoria, violaUnico } from "@/server/unicidade";
import { usuarioOperativo } from "@/server/usuario";

// Casos de uso de programas (CADPROG). Orquesta dominio + Prisma, sin lógica de
// negocio propia. CADPROG no registra auditoría: la inclusión no llama a
// registrarEvento; la alteración/situación (story 1.2, fuera del legado) sí.

export const TAMANHO_PAGINA = 10;

export type Falha = { ok: false; mensagem: string };
export type Resultado = { ok: true; mensagem: string } | Falha;

export async function listarProgramas(
  { q = "", pagina = 1 }: { q?: string; pagina?: number } = {},
  db: PrismaClient = prisma,
) {
  const termo = q.trim().toUpperCase();
  // Filtro en memoria: SQLite/Prisma no ofrece `contains` sin distinguir
  // mayúsculas de forma portable, y el catálogo de programas es pequeño.
  const todos = await db.programaSocial.findMany({
    orderBy: { codPrograma: "asc" },
    select: {
      codPrograma: true,
      nomePrograma: true,
      siglaPrograma: true,
      tipoPrograma: true,
      sitPrograma: true,
      vlrBaseIndividual: true,
    },
  });
  const filtrados = termo
    ? todos.filter((p) => p.codPrograma.toUpperCase().includes(termo) || p.nomePrograma.toUpperCase().includes(termo))
    : todos;
  const total = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const atual = Math.min(Math.max(1, Math.trunc(pagina) || 1), totalPaginas);
  const itens = filtrados.slice((atual - 1) * TAMANHO_PAGINA, atual * TAMANHO_PAGINA);
  return { itens, total, pagina: atual, totalPaginas };
}

export async function consultarPrograma(cod: string, db: PrismaClient = prisma) {
  const programa = await db.programaSocial.findUnique({
    where: { codPrograma: cod.trim().toUpperCase() },
    include: {
      faixasCalculo: { orderBy: { occurrence: "asc" } },
      paramsRegionais: { orderBy: { occurrence: "asc" } },
    },
  });
  return resultadoConsulta(programa);
}

export async function incluirPrograma(
  dados: InclusaoPrograma,
  db: PrismaClient = prisma,
): Promise<{ ok: true; mensagem: string; dados: { codPrograma: string; fatorK: string; vlrBaseIndividual: number } } | Falha> {
  const existente = await db.programaSocial.findUnique({ where: { codPrograma: dados.codPrograma }, select: { id: true } });
  const duplicado = verificarDuplicidade(existente !== null);
  if (duplicado) return { ok: false, mensagem: duplicado };

  const fatorK = calcularFatorK(dados.fatorReajuste);
  const vlrBaseIndividual = calcularVlrBaseAjustado(dados.vlrBase, fatorK);
  if (vlrBaseIndividual > MAX_CENTAVOS_INT32) {
    return { ok: false, mensagem: "Valor ajustado acima do limite (máx. R$ 21.474.836,47)." };
  }
  const { data } = hoje();
  try {
    await db.programaSocial.create({
      data: {
        codPrograma: dados.codPrograma,
        nomePrograma: dados.nomePrograma,
        tipoPrograma: dados.tipoPrograma,
        dtCriacao: dados.dtInicio,
        dtEncerramento: dados.dtFim,
        sitPrograma: "A",
        vlrBaseIndividual,
        fatorReajuste: dados.fatorReajuste,
        fatorK,
        codElegibilidade: dados.codElegibilidade,
        rendaMaxPercap: dados.rendaMaxima,
        idadeMin: dados.idadeMin,
        idadeMax: dados.idadeMax,
        dtInclusao: data,
        usrInclusao: usuarioOperativo(),
      },
    });
  } catch (e) {
    // Carrera entre la verificación y el insert: la restricción única decide.
    if (violaUnico(e, "codPrograma")) return { ok: false, mensagem: verificarDuplicidade(true)! };
    throw e;
  }
  return {
    ok: true,
    mensagem: mensagemInclusao(vlrBaseIndividual),
    dados: { codPrograma: dados.codPrograma, fatorK, vlrBaseIndividual },
  };
}

// ---------------------------------------------------------------------------
// Story 1.2 — alteración y cambio de situación (funcionalidad nueva, fuera del legado).
// A diferencia de la inclusión (CADPROG no audita), aquí se registra AL en la misma
// transacción: decisión de diseño documentada en docs/prd.md (nota de FR-PRG-01).

export type ResultadoAlteracao = { ok: true; mensagem: string; numVersao: number } | (Falha & { campo?: string });

/** Transacción con auditoría; repetida entera si otro escritor tomó el mismo `numAuditoria`. */
function emTransacaoAuditada<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return comRetry(() => db.$transaction(fn), ehColisaoNumAuditoria, 5);
}

export async function alterarPrograma(cod: string, dados: AlteracaoPrograma, db: PrismaClient = prisma): Promise<ResultadoAlteracao> {
  const codPrograma = cod.trim().toUpperCase();
  const usuario = usuarioOperativo();
  return emTransacaoAuditada(db, async (tx): Promise<ResultadoAlteracao> => {
    const atual = await tx.programaSocial.findUnique({ where: { codPrograma } });
    if (!atual) return naoEncontrado();
    if (atual.numVersao !== dados.numVersao) return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada };

    const valor = decidirValorBase(atual, dados);
    if (!valor.ok) return { ok: false, mensagem: valor.mensagem, campo: valor.campo };

    const novo = {
      nomePrograma: dados.nomePrograma,
      tipoPrograma: dados.tipoPrograma,
      dtCriacao: dados.dtInicio,
      dtEncerramento: dados.dtFim,
      fatorReajuste: dados.fatorReajuste,
      codElegibilidade: dados.codElegibilidade,
      rendaMaxPercap: dados.rendaMaxima,
      idadeMin: dados.idadeMin,
      idadeMax: dados.idadeMax,
      // Sin valor base informado no se toca el valor gravado ni el FATOR-K (sin doble FATOR-K).
      ...(valor.recalculado ? { fatorK: valor.fatorK, vlrBaseIndividual: valor.vlrBaseIndividual } : {}),
    };
    const { data } = hoje();
    // Control optimista: solo graba si la versión leída sigue vigente.
    const r = await tx.programaSocial.updateMany({
      where: { id: atual.id, numVersao: dados.numVersao },
      data: { ...novo, dtUltAlteracao: data, usrUltAlteracao: usuario, numVersao: { increment: 1 } },
    });
    if (r.count === 0) return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada };

    const alterados = (Object.keys(novo) as (keyof typeof novo)[]).filter((k) => atual[k] !== novo[k]);
    await registrarEvento(
      {
        acao: "AL",
        tabela: TABELA_AUDITORIA_PROGRAMA,
        chave: codPrograma,
        usuario,
        descricao: DESCRICOES_AUDITORIA_PROGRAMA.alteracao,
        valorAnterior: resumo(alterados, atual),
        valorPosterior: resumo(alterados, novo),
      },
      tx,
    );
    const sufixo = valor.recalculado ? ` VLR AJUSTADO: ${formatarReais(valor.vlrBaseIndividual)}` : "";
    return { ok: true, mensagem: `${MENSAGENS_ALTERACAO_PROGRAMA.alteradoSucesso}${sufixo}`, numVersao: dados.numVersao + 1 };
  });
}

/** `campo=valor;…` de los campos alterados (datos del programa, sin datos personales). */
function resumo(campos: readonly string[], origem: Record<string, unknown>): string | null {
  return campos.length ? campos.map((c) => `${c}=${origem[c] ?? ""}`).join(";") : null;
}

/** Desactivar (A → I) o reactivar (I → A). Nunca borra el programa. */
export async function alterarSituacaoPrograma(
  cod: string,
  acao: AcaoSituacao,
  numVersao: number,
  db: PrismaClient = prisma,
): Promise<ResultadoAlteracao> {
  const codPrograma = cod.trim().toUpperCase();
  const usuario = usuarioOperativo();
  return emTransacaoAuditada(db, async (tx): Promise<ResultadoAlteracao> => {
    const atual = await tx.programaSocial.findUnique({ where: { codPrograma }, select: { id: true, sitPrograma: true, numVersao: true } });
    if (!atual) return naoEncontrado();
    if (atual.numVersao !== numVersao) return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada };
    const t = transicaoSituacao(atual.sitPrograma, acao);
    if (!t.ok) return t;

    const { data } = hoje();
    const r = await tx.programaSocial.updateMany({
      where: { id: atual.id, numVersao },
      data: { sitPrograma: t.nova, dtUltAlteracao: data, usrUltAlteracao: usuario, numVersao: { increment: 1 } },
    });
    if (r.count === 0) return { ok: false, mensagem: MENSAGENS_ALTERACAO_PROGRAMA.versaoDesatualizada };
    await registrarEvento(
      {
        acao: "AL",
        tabela: TABELA_AUDITORIA_PROGRAMA,
        chave: codPrograma,
        usuario,
        descricao: t.descricao,
        valorAnterior: atual.sitPrograma,
        valorPosterior: t.nova,
      },
      tx,
    );
    return { ok: true, mensagem: mensagemSituacao(codPrograma, t.nova), numVersao: numVersao + 1 };
  });
}

function naoEncontrado(): Falha {
  return { ok: false, mensagem: MENSAGENS_PROGRAMA.naoEncontrado };
}

async function idDoPrograma(db: PrismaClient, cod: string): Promise<number | null> {
  const p = await db.programaSocial.findUnique({ where: { codPrograma: cod.trim().toUpperCase() }, select: { id: true } });
  return p?.id ?? null;
}

/** Reemplaza todas las faixas del programa (occurrence 1..n) en una transacción. */
export async function salvarFaixas(cod: string, filas: FaixaCalculo[], db: PrismaClient = prisma): Promise<Resultado> {
  const limite = validarLimiteFaixas(filas.length);
  if (limite) return { ok: false, mensagem: limite };
  const programaId = await idDoPrograma(db, cod);
  if (programaId === null) return naoEncontrado();
  // LEGACY-QUIRK(D1): se persisten para consulta; el cálculo (E4) no las usa.
  await db.$transaction([
    db.programaFaixaCalculo.deleteMany({ where: { programaId } }),
    db.programaFaixaCalculo.createMany({ data: filas.map((f, i) => ({ ...f, programaId, occurrence: i + 1 })) }),
  ]);
  return { ok: true, mensagem: `Faixas de cálculo gravadas (${filas.length}).` };
}

/** Reemplaza todos los parámetros regionales del programa (occurrence 1..n) en una transacción. */
export async function salvarParamsRegionais(cod: string, filas: ParamRegional[], db: PrismaClient = prisma): Promise<Resultado> {
  const limite = validarLimiteParamsRegionais(filas.length);
  if (limite) return { ok: false, mensagem: limite };
  const programaId = await idDoPrograma(db, cod);
  if (programaId === null) return naoEncontrado();
  // LEGACY-QUIRK(D1): se persisten para consulta; el cálculo (E4) no los usa.
  await db.$transaction([
    db.programaParamRegional.deleteMany({ where: { programaId } }),
    db.programaParamRegional.createMany({ data: filas.map((f, i) => ({ ...f, programaId, occurrence: i + 1 })) }),
  ]);
  return { ok: true, mensagem: `Parâmetros regionais gravados (${filas.length}).` };
}
