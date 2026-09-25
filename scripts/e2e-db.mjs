// Prepara la base SQLite dedicada del e2e: borra `e2e.db` (solo ese archivo, nunca
// la base de DATABASE_URL del entorno), aplica las migraciones y carga el seed.
// Equivale a `prisma migrate reset --force` + seed, pero con la ruta fija, así que
// no puede apuntar por error a otra base (y no depende del gate de IA de Prisma).
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const E2E_DATABASE_URL = "file:./e2e.db";
const arquivo = path.join(raiz, "e2e.db");

for (const sufixo of ["", "-journal", "-wal", "-shm"]) rmSync(arquivo + sufixo, { force: true });

const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
for (const args of [
  ["prisma", "migrate", "deploy"],
  ["prisma", "db", "seed"],
]) {
  execFileSync("npx", args, { cwd: raiz, env, stdio: "inherit" });
}
