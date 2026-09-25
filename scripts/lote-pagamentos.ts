import "dotenv/config";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { linhasResumo } from "../src/domain/calculo/lote.ts";
import { detalheErroQuirks, lerQuirks, type Quirks } from "../src/domain/quirks.ts";

// CLI do lote mensal (BATCHPGT, FR-LOT): `npm run lote:pagamentos`.
// Usa DATABASE_URL (ambiente ou .env) e a data de hoje (TZ) como data de execução.
// `--data=AAAAMMDD` (opcional) fixa a data de execução (reprocessamento/testes).
// Imprime o resumo final; código de saída ≠ 0 em erro inesperado ou lote já em execução.
// SIGINT/SIGTERM: libera o cadeado do lote antes de sair (130/143).

/** `--data=AAAAMMDD` → número; ausente → undefined; inválido → null. */
export function dataDoArgumento(argv: readonly string[]): number | undefined | null {
  const arg = argv.find((a) => a.startsWith("--data="));
  if (arg === undefined) return undefined;
  const v = arg.slice("--data=".length);
  if (!/^\d{8}$/.test(v)) return null;
  const n = Number(v);
  const mes = Math.floor(n / 100) % 100;
  const dia = n % 100;
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? n : null;
}

/** Corrida del CLI; devuelve el código de salida. `env`/`argv` inyectables para los tests. */
export async function main(env: Record<string, string | undefined> = process.env, argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  // D8/D17: correcciones leídas una vez por corrida (misma configuración que el individual).
  // Configuración inválida → error de configuración sin datos personales y salida ≠ 0.
  let quirks: Quirks;
  try {
    quirks = lerQuirks(env);
  } catch (e) {
    console.error("Falha no lote:", detalheErroQuirks(e));
    return 2;
  }
  const dtHoje = dataDoArgumento(argv);
  if (dtHoje === null) {
    console.error("Falha no lote: --data deve ser AAAAMMDD.");
    return 2;
  }
  const { prisma } = await import("../src/server/db.ts");
  const { ejecutarLotePagamentos } = await import("../src/server/lotePagamentos.ts");
  try {
    console.log("=====================================");
    console.log("BATCHPGT - GERACAO PAGAMENTOS MENSAL");
    console.log("=====================================");
    const r = await ejecutarLotePagamentos({ quirks, dtHoje });
    if (!r.ok) {
      console.error(r.mensagem);
      // Interrompido (erro inesperado ou cadeado perdido): imprime o resumo parcial.
      if (r.resumo) for (const linha of linhasResumo(r.resumo)) console.log(linha);
      return 1;
    }
    for (const linha of linhasResumo(r.resumo)) console.log(linha);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

/** true si este módulo es el punto de entrada (tsx o el bundle dist/), no un import de test. */
function ehPontoDeEntrada(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
}

/** Interrupción: suelta el candado (si ya se tomó) y sale con 128 + nº de la señal. */
function tratarSinais(): void {
  const sair = (sinal: "SIGINT" | "SIGTERM", codigo: number) => {
    process.once(sinal, () => {
      console.error(`Lote interrompido (${sinal}).`);
      import("../src/server/processoLock.ts")
        .then(({ liberarLocksDoProcesso }) => liberarLocksDoProcesso())
        .catch(() => undefined) // o cadeado expira sozinho
        .finally(() => process.exit(codigo));
    });
  };
  sair("SIGINT", 130);
  sair("SIGTERM", 143);
}

if (ehPontoDeEntrada()) {
  tratarSinais();
  main().then(
    (codigo) => process.exit(codigo),
    (err: unknown) => {
      // Sem dados pessoais: só o tipo/mensagem técnica do erro.
      console.error("Falha no lote:", err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
