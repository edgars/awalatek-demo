---
title: 'Story 5.1 — Corrección retroactiva por IPCA'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** No existe la corrección retroactiva de pagos por IPCA (CALCCORR).

**Approach:** Implementar el cálculo en `src/domain/calculo/correcao.ts` (tabla IPCA 2010–2012 en `tabelas.ts`, D9) y el caso de uso `corrigirPagamentos(cpf, compIni, compFim)` en `src/server/correcao.ts`, expuesto en `/correcao`.

## Boundaries & Constraints

**Always:**
- Seguir los extractos de CALCCORR del `epic-5-context.md` (líneas y RK de `docs/stories/5-1-corrección-retroactiva-por-ipca.md`).
- Competencia inicial > final → "PERIODO INVALIDO - COMP INICIAL > FINAL" (:119), nada procesado.
- Pagos del CPF en orden de `anoMesRef` ascendente (y `numPagamento` para desempatar), replicando el `READ … BY CPF-BENEF` con `ESCAPE TOP` antes de la inicial (:133) y `ESCAPE BOTTOM` después de la final (:136); CPF distinto → fin (:129). Pagos con `indCorrigido = 'S'` se saltan (:140).
- Índice = 1 × (1 + IPCA del mes de la competencia) buscando el año en la tabla fija 2010–2012 (:180–185); año fuera de la tabla → índice 1 (`// LEGACY-QUIRK(D9)`). Tabla completa del contexto (valores N3.6 como string).
- Corregido = truncar(bruto × índice) (:152–155); diferencia = corregido − bruto (:156). Solo si diferencia > 0 (:158): graba `vlrCorrecao` = corregido (valor completo), `dtCorrecao` = hoy, `indCorrigido = 'S'`, en su transacción. Diferencia 0 → no se marca (se revisa en la próxima corrida, como el legado).
- Resumen: "CORRECAO RETROACTIVA FINALIZADA" (texto literal del legado: "CORRECAO RETROATIVA FINALIZADA"), registros corregidos y **valor total = suma de las diferencias** (no de los corregidos).
- Sin auditoría (CALCCORR no audita). Bloque Plano Verão comentado del legado: fuera de alcance.
- Pantalla (DESIGN 4.16): `CpfInput` + `Competencia` inicial/final; resultado con `ResumoProcesso` + tabla de pagos corregidos (competencia, original, corregido, diferencia); zod; try/catch; `falhaInesperada` solo `name`/`code`; en la barra lateral activar **solo** "Correção retroativa".

**Never:**
- Tocar el motor, descuentos, lote o `sprint-status.yaml`/specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Período inválido | ini 201205, fin 201201 | nada | "PERIODO INVALIDO - COMP INICIAL > FINAL" |
| Corrige 2011 | pago bruto 100,00 en 201101 (IPCA 0,0083) | corregido 100,83, diferencia 0,83, `indCorrigido` S | No error expected |
| Fuera de tabla (D9) | pago en 202001 | índice 1, diferencia 0, no se marca | No error expected |
| Junio 2010 | pago en 201006 (IPCA 0,0000) | diferencia 0, no se marca | No error expected |
| Ya corregido | pago con `indCorrigido` S | saltado | No error expected |
| Re-ejecución | mismo período | 0 corregidos | No error expected |
| Total | 2 pagos corregidos | total = suma de diferencias | No error expected |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-5-context.md` -- tabla IPCA completa, pasos exactos con líneas.
- `src/domain/calculo/tabelas.ts` -- agregar la tabla IPCA (no cambiar las existentes); `src/domain/money.ts` (`truncar`, `truncarCasas`, `fator`, `aCentavos`, `deCentavos`).
- `src/server/calculo.ts` -- patrón de caso de uso.
- `src/components/campos/{ResumoProcesso,Competencia,CpfInput}.tsx`, `src/app/calculo/**` -- patrón de pantalla de proceso.
- `src/components/layout/navegacao.ts` -- ítem "Correção retroativa".
- **Paralelo:** corre en worktree con 4.2 y 4.3. Usar `E2E_PORT=3229`. En e2e crear pagos propios con Prisma para un beneficiario/competencias que ningún otro spec use (2010–2012).

## Tasks & Acceptance

**Execution:**
- `src/domain/calculo/tabelas.ts` (IPCA) + `src/domain/calculo/correcao.ts` (+ test) -- índice, corrección, selección de pagos, mensajes, RK.
- `src/server/correcao.ts` (+ `tests/correcao.test.ts`) -- `corrigirPagamentos`.
- `src/app/correcao/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.16.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/correcao.spec.ts` -- período inválido; corrección con resumen; re-ejecución sin cambios.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3229 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

## Design Notes

- Verificar el mensaje literal del resumen contra CALCCORR ("CORRECAO RETROATIVA FINALIZADA").

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3229 npx playwright test` -- expected: todo en verde
