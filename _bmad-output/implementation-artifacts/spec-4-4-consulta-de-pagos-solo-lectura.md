---
title: 'Story 4.4 — Consulta de pagos (solo lectura)'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '035bb2b'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: >-
      falhaInesperada/ERRO_INESPERADO duplicado en cuatro módulos (programas, beneficiarios, validacao, pagamentos) sin test del no-log de PII.
    evidence: |-
      Cambiar el log a e.message filtraría CPF en logs sin que ningún test falle; consolidar en un helper único con un test.
    location: >-
      src/app/*/actions.ts, src/app/pagamentos/falha.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Los pagos generados por el cálculo (4.1) y el lote (4.2) no se pueden consultar; además, ADR-009 exige que no exista forma de crearlos, editarlos o borrarlos fuera de los procesos.

**Approach:** Entregar `/pagamentos` (lista con filtros y paginación) y `/pagamentos/[num]` (detalle con descuentos aplicados, corrección y conciliación) como pantallas de solo lectura sobre un caso de uso `src/server/pagamentos.ts`.

## Boundaries & Constraints

**Always:**
- Lista: columnas Nº, CPF (`mascaraCpfLista`), programa, competencia (AAAA-MM), bruto, desconto, líquido, situação (G=Gerado, P=Pago, C=Cancelado, D=Devolvido, E=Estornado; dominio del código D15), tipo (N=Normal, D=Décimo, T=Terceiro); filtros CPF (11 dígitos exactos, como en 2.1), competencia, programa y situação; paginación de 10; orden por `numPagamento` descendente.
- Detalle: todos los valores monetarios con `formatarReais`; descuentos aplicados (`PagamentoDesconto` por `occurrence`); corrección (`vlrCorrecao`, `dtCorrecao`, `indCorrigido`); conciliación (`dtPagamento`, `codBanco`, `codRetornoBanco`, `sitConciliacao`); número inexistente → "PAGAMENTO NAO ENCONTRADO".
- **Sin escritura:** ninguna Server Action, route handler ni botón que cree/edite/borre pagos; un test e2e verifica que la página no tiene formularios de escritura ni botones de alterar/excluir y que `POST /pagamentos` no ejecuta nada (responde sin acción registrada).
- `falhaInesperada` solo `name`/`code`; en la barra lateral activar **solo** "Pagamentos".

**Never:**
- Tocar el motor de cálculo, el cálculo individual (4.1) o el lote (4.2); cambiar `sprint-status.yaml` o specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lista | 3 pagos en la base | 3 filas ordenadas por Nº desc | No error expected |
| Filtro CPF | CPF exacto de un pago | solo sus pagos | No error expected |
| Filtro competencia + situação | 202609 + G | coincidencias | No error expected |
| Vacía | sin pagos | estado vacío "Nenhum pagamento" | No error expected |
| Detalle | pago con 2 descuentos aplicados | descuentos en orden de occurrence | No error expected |
| Inexistente | `/pagamentos/999999` | panel | "PAGAMENTO NAO ENCONTRADO" |
| Sin escritura | inspección de la UI | sin formularios de escritura ni acciones | No error expected |

</intent-contract>

## Code Map

- `prisma/schema.prisma` `Pagamento`, `PagamentoDesconto`.
- `src/server/programas.ts`/`src/server/beneficiarios.ts` -- patrón de listado paginado con búsqueda.
- `src/components/campos/TabelaPaginada.tsx` -- tabla con búsqueda y paginación; `src/domain/cpf.ts` (`mascaraCpfLista`, `normalizaCpfNumerico`), `src/domain/money.ts` (`formatarReais`), `src/domain/legacyDate.ts` (`intParaCompetencia`, `intParaData`).
- `src/components/layout/navegacao.ts` -- ítem "Pagamentos".
- Tests: crear pagos directamente con Prisma sobre la base de test y la base e2e (el seed no tiene pagos; en e2e usar `createPrismaClient("file:./e2e.db")` desde el spec antes de navegar).
- **Paralelo:** corre en worktree con 2.6 y 3.1. Usar `E2E_PORT=3226`.

## Tasks & Acceptance

**Execution:**
- `src/domain/pagamento.ts` (+ test) -- rótulos de situação/tipo, mensaje de inexistente, esquema zod de filtros.
- `src/server/pagamentos.ts` (+ `tests/pagamentos.test.ts`) -- `listarPagamentos(filtros)`, `obterPagamento(num)`.
- `src/app/pagamentos/page.tsx`, `[num]/page.tsx` -- pantallas 4.15 (solo Server Components de lectura).
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/pagamentos.spec.ts` -- lista con filtro, detalle con descuentos, inexistente, sin acciones de escritura.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3226 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 39 findings — high 0, medium 3, low 22, false 14, maybe-false 0
- findings (resumen por grupo; detalle en el historial de la sesión):
  - `[medium]` `[patch]` (blind/verif) e2e con conteos exactos frágiles ante specs paralelos que crean pagos — datos propios en competencias 1990-01/02 y aserciones acotadas
  - `[medium]` `[patch]` (edge) números de pago de 10 dígitos dentro de Int32 rechazados — parser 1..2147483647
  - `[medium]` `[patch]` (verif) enlaces de paginación con filtros sin test — e2e con 12 pagos y "Próxima"
  - `[low]` `[patch]` ×9 — estado de CPF incompleto, formato de descuentos, `Object.hasOwn`, variante de badge compartida, parámetros repetidos, opciones de programa con fallback, `count`+`findMany` en transacción, `hora()` con 0, respuesta del POST de formulario
  - `[low]` `[reject]` ×13 — HTTP 200 en inexistente (mensaje legado visible), nombre del programa en la lista, programa inexistente en el select, etiqueta de `indCorrigido`, feedback de filtros inválidos, barra de paginación vacía, etc. (cosméticos o improbables)
  - `[low]` `[defer]` (verif) `falhaInesperada` sin test — cuarta copia; consolidar en un helper único con un test
  - `[false]` `[reject]` ×14 — superficie `/api` inexistente (el test prueba justamente la ausencia, ADR-009), sin evidencia de `getRule` (`rk-verification.md`), e2e fuera de `npm test` (verificación corre Playwright aparte), mensaje legado sin marca, lectura sin CPF, etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3226 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** consulta de pagos de solo lectura: `/pagamentos` (filtros CPF exacto, competencia, programa, situação; paginación de 10; orden por número desc.) y `/pagamentos/[num]` (valores, descuentos aplicados, corrección, conciliación); sin escritura (ADR-009, verificado por e2e).
- **Implementado en paralelo** (worktree); integrado por merge (conflicto trivial en `navegacao.ts` con 4.1).
- **Review:** 39 hallazgos — 12 patches (3 `medium`), 1 diferido, 26 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 3, low 9.
- **Verificación (tras merge):** lint 0; `npm test` 460/460; build OK; e2e 32/32.
