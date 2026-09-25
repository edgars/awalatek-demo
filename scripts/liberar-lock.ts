import "dotenv/config";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Runbook de candado trabado: `npm run lock:liberar -- <nome>` (LOTE-PAGAMENTOS ou
// CONCILIACAO). Remove à força o cadeado entre processos (tabla ProcessoLock) e imprime
// o que removeu. Usar só com certeza de que nenhum lote/conciliação está rodando.
// Saída: 0 removido ou inexistente; 2 nome inválido.

/** Corrida del CLI; devuelve el código de salida. `argv` inyectable para los tests. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { NOMES_LOCK, forcarLiberacao } = await import("../src/server/processoLock.ts");
  const nome = argv[0]?.trim().toUpperCase() ?? "";
  if (!(NOMES_LOCK as readonly string[]).includes(nome)) {
    console.error(`Uso: npm run lock:liberar -- <${NOMES_LOCK.join("|")}>`);
    return 2;
  }
  const { prisma } = await import("../src/server/db.ts");
  try {
    const removido = await forcarLiberacao(prisma, nome);
    if (!removido) {
      console.log(`Nenhum cadeado ${nome} encontrado.`);
    } else {
      console.log(`Cadeado ${nome} removido (dono ${removido.dono}, adquirido em ${removido.adquiridoEm.toISOString()}).`);
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

function ehPontoDeEntrada(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(arg)).href;
  } catch {
    return false;
  }
}

if (ehPontoDeEntrada()) {
  main().then(
    (codigo) => process.exit(codigo),
    (err: unknown) => {
      console.error("Falha ao liberar o cadeado:", err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
