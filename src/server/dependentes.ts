import type { PrismaClient } from "@/generated/prisma/client";
import {
  decidirInclusao,
  MENSAGENS_CADDEPEND,
  MENSAGENS_SISTEMA_DEPENDENTES,
  mensagemIncluido,
  type DadosDependente,
} from "@/domain/beneficiario/dependentes";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Casos de uso de dependientes (CADDEPEND). Orquesta dominio + Prisma, sin lógica de
// negocio propia. CADDEPEND solo incluye (no edita ni borra) y no registra auditoría.

export type FalhaDependente = { ok: false; mensagens: string[] };
export type SucessoDependente = { ok: true; mensagens: string[]; total: number; numCpf: string };
export type ResultadoDependente = SucessoDependente | FalhaDependente;

function usuarioOperativo(): string {
  const u = process.env.SIFAP_USER?.trim();
  if (!u) throw new Error("usuário operativo não informado (SIFAP_USER)");
  return u.slice(0, 8);
}

type ErroPrisma = {
  code?: string;
  meta?: { target?: string | string[]; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } };
};

/** P2002 del unique `(beneficiarioId, cpfDependente)`; cualquier otro unique no es "CPF duplicado". */
function ehCpfDependenteDuplicado(e: unknown): boolean {
  const erro = e as ErroPrisma | null;
  if (erro?.code !== "P2002") return false;
  // Con driver adapter, los campos llegan en meta.driverAdapterError.cause.constraint.fields.
  const campos = [erro.meta?.target ?? [], erro.meta?.driverAdapterError?.cause?.constraint?.fields ?? []].flat();
  return campos.some((c) => c.includes("cpfDependente"));
}

/** Sinal interno para abortar a transação devolvendo uma falha de negócio. */
class FalhaTransacao extends Error {
  constructor(readonly mensagens: string[]) {
    super("falha de negócio");
  }
}

/**
 * Titular + dependentes das ocorrências 1..numDependentes (as que o legado enxerga).
 * `null` = titular não encontrado.
 */
export async function listarDependentes(numCpf: string, db: PrismaClient = prisma) {
  if (!/^\d{11}$/.test(numCpf)) return null;
  const titular = await db.beneficiario.findUnique({
    where: { numCpf },
    select: { id: true, numCpf: true, nomeCompleto: true, sitBeneficiario: true, numDependentes: true },
  });
  if (!titular) return null;
  const dependentes = await db.beneficiarioDependente.findMany({
    where: { beneficiarioId: titular.id, occurrence: { gte: 1, lte: titular.numDependentes } },
    orderBy: { occurrence: "asc" },
    select: {
      occurrence: true,
      nomeDependente: true,
      dtNascDepend: true,
      parentesco: true,
      cpfDependente: true,
      docDependente: true,
      sexoDependente: true,
    },
  });
  return { titular, dependentes };
}

/**
 * Inclusão de um dependente (uma volta do laço de CADDEPEND). A escrita da ocorrência
 * `numDependentes + 1` e o incremento do contador ficam na mesma transação.
 */
export async function incluirDependente(numCpf: string, dados: DadosDependente, db: PrismaClient = prisma): Promise<ResultadoDependente> {
  const usuario = usuarioOperativo();
  try {
    return await db.$transaction(async (tx) => {
      const titular = /^\d{11}$/.test(numCpf)
        ? await tx.beneficiario.findUnique({
            where: { numCpf },
            select: { id: true, numCpf: true, sitBeneficiario: true, numDependentes: true },
          })
        : null;
      const ocorrencias = titular
        ? await tx.beneficiarioDependente.findMany({
            where: { beneficiarioId: titular.id },
            select: { occurrence: true, cpfDependente: true },
          })
        : [];
      const decisao = decidirInclusao(titular, dados, ocorrencias);
      if (!decisao.ok || !titular) throw new FalhaTransacao(decisao.ok ? [MENSAGENS_CADDEPEND.naoEncontrado] : decisao.mensagens);

      // Control optimista: el contador leído debe seguir vigente (otra inclusión concurrente lo cambiaría).
      const agora = hoje();
      const r = await tx.beneficiario.updateMany({
        where: { id: titular.id, numDependentes: titular.numDependentes },
        data: {
          numDependentes: decisao.total,
          dtUltAlteracao: agora.data,
          hrUltAlteracao: agora.hora,
          usrUltAlteracao: usuario,
          numVersao: { increment: 1 },
        },
      });
      if (r.count === 0) throw new FalhaTransacao([MENSAGENS_SISTEMA_DEPENDENTES.concorrencia]);

      // Como el `MOVE ... (#IDX)` del PE: escribe la ocurrencia n + 1, sobrescribiendo si existiera.
      // Todas las columnas no clave se escriben: una fila sobrante no deja valores heredados.
      const campos = {
        nomeDependente: dados.nomeDependente,
        dtNascDepend: dados.dtNascDepend,
        parentesco: dados.parentesco,
        cpfDependente: dados.cpfDependente,
        docDependente: dados.docDependente,
        sexoDependente: dados.sexoDependente,
        sitDependente: null,
        indDeficiencia: null,
      };
      await tx.beneficiarioDependente.upsert({
        where: { beneficiarioId_occurrence: { beneficiarioId: titular.id, occurrence: decisao.occurrence } },
        create: { beneficiarioId: titular.id, occurrence: decisao.occurrence, ...campos },
        update: campos,
      });
      return { ok: true as const, mensagens: [mensagemIncluido(decisao.total)], total: decisao.total, numCpf: titular.numCpf };
    });
  } catch (e) {
    if (e instanceof FalhaTransacao) return { ok: false, mensagens: e.mensagens };
    // El unique (beneficiarioId, cpfDependente) también cubre ocurrencias por encima del
    // contador que el legado no recorre: se informa como duplicado.
    if (ehCpfDependenteDuplicado(e)) return { ok: false, mensagens: [MENSAGENS_CADDEPEND.cpfDuplicado] };
    throw e;
  }
}
