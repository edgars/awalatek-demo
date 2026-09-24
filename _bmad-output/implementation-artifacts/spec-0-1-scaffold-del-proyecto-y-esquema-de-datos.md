---
title: 'Story 0.1 — Scaffold del proyecto y esquema de datos'
type: 'chore'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
baseline_commit: '4d19f38ce01a44679d7d1336eb69eaed44b3ecc6'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md'
  - '{project-root}/docs/architecture.md'
  - '{project-root}/bmad-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El repo solo tiene planificación: no hay proyecto ejecutable ni esquema de datos, y todas las épicas E1–E8 dependen de ambos.

**Approach:** Crear el proyecto Next.js + Prisma + SQLite con tooling (lint, Vitest, Playwright), el esquema Prisma **completo** de `docs/architecture.md` §4 con su primera migración, un seed representativo y la estructura de carpetas; sin pantallas de negocio ni lógica de dominio (eso es 0.2 en adelante).

## Boundaries & Constraints

**Always:**
- Tipos según ADR-005/006/008: fechas `Int` (AAAAMMDD/AAAAMM/HHMMSS, `0` = vacío), dinero `Int` centavos, factores/porcentajes `String` decimal, CPF/NIS `String` de 11 dígitos con ceros a la izquierda.
- Grupos periódicos como tablas hijas con FK + `occurrence`, `@@unique([padreId, occurrence])`, `onDelete: Cascade`.
- Relaciones confirmadas: `Beneficiario.codPrograma → ProgramaSocial.codPrograma`; `Pagamento.numCpf → Beneficiario.numCpf`. `codRegiao` **no** es FK.
- Unicidades: `ProgramaSocial.codPrograma`, `Beneficiario.numCpf`, `Beneficiario.nis` (nullable), `Pagamento.numPagamento`, `Auditoria.numAuditoria`. Índices: `Pagamento(numCpf, anoMesRef)`, `Auditoria(dtEvento)`.
- TypeScript estricto; UI mínima en pt-BR.

