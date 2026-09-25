import { createPrismaClient } from "../../src/server/db.ts";
import { adquirirLock } from "../../src/server/processoLock.ts";

// Processo filho de tests/processo-lock.test.ts: espera até INICIO (epoch ms), disputa o
// cadeado DISPUTA, imprime ADQUIRIDO/OCUPADO e segura o cadeado por um tempo.

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL");
const db = createPrismaClient(url);
const inicio = Number(process.env.INICIO ?? 0);
await new Promise((r) => setTimeout(r, Math.max(0, inicio - Date.now())));
const lock = await adquirirLock(db, "DISPUTA");
console.log(lock ? "ADQUIRIDO" : "OCUPADO");
await new Promise((r) => setTimeout(r, 1500));
await lock?.liberar();
await db.$disconnect();
