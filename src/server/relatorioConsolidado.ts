import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { consolidarGrupos, type Consolidado, type GrupoConsolidado } from "@/domain/relatorios/consolidado";
import { QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";
import { prisma } from "@/server/db";

// Informe consolidado mensual (BATCHREL, story 7.2). Solo lectura: la base agrega los
// pagos de la competencia por región del beneficiario × status (volumen: no se cargan
// los pagos en memoria) y el dominio aplica las reglas (D10/D11) sobre los grupos.

export type RelatorioConsolidado = Consolidado & { dataEmissao: number };

type LinhaAgregada = {
  codRegiao: number | bigint | null;
  sitPagamento: string;
  brutoNegativo: number | bigint | null;
  qtd: number | bigint;
  bruto: number | bigint | null;
  desconto: number | bigint | null;
  liquido: number | bigint | null;
};

function inteiro(v: number | bigint | null): number {
  const n = Number(v ?? 0);
  if (!Number.isSafeInteger(n)) throw new Error("total fora do intervalo");
  return n;
}

export async function relatorioConsolidado(
  competencia: number,
  db: PrismaClient = prisma,
  {
    agora = new Date(),
    // Configuración LEGACY-QUIRK (D10, D11): la página la lee una vez y la pasa; default = legado.
    quirks = QUIRKS_PADRAO,
  }: { agora?: Date; quirks?: Pick<Quirks, "corrigidos"> } = {},
): Promise<RelatorioConsolidado> {
  // READ PAGAMENTO-V BY COMPETENCIA = #COMPETENCIA + FIND BENEFICIARIO-V WITH CPF = CPF-BENEF
  // (LEFT JOIN: beneficiario inexistente → codRegiao NULL → "resto" en el dominio).
  // Los brutos negativos se agrupan por valor: el redondeo D11 no es lineal sobre ellos.
  const linhas = await db.$queryRaw<LinhaAgregada[]>`
    SELECT b."codRegiao" AS "codRegiao",
           p."sitPagamento" AS "sitPagamento",
           CASE WHEN p."vlrBruto" < 0 THEN p."vlrBruto" END AS "brutoNegativo",
           COUNT(*) AS "qtd",
           SUM(p."vlrBruto") AS "bruto",
           SUM(p."vlrDescontoTotal") AS "desconto",
           SUM(p."vlrLiquido") AS "liquido"
      FROM "Pagamento" p
      LEFT JOIN "Beneficiario" b ON b."numCpf" = p."numCpf"
     WHERE p."anoMesRef" = ${competencia}
     GROUP BY b."codRegiao", p."sitPagamento", CASE WHEN p."vlrBruto" < 0 THEN p."vlrBruto" END`;
  const grupos: GrupoConsolidado[] = linhas.map((l) => ({
    codRegiao: l.codRegiao === null ? null : inteiro(l.codRegiao),
    sitPagamento: l.sitPagamento,
    brutoNegativo: l.brutoNegativo === null ? null : inteiro(l.brutoNegativo),
    qtd: inteiro(l.qtd),
    bruto: inteiro(l.bruto),
    desconto: inteiro(l.desconto),
    liquido: inteiro(l.liquido),
  }));
  return { ...consolidarGrupos(competencia, grupos, quirks), dataEmissao: hoje(agora).data };
}
