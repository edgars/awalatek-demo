---
title: 'Story 7.2 — Informe consolidado mensual'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'e6dbeb9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: Consolidado por agregación en SQL (groupBy) en lugar de cargar todos los pagos del mes en memoria.
    evidence: `findMany` sin límite + lectura de regiones por lotes; riesgo de memoria/latencia en meses de alto volumen.
  - summary: Test unitario de los helpers `falhaInesperada` de las páginas de solo lectura (retorno genérico y log sin PII).
    evidence: `src/app/relatorios/consolidado/falha.ts` y `src/app/pagamentos/falha.ts` sin test.
---

<intent-contract>

## Intent

**Problem:** No existe el consolidado mensual (BATCHREL) con totales por región, por status y generales.

**Approach:** Reglas puras en `src/domain/relatorios/consolidado.ts` (9 RK, D10, D11) sobre filas ya leídas; lectura en `src/server/relatorioConsolidado.ts`; pantalla `/relatorios/consolidado`.

## Boundaries & Constraints

**Always:**
- Seguir el extracto BATCHREL del `epic-7-context.md`.
- Solo pagos con `anoMesRef` = competencia (:106).
- Región del beneficiario por `numCpf` (`codRegiao`): 1–5 NORTE · 6–10 NORDESTE · 11–15 SUDESTE · 16–20 SUL · todo lo demás (21–25, 99, 0, beneficiario inexistente) CENTRO-OESTE (:117/:120/:123/:126, `// LEGACY-QUIRK(D10)`).
- Bruto redondeado con `money.redondear()` (+0,005 y truncar) **antes** de sumar en región y general (:137–:139, `// LEGACY-QUIRK(D11)`); descuento y líquido sin redondeo; bruto por status con el valor **crudo** (asimetría del legado, comentada).
- Status (:146): G GERADO · P PAGO · C CANCELADO · D DEVOLVIDO · E ESTORNADO; otro cuenta como GERADO.
- Las 5 regiones y los 5 status siempre presentes (en cero si no hay pagos). Total general: qtd, bruto, desc, líq.
- Todo en centavos enteros (Int); `decimal.js` solo vía `money.ts`.
- Pantalla (DESIGN 4.19): `Competencia`; bloques Por região (qtd, bruto, desconto, líquido), Por situação (qtd, bruto), Totais gerais; cabecera literal 'SIFAP - RELATORIO CONSOLIDADO MENSAL' / 'COMPETENCIA:' 'DATA:' en la versión imprimible (`@media print`). Solo lectura (GET con `searchParams` validados con zod); try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** "Relatório consolidado".
- Cada una de las 9 RK con `// RK-<clave> (BATCHREL:<línea>)` y test.

**Never:**
- Escribir datos; "corregir" D10/D11; cambiar `sprint-status.yaml` o specs; tocar otros informes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Regiones | beneficiarios región 3, 7, 12, 18, 22, 99 | NORTE, NORDESTE, SUDESTE, SUL, CENTRO-OESTE ×2 | No error expected |
| Sin beneficiario | pago de CPF inexistente | CENTRO-OESTE | No error expected |
| D11 | bruto 100,00 | suma 100,00 (redondear aplicado, test con Decimal fraccionario en dominio) | No error expected |
| Status desconocido | status X | suma en GERADO | No error expected |
| Otra competencia | pago 201102 con filtro 201101 | excluido | No error expected |
| Vacío | sin pagos | todas las filas en cero | No error expected |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-7-context.md` -- extracto BATCHREL.
- `src/domain/money.ts` (`redondear`, `formatarReais`), `src/domain/legacyDate.ts` (`hoje`).
- `src/server/consulta.ts` -- patrón de lectura.
- `src/components/campos/Competencia.tsx`, `src/app/pagamentos/**` -- patrón de solo lectura con `searchParams`.
- `src/components/layout/navegacao.ts` -- ítem "Relatório consolidado".
- **Paralelo:** corre en worktree con 6.1 y 7.1. Usar `E2E_PORT=3232`. Nombre del archivo de servidor propio (`relatorioConsolidado.ts`) para no chocar con 7.1 (`relatorios.ts`). En e2e crear pagos y beneficiarios propios en competencia exclusiva (199401, números 98101+) y limpiar por `numPagamento`.

## Tasks & Acceptance

**Execution:**
- `src/domain/relatorios/consolidado.ts` (+ test) -- 9 RK, D10, D11.
- `src/server/relatorioConsolidado.ts` (+ `tests/relatorio-consolidado.test.ts`) -- `relatorioConsolidado(competencia)`.
- `src/app/relatorios/consolidado/page.tsx`, `_componentes/*` -- pantalla 4.19.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/relatorio-consolidado.spec.ts` -- competencia con pagos en varias regiones/status.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3232 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 27 findings — high 0, medium 1, low 12, false 14, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (verif) lote de CPF (500) nunca probado más allá del primer lote — tamaño inyectable + tests con lote 3 y con 501 CPF
  - `[low]` `[patch]` ×3 — competencia presente pero inválida → "Competência inválida." (el aviso solo sin parámetro), `formatarCompetencia` compartido en `legacyDate.ts` + e2e "01/1994", comentario de D11 inerte sobre centavos enteros
  - `[low]` `[defer]` ×2 — agregación en SQL por volumen, test de `falhaInesperada`
  - `[low]` `[reject]` ×7 — CSS de impresión dependiente del layout (se unifica con 7.1), `PAG: 1` (BATCHREL imprime una sola cabecera), bruto negativo / desborde de enteros, PRAGMA en el test (adapter de una sola conexión), test de exports de solo lectura, etc.
  - `[false]` `[reject]` ×14 — D11 sin efecto observable en centavos (documentado en el contexto de la épica), bruto crudo por status (asimetría del legado BATCHREL:146), sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3232 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** consolidado mensual (BATCHREL, 9 RK) en `/relatorios/consolidado`: totales por región (D10), por status (desconocido → GERADO) y generales, bruto redondeado antes de sumar (D11, inerte sobre centavos), versión imprimible.
- **Implementado en paralelo** (worktree); integrado por merge.
- **Review:** 27 hallazgos — 4 patches (1 `medium`), 2 diferidos, 21 rechazados.
- **Follow-up review recomendado:** `false`.
- **Verificación (tras merge):** lint 0; `npm test` 652/652; build OK; e2e 57/57 (×3).

