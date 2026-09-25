import type { PrismaClient } from "@/generated/prisma/client";
import { anoAtualDe, avaliarElegibilidade, type ResultadoElegibilidade } from "@/domain/elegibilidade";
import { hoje } from "@/domain/legacyDate";
import { prisma } from "@/server/db";

// Caso de uso de elegibilidad (VALELEG). Solo lectura: lee Beneficiario por CPF y
// ProgramaSocial por código y delega en el dominio. VALELEG no graba ni audita.

/**
 * `numCpf`: 11 dígitos (ya normalizado); `codPrograma`: código del programa.
 * `anoAtual` se inyecta en tests; por defecto sale de la fecha del sistema.
 */
export async function verificarElegibilidade(
  numCpf: string,
  codPrograma: string,
  db: PrismaClient = prisma,
  anoAtual: number = anoAtualDe(hoje().data),
): Promise<ResultadoElegibilidade> {
  // FIND BENEFICIARIO-V WITH CPF = #CPF (N11: fuera de formato no encuentra nada).
  const benef = /^\d{11}$/.test(numCpf)
    ? await db.beneficiario.findUnique({
        where: { numCpf },
        select: {
          dtNascimento: true,
          sitBeneficiario: true,
          vlrRendaFamiliar: true,
          numDependentes: true,
          codRegiao: true,
          nis: true,
          documentosOk: true,
        },
      })
    : null;
  // El legado lee el programa aunque falte el beneficiario; el dominio decide el orden de los mensajes.
  // Misma normalización que el borde (entradaElegibilidadeSchema): String(4) en mayúsculas.
  const cod = codPrograma.trim().toUpperCase().slice(0, 4);
  const programa = cod
    ? await db.programaSocial.findUnique({
        where: { codPrograma: cod },
        select: {
          sitPrograma: true,
          tipoPrograma: true,
          codElegibilidade: true,
          rendaMaxPercap: true,
          idadeMin: true,
          idadeMax: true,
        },
      })
    : null;
  return avaliarElegibilidade(benef, programa, anoAtual);
}
