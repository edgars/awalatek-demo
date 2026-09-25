---
title: 'Story 4.4 — Consulta de pagos (solo lectura)'
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

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3226 npx playwright test` -- expected: todo en verde
