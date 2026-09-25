import "dotenv/config";
import { linhasResumo } from "../src/domain/calculo/lote.ts";
import { detalheErroQuirks, lerQuirks, type Quirks } from "../src/domain/quirks.ts";

// CLI do lote mensal (BATCHPGT, FR-LOT): `npm run lote:pagamentos`.
// Usa DATABASE_URL (ambiente ou .env) e a data de hoje (TZ) como data de execução.
// Imprime o resumo final; código de saída ≠ 0 em erro inesperado ou lote já em execução.

async function main(): Promise<number> {
  // D8/D17: correcciones leídas una vez por corrida (misma configuración que el individual).
  // Configuración inválida → error de configuración sin datos personales y salida ≠ 0.
  let quirks: Quirks;
  try {
    quirks = lerQuirks();
  } catch (e) {
    console.error("Falha no lote:", detalheErroQuirks(e));
    return 2;
  }
  const { prisma } = await import("../src/server/db.ts");
  const { ejecutarLotePagamentos } = await import("../src/server/lotePagamentos.ts");
  try {
    console.log("=====================================");
    console.log("BATCHPGT - GERACAO PAGAMENTOS MENSAL");
    console.log("=====================================");
    const r = await ejecutarLotePagamentos({ quirks });
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
