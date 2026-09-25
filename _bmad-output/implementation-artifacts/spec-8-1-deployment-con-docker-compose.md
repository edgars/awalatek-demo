---
title: 'Story 8.1 — Deployment con docker-compose'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/architecture.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** SIFAP no tiene forma reproducible de desplegarse: no hay imagen, ni compose, ni arranque con migraciones, ni forma de correr el lote mensual en el contenedor.

**Approach:** `Dockerfile` multi-stage (Next.js `output: "standalone"`), `docker-compose.yml` con un único servicio `app` y volumen `sifap-data`, entrypoint que aplica `prisma migrate deploy` y arranca el servidor standalone; el lote corre con `docker compose run --rm app npm run lote:pagamentos`.

## Boundaries & Constraints

**Always:**
- ADR-007 (`docs/architecture.md` §7): un solo servicio `app`, puerto 3000, SQLite en volumen nombrado `sifap-data` montado en `/data` (`DATABASE_URL=file:/data/sifap.db`), sin servicios `db`/`api`.
- Imagen multi-stage sobre Node 24 (bookworm-slim o alpine con toolchain para `better-sqlite3` en la etapa de build): `deps` (npm ci), `build` (`prisma generate` + `next build`), `runner` (usuario no root, solo lo necesario: `.next/standalone`, `.next/static`, `public`, `prisma/` + migraciones, cliente Prisma generado, binario nativo de `better-sqlite3`, y lo necesario para `prisma migrate deploy` y para el lote).
- Arranque (`docker-entrypoint.sh` o equivalente): `prisma migrate deploy` contra `DATABASE_URL` y luego `node server.js` (standalone, `HOSTNAME=0.0.0.0`, `PORT=3000`); si la migración falla, el contenedor termina con error. Seed **no** automático (documentar `docker compose run --rm app npm run db:seed` opcional para demo si es viable, o un script equivalente).
- Lote: `docker compose run --rm app npm run lote:pagamentos` funciona en la imagen final (compilar `scripts/lote-pagamentos.ts` a JS en el build, p. ej. con esbuild/tsc, o incluir `tsx`; el script `lote:pagamentos` debe resolver dentro del contenedor). Exit code ≠ 0 ante error.
- `package.json`: resolver el diferido de 0.1 — script de arranque de producción coherente con standalone, `db:deploy` (`prisma migrate deploy`), `postinstall` que no rompa en la imagen.
- `.dockerignore` (node_modules, .next, *.db, e2e.db, test-results, .env, .claude, _bmad*, etc.).
- `.env.example` documenta **todas** las variables que la app lee (buscar `process.env.` en `src/`, `scripts/`, `prisma/`): al menos `DATABASE_URL`, `SIFAP_USER`, `LEGACY_DOC_ESPECIAL_ENABLED`, `TZ`; test que falle si el código lee una variable no documentada en `.env.example` (lista de exclusiones explícita para `NODE_ENV`, `NEXT_*` internas, `E2E_PORT`, `CI`).
- Datos persisten entre `docker compose down` / `up` (sin `-v`).
- `TZ=America/Sao_Paulo` en la imagen/compose (lo usa `hoje()`).
- README: sección de despliegue (up, lote, seed opcional, backup del volumen).
- Verificación real: construir la imagen y levantar el compose localmente (Docker está disponible), comprobar `curl -f http://localhost:3000` (o puerto mapeado libre), ejecutar el lote en el contenedor, `down` + `up` y verificar que los datos persisten. Usar un nombre de proyecto compose propio (`-p sifap-8-1`) y un puerto host libre (p. ej. 3300) para no chocar con otros servicios; limpiar contenedores/volúmenes de prueba al final (`down -v` solo del proyecto de prueba).

**Never:**
- Cambiar lógica de dominio, pantallas o `sprint-status.yaml`/specs. Commitear `.env` o bases `.db`. Hacer push de imágenes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Primer arranque | volumen vacío | migraciones aplicadas; `/` responde 200 | No error expected |
| Re-arranque | volumen con datos | migraciones idempotentes; datos intactos | No error expected |
| Lote | `docker compose run --rm app npm run lote:pagamentos` | imprime resumen; exit 0 | exit ≠ 0 ante error |
| Migración falla | `DATABASE_URL` inválida | contenedor termina con error visible | exit ≠ 0 |
| Variable nueva no documentada | `process.env.X` sin entrada en `.env.example` | test falla | — |

</intent-contract>

## Code Map

- `next.config.ts` -- `output: "standalone"`, `serverExternalPackages` (better-sqlite3).
- `package.json` -- scripts (`start`, `lote:pagamentos`, `db:*`, `postinstall`).
- `scripts/lote-pagamentos.ts`, `prisma.config.ts`, `prisma/schema.prisma` (salida del cliente generado en `src/generated/prisma`), `prisma/seed.ts`.
- `playwright.config.ts` -- el e2e corre `next build && next start`; si cambia el script `start`, mantener el e2e funcionando.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- diferido de despliegue de 0.1.

## Tasks & Acceptance

**Execution:**
- `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-entrypoint.sh`.
- `package.json` (scripts), build del script del lote para la imagen.
- `.env.example` + `tests/env-documentado.test.ts`.
- `README.md` -- sección de despliegue.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3234 npx playwright test`, when se ejecutan, then todo en verde.
- Given `docker compose -p sifap-8-1 up --build -d` con un `.env` de ejemplo, when se consulta el puerto mapeado, then responde 200; el lote corre en el contenedor con exit 0; tras `down` + `up` los datos persisten.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3234 npx playwright test` -- expected: todo en verde
- `docker compose -p sifap-8-1 up --build -d` + `curl -f` + lote en el contenedor + `down`/`up` -- expected: OK
