---
title: 'Story 4.2 — Lote mensual de pagos'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** No existe el lote mensual BATCHPGT que genera los pagos de todos los beneficiarios activos en la competencia corriente; hoy solo hay cálculo individual.

**Approach:** Implementar `ejecutarLotePagamentos({ dtHoje })` en `src/server/lotePagamentos.ts` reutilizando **el mismo** `calcular()` del motor, con las reglas de selección de BATCHPGT en el dominio (`src/domain/calculo/lote.ts`), disparable desde `/lote` (con confirmación) y desde la CLI `npm run lote:pagamentos`.

## Boundaries & Constraints

**Always:**
- Seguir los extractos de BATCHPGT del `epic-4-context.md` (líneas y RK de la historia `docs/stories/4-2-lote-mensual-de-pagos.md`).
- Competencia = año/mes de la fecha de ejecución (`competenciaDaData`, FR-LOT-01, RK :108–110).
- Recorre beneficiarios en orden de `numCpf` ascendente (FR-LOT-02, "sistemas downstream dependen de esta orden"). Omite (cuenta como ignorado): CPF igual al anterior (:188), status ≠ A (:195), pago ya existente del CPF en la competencia (:203/:207), programa con status ≠ A (:227). Programa inexistente (:220) → error registrado "ERRO: PROG NAO ENCONTRADO CPF=<cpf enmascarado> PROG=<cod>" y sigue (no aborta). Esas reglas de selección viven en el dominio con sus RK.
- Cálculo: `calcular()` con los datos del beneficiario/programa y `competencia`; `fatorRendaAnterior` = `fatorRenda` del último beneficiario **calculado** en esta corrida (el primero recibe `undefined` → 0) — `// LEGACY-QUIRK(D17)` + `// TODO(review)`.
- Grabación por beneficiario en su propia transacción (como `END TRANSACTION`): `numPagamento` secuencial (máx.+1 leído al inicio e incrementado en memoria, con reintento/relectura si hay P2002), status `G`, tipo, valores del motor, `dtGeracao`/`hrGeracao` = `hoje()`, `usrInclusao = "BATCH"`. Sin auditoría (BATCHPGT no audita).
- Progreso cada 1.000 pagos generados (:345) y resumen final: competencia, procesados, generados, ignorados, errores, totales bruto/desconto/líquido/abono (centavos) + lista de errores. Registro de progreso sin datos personales completos.
- Re-ejecutar en la misma competencia no duplica pagos (todos ignorados).
- No permitir dos ejecuciones simultáneas en el mismo proceso (candado en memoria; segunda llamada → mensaje "Lote já em execução.").
- `/lote` (DESIGN 4.13): muestra la competencia actual y cuántos pagos ya existen en ella; botón "Executar lote" con confirmación en la página ("Gerar pagamentos da competência AAAA-MM para todos os beneficiários ativos?"); resultado con `ResumoProcesso` + lista de errores. En la barra lateral activar **solo** "Lote mensal".
- CLI: `scripts/lote-pagamentos.ts` + script `lote:pagamentos` en `package.json` (usa `DATABASE_URL`, imprime el resumen, exit code ≠ 0 ante error inesperado).

**Never:**
- Duplicar la fórmula del motor o modificar `motor.ts`/`tabelas.ts`/`descontos.ts` salvo bug demostrado por test.
- Aplicar CALCDSCT (el lote usa el descuento simplificado del motor, D13).
- Cambiar `sprint-status.yaml` o specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Corrida normal | seed (1 activo, 4 no activos), sin pagos en la competencia | 1 generado, 4 ignorados, 0 errores; pago `G` con `usrInclusao` BATCH | No error expected |
| Re-ejecución | misma competencia | 0 generados, todos ignorados | No error expected |
| Programa inexistente | beneficiario A con `codPrograma` sin programa (insertado sin FK en test) | error registrado y la corrida sigue | mensaje "ERRO: PROG NAO ENCONTRADO …" |
| Programa inactivo | programa con `sitPrograma` I | beneficiario ignorado | No error expected |
| D17 | beneficiario 1 renta 500,00 y beneficiario 2 renta 20.000,00 (orden por CPF) | el 2.º usa el factor de renta del 1.º | No error expected |
| Diciembre | dtHoje en diciembre | tipo `D`, 13.º/abono según el motor | No error expected |
| Concurrente | dos llamadas simultáneas | la segunda devuelve "Lote já em execução." | No error expected |
| Igual al individual | un beneficiario | valores idénticos a `calcular()` / cálculo individual | No error expected |

</intent-contract>

## Code Map

- `src/domain/calculo/motor.ts` -- `calcular`, `competenciaDaData`, `fatorRenda` (resultado trae `fatorRenda`); no modificar.
- `src/server/calculo.ts` -- patrón de caso de uso transaccional con numeración máx.+1 y reintento P2002 (4.1).
- `src/components/campos/{ResumoProcesso,Competencia}.tsx`, `src/app/calculo/**` -- patrón de pantalla de proceso.
- `src/domain/cpf.ts` (`mascaraCpfLista`) para el mensaje de error; `src/domain/legacyDate.ts` (`hoje`).
- `src/components/layout/navegacao.ts` -- ítem "Lote mensal".
- **Paralelo:** corre en worktree con 4.3 y 5.1. Usar `E2E_PORT=3227`. En e2e usar una fecha de ejecución inyectable o una competencia que no pise otros specs (los pagos del lote en e2e.db pueden afectar conteos de otros specs: acotar aserciones a la competencia usada).

## Tasks & Acceptance

**Execution:**
- `src/domain/calculo/lote.ts` (+ test) -- reglas de selección (RK FR-LOT-02), mensaje de error, acumuladores del resumen.
- `src/server/lotePagamentos.ts` (+ `tests/lote-pagamentos.test.ts`) -- `ejecutarLotePagamentos({ dtHoje, db? })` con candado y D17.
- `scripts/lote-pagamentos.ts`, `package.json` -- CLI.
- `src/app/lote/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.13.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/lote.spec.ts` -- ejecutar con confirmación y ver el resumen; segunda ejecución no duplica.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3227 npx playwright test`, when se ejecutan, then todo en verde.
- Given `DATABASE_URL=file:<temp> npm run lote:pagamentos` sobre una base sembrada, when se ejecuta, then imprime el resumen y termina con código 0.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3227 npx playwright test` -- expected: todo en verde
