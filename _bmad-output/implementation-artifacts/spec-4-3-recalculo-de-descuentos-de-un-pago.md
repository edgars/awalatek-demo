---
title: 'Story 4.3 — Recálculo de descuentos de un pago'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '5dc58db'
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

**Problem:** No se pueden recalcular los descuentos de un pago (CALCDSCT) a partir de los descuentos registrados del beneficiario; el dominio `calcularDescontos` existe pero no está conectado.

**Approach:** Entregar `/descontos` (CPF + número de pago) con las precondiciones FR-DSC-01 en el dominio y un caso de uso `recalcularDescontos` en `src/server/descontos.ts` que invoca `calcularDescontos()`, graba el total en el pago y los descuentos aplicados en `PagamentoDesconto`.

## Boundaries & Constraints

**Always:**
- Precondiciones FR-DSC-01 (dominio, `src/domain/calculo/precondicoesDescontos.ts`, con RK de la historia): pago inexistente **o** de otro CPF → "PAGAMENTO NAO ENCONTRADO" (CALCDSCT :75/:82); beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO" (:91).
- Cálculo: `calcularDescontos({ vlrBruto: pago.vlrBruto, descontos: <BeneficiarioDesconto del CPF ordenados por occurrence>, dtHoje: hoje().data })` sin duplicar la lógica (contribución progresiva, vigencia, tipos J/P/A/I/S, tope 30 % dentro del loop — D2, truncados).
- Grabación en una transacción: `pagamento.vlrDescontoTotal = vlrTotal`; **no** recalcular `vlrLiquido` (`// LEGACY-QUIRK(D13)`); reemplazar las filas de `PagamentoDesconto` del pago con una fila por descuento **aplicado** (occurrence 1..n, con tipo, valor aplicado, pct, fechas, proceso — D14); `usrUltAlteracao` = `SIFAP_USER` (8), `dtUltAlteracao` = hoy. Sin auditoría (CALCDSCT no audita).
- Resultado (DESIGN 4.14): "DESCONTOS CALCULADOS" + VLR BRUTO, VLR DESCONTO, TETO 30 %, contribución, tabla de descuentos procesados (aplicado / fuera de vigencia) y aviso "O valor líquido não é recalculado (regra legada D13)".
- Pantalla con `CpfInput` + número de pago; zod en la acción; try/catch; `falhaInesperada` solo `name`/`code`; en la barra lateral activar **solo** "Cálculo de descontos".

**Never:**
- Modificar `src/domain/calculo/descontos.ts` salvo bug demostrado por test; tocar el lote o el cálculo individual; cambiar `sprint-status.yaml` o specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Solo contribución | pago bruto 800,00, beneficiario sin descuentos | total = contribución (5 %) = 40,00; líquido sin cambios | "DESCONTOS CALCULADOS" |
| Con registrados | J fijo 25,00 + S | total según `calcularDescontos`; 2 filas en `PagamentoDesconto` | No error expected |
| Tope 30 % | descuentos que superan 30 % del bruto | total limitado según D2 | No error expected |
| Fuera de vigencia | descuento con fin < hoy | no aplicado ni grabado; listado como fuera de vigencia | No error expected |
| Pago de otro CPF | número de pago de otro beneficiario | nada grabado | "PAGAMENTO NAO ENCONTRADO" |
| Pago inexistente | número inexistente | nada grabado | "PAGAMENTO NAO ENCONTRADO" |
| Recálculo repetido | ejecutar dos veces | mismas filas (reemplazo), total igual | No error expected |

</intent-contract>

## Code Map

- `src/domain/calculo/descontos.ts` -- `calcularDescontos` (centavos; `itens` con `aplicado`, `vlrItem`; `vlrContribuicao`, `vlrTeto`, `foraDeVigencia`), `descontoVigente`.
- `src/server/descontosRegistrados.ts` -- lectura de `BeneficiarioDesconto` del CPF (2.5).
- `src/server/calculo.ts` -- patrón de caso de uso + `usuarioOperativo`.
- `src/components/campos/ResumoProcesso.tsx`, `src/app/calculo/**` -- patrón de pantalla de proceso.
- `prisma/schema.prisma` `Pagamento`, `PagamentoDesconto`, `BeneficiarioDesconto`.
- `src/components/layout/navegacao.ts` -- ítem "Cálculo de descontos".
- **Paralelo:** corre en worktree con 4.2 y 5.1. Usar `E2E_PORT=3228`. En e2e crear sus propios pagos con Prisma en una competencia exclusiva (p. ej. 199101) para no chocar con otros specs.

## Tasks & Acceptance

**Execution:**
- `src/domain/calculo/precondicoesDescontos.ts` (+ test) -- 3 RK de FR-DSC-01.
- `src/server/descontos.ts` (+ `tests/recalculo-descontos.test.ts`) -- `recalcularDescontos(cpf, numPagamento)`.
- `src/app/descontos/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.14.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/descontos.spec.ts` -- recálculo con resultado y aviso D13; pago de otro CPF.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3228 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 27 findings — high 0, medium 1, low 13, false 13, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (verif/blind/intent) e2e solo renderizaba una fila aplicada — beneficiario propio del spec con descuentos fuera de vigencia, tipo desconocido y caso de tope 30 %; aserciones por ítem rotulado
  - `[low]` `[patch]` ×5 — orden legado pago → beneficiario (:75/:82 antes de :91) y `numPagamento` fuera de Int32, desborde del total (> Int32) con mensaje controlado, comentario + test de filas `PagamentoDesconto` vs total con tope (CALCDSCT no graba filas: detalle del modelo destino, D14), columna % solo cuando se usa, error de forma duplicado
  - `[low]` `[reject]` ×8 — `falhaInesperada` duplicada (diferido existente), lector de `descontosRegistrados` no reutilizado, helpers de fecha, `occurrence` renumerada 1..n (spec), rótulo `C` (DDM: C=CONTRIB), `SIFAP_USER` ausente, etc.
  - `[false]` `[reject]` ×13 — filas solo de aplicados vs "procesados" (CALCDSCT no persiste ítems; arquitectura/DESIGN dicen aplicados), `vlrLiquido` sin recálculo (D13), sin evidencia de `getRule` (`rk-verification.md`), etc.
- integración: en `main` el e2e fallaba de forma intermitente (P1008 = SQLITE_BUSY). Causa: el adapter abre transacciones `BEGIN` DEFERRED; con escritores en otras conexiones (clientes Prisma de los specs, CLI del lote) la transacción que lee y luego escribe recibe BUSY sin esperar. Fix transversal en `src/server/db.ts`: reintento con backoff de `$transaction` ante P1008 (Proxy, sin heredar en `tx`), `maxWait` 15 s; e2e sobre `next build && next start` y `e2e.db` en WAL.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3228 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** recálculo de descuentos de un pago (CALCDSCT) en `/descontos`: precondiciones FR-DSC-01 en dominio (orden legado), `recalcularDescontos` reutiliza `calcularDescontos` (D2, D13), graba el total y las filas aplicadas en `PagamentoDesconto` en una transacción, sin auditoría.
- **Implementado en paralelo** (worktree); integrado por merge.
- **Review:** 27 hallazgos — 6 patches (1 `medium`), 0 diferidos nuevos, 21 rechazados.
- **Follow-up review recomendado:** `false`.
- **Estabilidad e2e (transversal):** reintento de transacciones ante SQLITE_BUSY + build de producción + WAL; e2e 10/10 corridas en verde.
- **Verificación (tras merge):** lint 0; `npm test` 554/554; build OK; e2e 46/46 (×5).

