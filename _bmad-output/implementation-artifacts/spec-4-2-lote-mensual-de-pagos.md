---
title: 'Story 4.2 — Lote mensual de pagos'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '5dc58db'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: Candado entre procesos y unicidad (numCpf, anoMesRef) en Pagamento — CLI y web (o dos instancias) pueden correr el lote a la vez y duplicar pagos de un CPF/competencia.
    evidence: El candado es un flag en globalThis; `jaGerado` y el insert son sentencias separadas; el cálculo individual (4.1) puede insertar entre ambas.
  - summary: Test de subproceso de la CLI `npm run lote:pagamentos` (exit code y resumen).
    evidence: Solo se ejecutó a mano (exit 0, resumen correcto); ningún test corre el script.
  - summary: Volumen — lectura paginada por cursor y ejecución desacoplada de la solicitud HTTP; progreso visible en la UI.
    evidence: `findMany` sin cursor y todo el lote dentro de una Server Action; el progreso solo va al log del servidor.
  - summary: Identidad del operador que dispara el lote desde la web (auth fuera de alcance).
    evidence: `executarLoteAction` no registra quién ejecutó; BATCHPGT no audita.
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

### 2026-09-25 — Review pass
- verdicts: 31 findings — high 0, medium 2, low 16, false 13, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (blind/edge) error inesperado a mitad de corrida perdía el resumen con pagos ya grabados — corta el loop y devuelve resumen parcial + "LOTE INTERROMPIDO: ERRO INESPERADO CPF=<enmascarado>"; CLI imprime parcial y sale con 1
  - `[medium]` `[defer]` (blind/edge/verif) candado solo en el proceso y sin unicidad (numCpf, anoMesRef) — diferido (concurrencia multi-proceso)
  - `[low]` `[patch]` ×4 — reintento solo ante colisión de `numPagamento` (meta del adapter) con tests de colisión real, aviso "já processada" por motivo `JA_GERADO`, e2e (aviso, IGNORADOS = PROCESSADOS, conteo contra la base, competencia calculada en el test), comentarios NFR-04 y LEGACY-QUIRK de BATCHPGT:345
  - `[low]` `[defer]` ×3 — test de subproceso de la CLI, volumen/cursor/progreso en UI, identidad del operador
  - `[low]` `[reject]` ×9 — mezcla de idiomas en identificadores (nombre del spec), formatos de competencia, lecturas por beneficiario ignorado, etc.
  - `[false]` `[reject]` ×13 — cobertura de las 39 RK de FR-LOT-01/03 en el motor (4.1, mismo `calcular()`), sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3227 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** lote mensual BATCHPGT: selección en dominio (CPF repetido, status, ya generado, programa inexistente/inactivo), mismo `calcular()` del motor con arrastre D17, una transacción por beneficiario, numeración máx.+1 con reintento, candado en proceso, progreso cada 1.000, resumen literal; `/lote` con confirmación y CLI `npm run lote:pagamentos`.
- **Implementado en paralelo** (worktree); integrado por merge (conflicto trivial en `navegacao.ts`).
- **Review:** 31 hallazgos — 5 patches (1 `medium`), 4 diferidos, 22 rechazados.
- **Follow-up review recomendado:** `true` — riesgo de duplicados con ejecuciones concurrentes entre procesos (diferido).
- **Verificación (tras merge):** lint 0; `npm test` 584/584; build OK; e2e 48/48 (×4).
- **Pendiente de negocio:** D17 (arrastre del factor de renta entre beneficiarios).

