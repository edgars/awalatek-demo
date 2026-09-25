import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { hoje } from "@/domain/legacyDate";
import { consolidarGrupos, type Consolidado, type GrupoConsolidado } from "@/domain/relatorios/consolidado";
import { QUIRKS_PADRAO, type Quirks } from "@/domain/quirks";
import { prisma } from "@/server/db";

// Informe consolidado mensual (BATCHREL, story 7.2). Solo lectura: la base agrega los
// pagos de la competencia por región del beneficiario × status (volumen: no se cargan
// los pagos en memoria) y el dominio aplica las reglas (D10/D11) sobre los grupos.

export type RelatorioConsolidado = Consolidado & { dataEmissao: number };

/** Entero SQLite (el adapter devuelve `bigint` con safeIntegers) → número seguro; fuera de rango → error explícito. */
const inteiro = z.union([z.number(), z.bigint()]).transform((v, ctx) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) {
    ctx.addIssue({ code: "custom", message: "valor fora do intervalo seguro" });
    return z.NEVER;
  }
  return n;
});

/** Forma de cada fila de la agregación, validada en tiempo de ejecución (SQL crudo sin tipos). */
const linhaAgregadaSchema = z.object({
  // LEFT JOIN: NULL = beneficiario inexistente.
  codRegiao: inteiro.nullable(),
  sitPagamento: z.string(),
  brutoNegativo: inteiro.nullable(),
  qtd: inteiro,
  // SUM de columnas NOT NULL en un grupo no vacío: nunca NULL; se tolera por robustez.
  bruto: inteiro.nullable().transform((v) => v ?? 0),
  desconto: inteiro.nullable().transform((v) => v ?? 0),
  liquido: inteiro.nullable().transform((v) => v ?? 0),
});

/** Error explícito cuando los totales no caben en enteros seguros (SUM de SQLite desborda en int64). */
class TotalConsolidadoForaDoIntervalo extends Error {
  constructor() {
    super("total do consolidado fora do intervalo de inteiros seguros");
    this.name = "TotalConsolidadoForaDoIntervalo";
  }
}

function ehEstouroSqlite(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    if (/integer overflow/i.test(String((x as { message?: unknown }).message ?? ""))) return true;
  }
  return /integer overflow/i.test(JSON.stringify((e as { meta?: unknown } | null)?.meta ?? ""));
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
  // El LEFT JOIN no multiplica pagos porque `Beneficiario.numCpf` es UNIQUE (índice
  // `Beneficiario_numCpf_key`, verificado por test): cada pago encuentra 0 o 1 beneficiario.
  // Los brutos negativos se agrupan por valor: el redondeo D11 no es lineal sobre ellos.
  // SUM (exacto en int64) y no TOTAL (float): un desborde lanza error y se traduce abajo.
  let brutas: unknown[];
  try {
    brutas = await db.$queryRaw<unknown[]>`
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
  } catch (e) {
    if (ehEstouroSqlite(e)) throw new TotalConsolidadoForaDoIntervalo();
    throw e;
  }
  const lidas = z.array(linhaAgregadaSchema).safeParse(brutas);
  if (!lidas.success) {
    if (lidas.error.issues.some((i) => i.message === "valor fora do intervalo seguro")) throw new TotalConsolidadoForaDoIntervalo();
    throw new Error("agregação do consolidado com formato inesperado");
  }
  const grupos: GrupoConsolidado[] = lidas.data;
  return { ...consolidarGrupos(competencia, grupos, quirks), dataEmissao: hoje(agora).data };
}
