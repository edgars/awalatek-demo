---
title: 'Story 4.3 — Recálculo de descuentos de un pago'
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

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3228 npx playwright test` -- expected: todo en verde
