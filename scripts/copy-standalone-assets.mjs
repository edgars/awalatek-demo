// postbuild: el servidor standalone (`node .next/standalone/server.js`) no incluye
// `.next/static` ni `public/`; se copian para que `npm start` sirva CSS/JS (ADR-007).
import { cpSync, existsSync } from "node:fs";

const standalone = ".next/standalone";
if (existsSync(standalone)) {
  cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
  if (existsSync("public")) cpSync("public", `${standalone}/public`, { recursive: true });
}
