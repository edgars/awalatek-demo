import type { PrismaClient } from "@/generated/prisma/client";
import {
  descontoRegistradoSchema,
  MENSAGENS_DESCONTOS,
  mensagemGravados,
  validarLimiteDescontos,
  type DescontoRegistrado,
} from "@/domain/beneficiario/descontosRegistrados";
import { descontoVigente } from "@/domain/calculo/descontos";
import { hoje } from "@/domain/legacyDate";
import { obterBeneficiario } from "@/server/beneficiarios";
import { prisma } from "@/server/db";

// Casos de uso de los descuentos registrados del beneficiario (story 2.5).
// Orquesta dominio + Prisma, sin lógica de negocio propia. No calcula descuentos
// ni toca Pagamento/PagamentoDesconto (eso es E4). Sin auditoría.

export type DescontoListado = DescontoRegistrado & { occurrence: number; vigenteHoje: boolean };

export type ResultadoListagem =
  | { ok: false; mensagem: string }
  | {
      ok: true;
      beneficiario: { numCpf: string; nomeCompleto: string; sitBeneficiario: string };
      descontos: DescontoListado[];
    };

export type ResultadoGravacao =
  | { ok: false; mensagem: string }
  | { ok: true; mensagem: string; vigentes: boolean[] };

/** Descuentos del beneficiario ordenados por `occurrence`, con el indicador "vigente hoje". */
export async function listarDescontosRegistrados(
  cpf: string,
  db: PrismaClient = prisma,
  dtHoje: number = hoje().data,
): Promise<ResultadoListagem> {
  const b = await obterBeneficiario(cpf, db);
  if (!b) return { ok: false, mensagem: MENSAGENS_DESCONTOS.beneficiarioNaoEncontrado };
  const filas = await db.beneficiarioDesconto.findMany({ where: { beneficiarioId: b.id }, orderBy: { occurrence: "asc" } });
  return {
    ok: true,
    beneficiario: { numCpf: b.numCpf, nomeCompleto: b.nomeCompleto, sitBeneficiario: b.sitBeneficiario },
    descontos: filas.map((f) => ({
      occurrence: f.occurrence,
      tipoDesconto: f.tipoDesconto as DescontoRegistrado["tipoDesconto"],
      vlrDesconto: f.vlrDesconto,
      pctDesconto: f.pctDesconto,
      dtInicioDsct: f.dtInicioDsct,
      dtFimDsct: f.dtFimDsct,
      numProcesso: f.numProcesso,
      // FR-DSC-04 — la misma regla de vigencia que usa CALCDSCT (E4), sin duplicarla.
      vigenteHoje: descontoVigente(f, dtHoje),
    })),
  };
}

/** Reemplaza todos los descuentos del beneficiario (occurrence 1..n) en una transacción. */
export async function salvarDescontosRegistrados(
  cpf: string,
  filas: readonly DescontoRegistrado[],
  db: PrismaClient = prisma,
  dtHoje: number = hoje().data,
): Promise<ResultadoGravacao> {
  const limite = validarLimiteDescontos(filas.length);
  if (limite) return { ok: false, mensagem: limite };
  // Defensa en profundidad: el caso de uso exportado vuelve a pasar cada fila por el
  // esquema completo (dominio del tipo, Int32, fechas de calendario, N3.2, reglas cruzadas).
  const validas: DescontoRegistrado[] = [];
  for (const [i, f] of filas.entries()) {
    const r = descontoRegistradoSchema.safeParse(f);
    if (!r.success) return { ok: false, mensagem: `Desconto ${i + 1} — ${r.error.issues[0]?.message ?? "dados inválidos"}` };
    validas.push(r.data);
  }

  const b = await obterBeneficiario(cpf, db);
  if (!b) return { ok: false, mensagem: MENSAGENS_DESCONTOS.beneficiarioNaoEncontrado };

  await db.$transaction([
    db.beneficiarioDesconto.deleteMany({ where: { beneficiarioId: b.id } }),
    db.beneficiarioDesconto.createMany({
      data: validas.map((f, i) => ({
        beneficiarioId: b.id,
        occurrence: i + 1,
        tipoDesconto: f.tipoDesconto,
        vlrDesconto: f.vlrDesconto,
        pctDesconto: f.pctDesconto,
        dtInicioDsct: f.dtInicioDsct,
        dtFimDsct: f.dtFimDsct,
        numProcesso: f.numProcesso,
      })),
    }),
  ]);
  return { ok: true, mensagem: mensagemGravados(validas.length), vigentes: validas.map((f) => descontoVigente(f, dtHoje)) };
}
