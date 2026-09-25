---
title: 'Story 3.1 — Validación de elegibilidad'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** No se puede verificar si un beneficiario es elegible para un programa (VALELEG) ni conocer todos los motivos de rechazo.

**Approach:** Implementar `avaliarElegibilidade(benef, programa, anoAtual)` puro en `src/domain/elegibilidade.ts` replicando VALELEG (29 RK, D12) y exponerlo en `/elegibilidade` (CPF + programa) mediante un caso de uso de solo lectura en `src/server/elegibilidade.ts`.

## Boundaries & Constraints

**Always:**
- Seguir al pie de la letra la lógica y los extractos de VALELEG en `epic-3-context.md` (orden, mensajes literales, líneas RK).
- Precondiciones que cortan (FR-ELG-01): beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO"; programa inexistente → "PROGRAMA NAO ENCONTRADO"; programa con status ≠ A → "PROGRAMA INATIVO". Edad = año actual − año de nacimiento (`idadePorAno`, `anoAtual` inyectado desde `hoje()`).
- Región 99 → "BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL" sin ninguna otra verificación (`// LEGACY-QUIRK(D12)`).
- Acumula hasta 10 motivos (FR-ELG-03..06): status S/C-D/I; límites del programa solo si > 0 (edad mín./máx., renta máx.); por tipo A (renta > 600,00 sin dependientes; `documentosOk` ≠ S), P (edad < 60), T (edad < 16 o > 65), otro ("TIPO PROGRAMA DESCONHECIDO"); código de elegibilidad: pos. 1 = R exige NIS ≠ vacío/0, pos. 2 = D exige dependientes. Montos en centavos (600,00 = 60000; comparación con `vlrRendaFamiliar` y `rendaMaxPercap`).
- Resultado (FR-ELG-07): "BENEFICIARIO ELEGIVEL PARA O PROGRAMA" o "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:" + lista numerada.
- Cada una de las 29 reglas con `// RK-<clave> (VALELEG:<línea>)` y test; función de dominio sin Prisma.
- Pantalla (DESIGN 4.11): `CpfInput` + select de programas (código – nombre); badge ELEGÍVEL / NÃO ELEGÍVEL + motivos; try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** "Elegibilidade".

**Never:**
- Grabar o auditar; cambiar `sprint-status.yaml` o specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Elegible | beneficiario A del seed, programa compatible | "BENEFICIARIO ELEGIVEL PARA O PROGRAMA" | No error expected |
| Región 99 | beneficiario con región 99 y status C | "BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL" | No error expected |
| Programa inactivo | programa con `sitPrograma` I | nada más evaluado | "PROGRAMA INATIVO" |
| Varios motivos | status S, edad < mín., renta > máx. | "NAO ELEGIVEL" + 3 motivos en orden | No error expected |
| Tipo P | edad 50 | motivo "PROG PREVIDENCIARIO: IDADE < 60" | No error expected |
| Código RD | sin NIS y sin dependientes | "NIS NAO CADASTRADO" y "PROGRAMA REQUER DEPENDENTES" | No error expected |
| Inexistentes | CPF o programa no registrados | nada | mensaje de precondición |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-3-context.md` -- FR-ELG-01..07 literales, extractos de VALELEG con líneas, mapeo de campos legado → Prisma.
- `src/domain/legacyDate.ts` (`idadePorAno`, `hoje`), `src/domain/cpf.ts` (`normalizaCpfNumerico`).
- `src/server/beneficiarios.ts`, `src/server/programas.ts` (`listarProgramas`/opciones para el select).
- `src/app/validacao/cadastro/**` -- patrón de pantalla de consulta sin escritura.
- `src/components/layout/navegacao.ts` -- ítem "Elegibilidade".
- **Paralelo:** corre en worktree con 2.6 y 4.4. Usar `E2E_PORT=3225`.

## Tasks & Acceptance

**Execution:**
- `src/domain/elegibilidade.ts` (+ test) -- `avaliarElegibilidade`, mensajes; test por rama y por RK.
- `src/server/elegibilidade.ts` (+ `tests/elegibilidade.test.ts`) -- `verificarElegibilidade(cpf, codPrograma)`.
- `src/app/elegibilidade/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.11.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/elegibilidade.spec.ts` -- elegible, no elegible con motivos, programa inexistente.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3225 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3225 npx playwright test` -- expected: todo en verde
