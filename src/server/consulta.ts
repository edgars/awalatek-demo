import type { PrismaClient } from "@/generated/prisma/client";
import {
  MAX_HISTORICO,
  montarFicha,
  MSG_BENEFICIARIO_NAO_ENCONTRADO,
  resolverBusca,
  selecionarHistorico,
  type FichaConsulta,
  type Historico,
} from "@/domain/beneficiario/consulta";
import { prisma } from "@/server/db";

// Caso de uso de la consulta de beneficiario (CONSBENF). Solo lectura: CONSBENF no
// graba ni audita, así que aquí no hay escrituras ni registrarEvento.

export type ResultadoConsulta = { ok: true; ficha: FichaConsulta; historico: Historico } | { ok: false; mensagem: string };

const SELECT_BENEFICIARIO = {
  numCpf: true,
  nomeCompleto: true,
  dtNascimento: true,
  sexo: true,
  logradouro: true,
  municipio: true,
  uf: true,
  cep: true,
  sitBeneficiario: true,
  codPrograma: true,
  vlrRendaFamiliar: true,
  numDependentes: true,
  codRegiao: true,
  nis: true,
  dtCadastro: true,
} as const;

export async function consultarBeneficiario(
  { tipo, valor }: { tipo: string; valor: string },
  db: PrismaClient = prisma,
): Promise<ResultadoConsulta> {
  const busca = resolverBusca(tipo, valor);
  if (!busca.ok) return busca;

  // FIND BENEFICIARIO-V WITH CPF = #CPF-BUSCA / WITH NIS = #NIS-BUSCA.
  const b =
    busca.tipo === "C"
      ? /^\d{11}$/.test(busca.numCpf)
        ? await db.beneficiario.findUnique({ where: { numCpf: busca.numCpf }, select: SELECT_BENEFICIARIO })
        : null
      : /^\d{11}$/.test(busca.nis)
        ? await db.beneficiario.findUnique({ where: { nis: busca.nis }, select: SELECT_BENEFICIARIO })
        : null;
  if (!b) return { ok: false, mensagem: MSG_BENEFICIARIO_NAO_ENCONTRADO };

  // READ PAGAMENTO-V BY CPF-BENEF: orden de inserción (numPagamento ascendente ≈ ISN).
  const pagamentos = await db.pagamento.findMany({
    where: { numCpf: b.numCpf },
    orderBy: { numPagamento: "asc" },
    take: MAX_HISTORICO,
    select: { numPagamento: true, numCpf: true, anoMesRef: true, vlrBruto: true, vlrLiquido: true, sitPagamento: true, tipoPgto: true },
  });

  return { ok: true, ficha: montarFicha(b), historico: selecionarHistorico(b.numCpf, pagamentos) };
}