**Never:**
- Lógica de negocio, validaciones de reglas `RK-` o utilidades de dominio (0.2+).
- Endpoints de escritura para `Pagamento`/`Auditoria`.
- `Float`/`Decimal` de Prisma para dinero; datos personales en logs.
- Dockerfile/compose (historia 8.1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Setup limpio | checkout + `.env` copiado de `.env.example` + `npm install` | `npx prisma migrate dev` crea `dev.db` con todas las tablas; `npm run db:seed` carga 3 programas (A,P,T) y 5 beneficiarios (A,S,C,I,D) | N/A |
| Seed repetido | `npm run db:seed` dos veces | mismos conteos (idempotente) | N/A |
| Cascada | borrar un Beneficiario con dependientes/descuentos | hijos borrados | N/A |
| Unicidad | insertar 2.º Beneficiario con mismo `numCpf` | rechazo por constraint | error Prisma P2002 |

</frozen-after-approval>

## Code Map

- Repo vacío de código: solo `docs/`, `_bmad-output/`, `README.md`, `bmad-context.md` (no tocar salvo lo indicado). `.claude/` y `_bmad/` son tooling sin trackear: no modificar ni commitear.
- `docs/architecture.md` §2 (estructura), §3 (representación), §4 (modelo campo a campo: fuente de verdad del esquema), §7 (variables de entorno).
- `_bmad-output/implementation-artifacts/epic-0-context.md` — modelo resumido y convenciones.
- Versiones verificadas en npm (2026-09-24): next 16.3.6, prisma **7.10.0** (último estable; `latest` apunta a 8.0.0-rc — no usar rc), zod 4.x, decimal.js 10.x, vitest 5.x, @playwright/test 1.63.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.gitignore` -- scaffold Next.js App Router (TS estricto, `src/`, alias `@/*`), `output: "standalone"`; scripts `dev`, `build`, `start`, `lint`, `test` (vitest run), `test:e2e`, `db:migrate`, `db:seed`; dependencias zod, decimal.js -- base del stack.
- [x] `prisma/schema.prisma`, `prisma.config.ts` -- datasource SQLite desde `DATABASE_URL`, las 9 tablas de §4 (ProgramaSocial, ProgramaFaixaCalculo, ProgramaParamRegional, Beneficiario, BeneficiarioDependente, BeneficiarioDesconto, Pagamento, PagamentoDesconto, Auditoria) con todos sus campos, relaciones, unicidades e índices -- esquema completo evita migraciones estructurales futuras.
- [x] `prisma/migrations/*` -- primera migración `init` generada -- versionar el esquema.
- [x] `src/server/db.ts` -- cliente Prisma singleton (con adapter SQLite requerido por Prisma 7) -- único punto de acceso a la base.
- [x] `prisma/seed.ts` -- upsert por clave de negocio: 3 programas A/P/T y 5 beneficiarios A/S/C/I/D con CPFs válidos por módulo 11 (al menos uno con cero a la izquierda) -- datos para desarrollo y e2e.
- [x] `src/domain/.gitkeep`, `src/server/`, `scripts/.gitkeep`, `tests/regression/.gitkeep` -- estructura §2.
- [x] `src/app/layout.tsx`, `src/app/page.tsx` -- layout pt-BR con título "SIFAP" y página inicial con los 5 grupos de navegación (sin enlaces funcionales aún) -- smoke visible.
- [x] `vitest.config.ts`, `tests/schema.test.ts` -- test contra una base SQLite temporal: migra, siembra, verifica conteos, idempotencia, cascada y unicidad (matriz I/O).
- [x] `playwright.config.ts`, `tests/e2e/home.spec.ts` -- e2e: la home responde 200 y muestra "SIFAP".
- [x] `.env.example` -- `DATABASE_URL="file:./dev.db"`, `SIFAP_USER`, `LEGACY_DOC_ESPECIAL_ENABLED=false`, `TZ=America/Sao_Paulo`, cada una comentada.

**Acceptance Criteria:**
- Given un checkout limpio con `.env`, when se ejecutan `npm install`, `npm run db:migrate`, `npm run db:seed`, then la base existe con las 9 tablas y los datos de seed.
- Given el proyecto, when se ejecutan `npm run lint`, `npm test` y `npm run build`, then los tres terminan con código 0.
- Given `prisma/schema.prisma`, when se compara con `docs/architecture.md` §4, then cada campo listado existe con el tipo de ADR-005/006 (revisión campo a campo en el review).

## Implementation Notes

- Prisma 7.10.0: generator `prisma-client` con `output = "../src/generated/prisma"` (ignorado en git, regenerado en `postinstall`); la URL vive en `prisma.config.ts` (carga `.env` vía `dotenv/config`, Prisma 7 no lo hace solo); seed declarado en `migrations.seed` (`tsx prisma/seed.ts`).
- `src/server/db.ts`: singleton **perezoso** (Proxy) para que importar el módulo no exija `DATABASE_URL` (build/tests); `createPrismaClient(url)` expuesto para el test con base temporal.
- npm 11 bloquea install scripts: `allowScripts` en `package.json` aprueba better-sqlite3, prisma, @prisma/engines, esbuild, unrs-resolver, fsevents (sin esto better-sqlite3 no compila en un checkout limpio).
- Versiones: typescript `~5.9.3` (TS 7 no soportado por typescript-eslint: `<6.1`), eslint `^9` (eslint-config-next 16 arrastra plugins sin soporte de ESLint 10); better-sqlite3 lo trae `@prisma/adapter-better-sqlite3` (^12).
- Unicidad "si no vacío" (`nis`, `cpfDependente` por titular): `@unique` sobre columna nullable; vacío debe persistirse como `NULL` (SQLite admite múltiples NULL). Normalizar "" → NULL queda para 0.2+/E2.
- ~~Campos "resto del DDM" de Pagamento/Auditoria nombrados por inferencia~~ → **corregido en la verificación (step-03)**: renombrados con los nombres reales de `PAGAMENTO.ddm`/`AUDITORIA.ddm` (fuente RNC `getSourceFile`): Pagamento `numConta`, `codOperacao`, `numObSiafi`, `numNeSiafi`, `codUgEmitente`, `codGestao`, `sitIntegSiafi`, `hashArqRemessa`, `hashArqRetorno`, + `hrInclusao`/`hrUltAlteracao`; Auditoria `tsEvento`, `numCpfAfetado`, `nomeUsuario`, `codPerfil`, `codLotacao`, `ipOrigem`, `numCicloBatch`, `numSeqBatch`, `nomJobBatch`, `sitBatch`, `desErroBatch`, `numSeqCorrelacao`. Migración `init` regenerada (`20260924204627_init`); lint/test/build/e2e re-ejecutados en verde.
- Playwright usa puerto 3217 (`E2E_PORT`) y `reuseExistingServer: false`: en esta máquina 3000/3100 están ocupados por otras apps y el reuso validaba la app equivocada.
- `next dev` (16.3) crea `AGENTS.md`/`CLAUDE.md` cuando detecta un agente; se eliminaron por estar fuera del alcance — reaparecerán al correr `next dev`/e2e.

- `AGENTS.md`/`CLAUDE.md` generados por `next dev` 16.3 (bloque `nextjs-agent-rules`: apunta a `node_modules/next/dist/docs/`); se recrean en cada `next dev` — decisión de commitear o ignorar pendiente del humano.

## Spec Change Log

## Review Triage Log

| # | Capa | Hallazgo | Veredicto | Evidencia | Ruta |
|---|---|---|---|---|---|
| 1 | blind | sprint-status en `in-progress` durante el review | false | El paso a `review` lo hace step-05 del workflow; en step-04 `in-progress` es correcto | rechazado |
| 2 | blind+edge | `Pagamento.codPrograma` sin FK ni índice | low | Código de programa es inmutable (no hay alteración de programa en el legado) y la arquitectura solo pide 2 relaciones; órfano solo con escritura errónea | rechazado (improbable) |
| 3 | blind | Falta unique `(numCpf, anoMesRef, tipoPgto)` | false | El legado permite duplicados: CALCBENF graba sin verificar competencia; solo BATCHPGT la verifica (FR-LOT-02). Un unique rompería la equivalencia | rechazado |
| 4 | blind+edge | `nis`/`cpfDependente` vacíos como `""` chocan en el unique | medium | Real cuando exista un escritor que grabe `""`; hoy no hay escritor (seed usa `null`). Normalización pertenece a 0.2/E2 | defer |
| 5 | blind | `numPagamento`/`numAuditoria` máx.+1 con carrera | false | Esta historia no genera secuenciales; el generador es de 0.2 (`registrarEvento`) y E4 | rechazado |
| 6 | blind+verif | Constraints restantes (nis, numPagamento, numAuditoria, cpfDependente, cascadas de Programa/Pagamento, RESTRICT) sin test | medium | Verificado: solo `numCpf` y cascada de Beneficiario tienen test; una regeneración podría perder constraints sin que falle nada | defer |
| 7 | blind+edge | Tests de esquema dependen del orden; restauración de la cascada no está en `finally` | low | Real: `-t` sobre el test P2002 falla sin seed previo; fallo en la cascada deja estado roto. Corrección directa | patch |
| 8 | blind+verif | Sin chequeo `migrate diff` esquema×migración | medium | Real (hoy coinciden: "No difference detected"); pertenece a CI inexistente | defer |
| 9 | blind | Variables de entorno sin validación zod; `TZ` en `.env` | false | Ningún código de esta historia lee `SIFAP_USER`/flags/`TZ`; `quirks.ts` y `hoje()` son de 0.2. Node aplica cambios de `process.env.TZ` en runtime | rechazado |
| 10 | blind | `better-sqlite3` solo transitivo mientras `allowScripts` fija `12.11.1` | medium | Si el adapter sube de versión, la entrada de `allowScripts` deja de coincidir y el módulo nativo no compila en checkout limpio | patch |
| 11 | blind+edge | `start` vs standalone, falta `db:deploy`, `postinstall` falla con `--omit=dev` | medium | Real para el despliegue; el deployment es la historia 8.1 (intent excluye Docker) | defer |
| 12 | blind | E2E sin base propia (migrate/seed) | medium (no verificado) | La home no usa base; el primer e2e con datos (E1) dependerá del `dev.db` local | defer |
| 13 | blind+edge | Proxy de `db.ts`: introspección/`then`/symbol sin `DATABASE_URL` lanzan | low | Solo al loguear/inspeccionar el cliente sin URL; la corrección agrega guards | rechazado (improbable + complejidad) |
| 14 | blind | Seed no incrementa `numVersao` y fija `HOJE` | low | Datos de desarrollo; sin impacto en usuarios | rechazado |
| 15 | edge | `file:./dev.db` relativo al cwd (standalone) | low | En docker se usa ruta absoluta `/data/sifap.db` (documentado en `.env.example`) | rechazado |
| 16 | edge | `E2E_PORT` no numérico → `--port NaN` | low | Configuración de desarrollador explícita; improbable | rechazado |
| 17 | edge | CEP `Int` pierde cero a la izquierda | false | Decisión de arquitectura (DDM N8); el formato con 8 dígitos es responsabilidad de la UI (`padStart`) | rechazado |
| 18 | edge | Hora 000000 = centinela vacío | low | La vacuidad la define el campo de fecha; sin impacto práctico | rechazado |
| 19 | edge | `numCpf` ON UPDATE CASCADE reescribe pagos | false | CPF es inmutable (FR-BEN-01) y, si cambiara, la cascada mantiene la consistencia deseada | rechazado |
| 20 | edge | Overflow de `Int` 32 bits en centavos | false | Valores por pago muy por debajo de R$ 21 M; totales no se persisten | rechazado |
| 21 | edge | Seed falla si un NIS del seed ya existe en base sucia | low | Solo en `dev.db` manipulado a mano | rechazado |
| 22 | edge+verif | Guard `argv[1]`/symlink y CLI de seed + Proxy sin test | medium | Verificado: ningún test ejecuta `prisma db seed`, `main()` ni el Proxy; una rotura deja la base vacía con tests en verde | patch |
| 23 | edge | `npx` en Windows | low | Entorno objetivo macOS/Linux/Docker | rechazado |
| 24 | verif | `cpfComDv` sin respuesta conocida | medium | Verificado: los tests solo comprueban 11 dígitos; `cpfComDv("012345678")` = `01234567890` (calculado independientemente) | patch |

## Design Notes

- Prisma 7 exige driver adapter para SQLite (`@prisma/adapter-better-sqlite3`) y `prisma.config.ts`; si el setup de 7.10.0 difiere, seguir la documentación oficial de esa versión y registrar la desviación en Implementation Notes.
- El seed genera CPFs válidos con una función local mínima de dígitos verificadores (no es la utilidad de dominio de 0.2; se reemplazará por `cpf.ts` cuando exista).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: tests de esquema en verde
- `npm run build` -- expected: build de producción OK
- `npx playwright test` -- expected: home.spec en verde
- `npx prisma validate` -- expected: esquema válido
