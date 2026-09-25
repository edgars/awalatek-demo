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
import { corrige, QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";
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
  // Configuración LEGACY-QUIRK (D7, D21): la acción/página la lee una vez y la pasa; default = legado.
  quirks: Pick<Quirks, "corrigidos"> = QUIRKS_PADRAO,
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

  // READ PAGAMENTO-V BY CPF-BENEF.
  // LEGACY-QUIRK(D21): orden de inserción (numPagamento ascendente ≈ ISN) → los 12 primeros.
  // CORRECAO(D21): competencia y numPagamento descendentes → los 12 más recientes
  // (el dominio los mantiene del más reciente al más antiguo).
  const pagamentos = await db.pagamento.findMany({
    where: { numCpf: b.numCpf },
    orderBy: corrige(quirks, "D21") ? [{ anoMesRef: "desc" }, { numPagamento: "desc" }] : { numPagamento: "asc" },
    take: MAX_HISTORICO,
    select: { numPagamento: true, numCpf: true, anoMesRef: true, vlrBruto: true, vlrLiquido: true, sitPagamento: true, tipoPgto: true },
  });

  return { ok: true, ficha: montarFicha(b, quirks), historico: selecionarHistorico(b.numCpf, pagamentos, quirks) };
}
