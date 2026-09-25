import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import {
  calcularFatorK,
  calcularVlrBaseAjustado,
  MAX_CENTAVOS_INT32,
  MENSAGENS_PROGRAMA,
  mensagemInclusao,
  resultadoConsulta,
  validarLimiteFaixas,
  validarLimiteParamsRegionais,
  verificarDuplicidade,
  type FaixaCalculo,
  type InclusaoPrograma,
  type ParamRegional,
} from "@/domain/programa";
import { prisma } from "@/server/db";
import { violaUnico } from "@/server/unicidade";

// Casos de uso de programas (CADPROG). Orquesta dominio + Prisma, sin lógica de
// negocio propia. CADPROG no registra auditoría: aquí no se llama a registrarEvento.

export const TAMANHO_PAGINA = 10;

export type Falha = { ok: false; mensagem: string };
export type Resultado = { ok: true; mensagem: string } | Falha;

function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}

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
