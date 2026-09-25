import "dotenv/config";
import { linhasResumo } from "../src/domain/calculo/lote.ts";

// CLI do lote mensal (BATCHPGT, FR-LOT): `npm run lote:pagamentos`.
// Usa DATABASE_URL (ambiente ou .env) e a data de hoje (TZ) como data de execução.
// Imprime o resumo final; código de saída ≠ 0 em erro inesperado ou lote já em execução.

async function main(): Promise<number> {
  const { prisma } = await import("../src/server/db.ts");
  const { ejecutarLotePagamentos } = await import("../src/server/lotePagamentos.ts");
  try {
    console.log("=====================================");
    console.log("BATCHPGT - GERACAO PAGAMENTOS MENSAL");
    console.log("=====================================");
    const r = await ejecutarLotePagamentos();
    if (!r.ok) {
      console.error(r.mensagem);
      // Interrompido por erro inesperado: imprime o resumo parcial.
      if (r.resumo) for (const linha of linhasResumo(r.resumo)) console.log(linha);
      return 1;
    }
    for (const linha of linhasResumo(r.resumo)) console.log(linha);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (err: unknown) => {
    // Sem dados pessoais: só o tipo/mensagem técnica do erro.
    console.error("Falha no lote:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
