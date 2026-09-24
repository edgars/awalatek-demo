# Story 0.1: Scaffold del proyecto y esquema de datos

**Épica:** 0 — Fundación  
**Requisitos:** técnico (sin reglas legadas) (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] Proyecto Next.js (App Router, TypeScript estricto) con Prisma, zod, decimal.js, Vitest y Playwright configurados; `npm run lint`, `npm test`, `npm run build` pasan.
- [ ] `prisma/schema.prisma` implementa **todas** las tablas de `docs/architecture.md` §4 (incluye hijos PE con `occurrence` y FKs con cascade); primera migración creada.
- [ ] Tipos según ADR-005/006: fechas `Int` (AAAAMMDD/AAAAMM/HHMMSS), dinero `Int` centavos, factores `String` decimal, CPF/NIS `String(11)`.
- [ ] `prisma/seed.ts` crea al menos 3 programas (tipos A, P, T) y 5 beneficiarios de ejemplo (uno por status A/S/C/I/D) con CPFs válidos.
- [ ] Estructura de carpetas `src/domain`, `src/server`, `src/app`, `scripts`, `tests/regression` creada según §2.
- [ ] `.env.example` documenta `DATABASE_URL`, `SIFAP_USER`, `LEGACY_DOC_ESPECIAL_ENABLED=false`, `TZ`.

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
