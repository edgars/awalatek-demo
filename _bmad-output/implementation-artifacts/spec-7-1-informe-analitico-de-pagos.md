---
title: 'Story 7.1 — Informe analítico de pagos'
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
  - summary: Límite de filas/rango en el informe analítico (y en su versión imprimible) para volúmenes reales.
    evidence: `findMany` sin tope sobre el rango de competencias con join a beneficiario; la impresión renderiza todas las páginas.
---

<intent-contract>

## Intent

**Problem:** No existe el informe analítico de pagos por período (RELPGT) con corte de control por programa.

**Approach:** Reglas puras en `src/domain/relatorios/pagamentos.ts` (filtros, corte, descripciones, máscara, paginación de 66 líneas; 7 RK) sobre filas ya leídas; `src/server/relatorios.ts` solo consulta y delega; pantalla `/relatorios/pagamentos` con versión imprimible.

## Boundaries & Constraints

**Always:**
- Seguir el extracto RELPGT del `epic-7-context.md` (líneas, literales, orden de operaciones).
- Filtros: competencia inicial/final (AAAAMM) y programa (vacío/"0" = todos). Recorrido por `anoMesRef, codPrograma, numPagamento` ascendente (`TODO(review)` del orden secundario); `ESCAPE BOTTOM` al pasar la final (:83); filtro de programa (:87).
- Corte de control por **cambio de programa entre registros consecutivos** (:93), subtotal (bruto, líquido, qtd — sin descuento) al cambiar y al final si hubo registros (:173); total general (qtd, bruto, desc, líq) + total abono. Un mismo programa puede tener varios subtotales (tramos).
- Descripciones (:116, :128): tipo N NORMAL · D DECIMO · T TERCEIRO · otro OUTRO; status G GERADO · P PAGO · C CANCELAD · D DEVOLVID · E ESTORNAD · otro OUTRO (truncados literales).
- Máscara RELPGT `***.XXX.XXX-XX` (dígitos 4–6, 7–9, 10–11 del CPF de 11 con ceros) como `mascaraCpfRelatorio` en `src/domain/cpf.ts` — distinta de D7 y de `mascaraCpfLista`. Nombre = primeros 30 caracteres; beneficiario inexistente → nombre y UF en blanco.
- Paginación (:144): nueva página cuando `linha >= 61`; la cabecera deja `linha = 6`; detalle suma 1, subtotal suma 3. Función de paginación de dominio reutilizable (parámetro de línea inicial, 7.3 usa 7). Sin registros: sin cabecera, total general en cero.
- Pantalla (DESIGN 4.18): filtros `Competencia` ×2 + select de programas (Todos + código – nombre); tabla con filas de subtotal y total; paginación en pantalla por páginas legadas; botón "Versão para impressão" que muestra todas las páginas con cabecera literal ('SIFAP - RELATORIO ANALITICO DE PAGAMENTOS' 'PAG:' n / 'PERIODO:' ini 'A' fim 'DATA:' hoy) y CSS `@media print`. Solo lectura (GET con `searchParams` validados con zod); estado vacío; try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** "Relatório de pagamentos" (grupo Relatórios).
- Cada una de las 7 RK con `// RK-<clave> (RELPGT:<línea>)` y test.

**Never:**
- Escribir datos; mostrar el CPF completo; cambiar `sprint-status.yaml` o specs; tocar otros informes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dos programas | pagos P1, P1, P2 en 201101 | subtotal P1 (2), subtotal P2 (1), total 3 | No error expected |
| Tramos | 201101 P2; 201102 P1; 201102 P2 | subtotales P2, P1, P2 | No error expected |
| Filtro programa | programa P1 | solo P1 | No error expected |
| Fuera de rango | pagos 201012 y 201201, rango 2011 | excluidos | No error expected |
| Descripciones | status C, tipo X | "CANCELAD", "OUTRO" | No error expected |
| Máscara | CPF 01234567890 | `***.345.678-90` (dígitos 4–6, 7–9, 10–11) | No error expected |
| Sin beneficiario | CPF sin registro | nombre/UF vacíos | No error expected |
| Paginación | 60 detalles | página 1 con 55, página 2 con 5 | No error expected |
| Vacío | sin pagos | estado vacío, totales 0 | No error expected |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-7-context.md` -- extracto RELPGT.
- `src/domain/cpf.ts`, `src/domain/money.ts` (`formatarReais`), `src/domain/legacyDate.ts` (`hoje`).
- `src/server/programas.ts` (opciones del select), `src/server/consulta.ts` (patrón de lectura).
- `src/components/campos/{Competencia,TabelaPaginada}.tsx`, `src/app/pagamentos/**` (patrón de lista de solo lectura con `searchParams`).
- `src/components/layout/navegacao.ts` -- ítem "Relatório de pagamentos".
- **Paralelo:** corre en worktree con 6.1 y 7.2. Usar `E2E_PORT=3231`. En e2e crear pagos propios con Prisma en competencias exclusivas (199301–199302, números 97101+) y limpiar por `numPagamento`.

## Tasks & Acceptance

**Execution:**
- `src/domain/cpf.ts` (+ test) -- `mascaraCpfRelatorio`.
- `src/domain/relatorios/paginacao.ts` (+ test) -- paginación 66 líneas con línea inicial parametrizable.
- `src/domain/relatorios/pagamentos.ts` (+ test) -- 7 RK.
- `src/server/relatorios.ts` (+ `tests/relatorio-pagamentos.test.ts`) -- `relatorioPagamentos({ compIni, compFim, programa })`.
- `src/app/relatorios/pagamentos/page.tsx`, `_componentes/*` -- pantalla 4.18 + impresión.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/relatorio-pagamentos.spec.ts` -- filtros, subtotales, total, versión imprimible.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3231 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 33 findings — high 0, medium 1, low 16, false 16, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (blind/edge) "Limpar" hacía navegación suave y los campos conservaban los valores — formulario con `key` por filtros + e2e
  - `[low]` `[patch]` ×7 — programa inválido → "Programa inválido." (no "Todos"), programa válido fuera de la lista como opción extra, período invertido / competencia mal formada con mensaje por campo, estado vacío en la versión imprimible, e2e de `?pagina=99` y test de `falhaInesperada` sin PII, `codPrograma` normalizado una vez, CSS de impresión unificado en el layout (`print:hidden`, también para 7.2), comentario del corte por tramos (RELPGT:93)
  - `[low]` `[defer]` — tope de filas/rango por volumen
  - `[low]` `[reject]` ×8 — máscara `***.XXX.XXX-XX` expone 8 dígitos (literal FR-REL-03/RELPGT; registrada como decisión LGPD), dos enlaces "Pagamentos" (los encabezados de grupo desambiguan), subtotal sin descuento (legado), tests de solo lectura, etc.
  - `[false]` `[reject]` ×16 — varios subtotales por programa (corte por registros consecutivos del legado, pedido por el spec), exportación a archivo (la versión imprimible es la equivalencia acordada), sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3231 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** informe analítico de pagos (RELPGT, 7 RK) en `/relatorios/pagamentos`: filtros de competencia y programa, corte de control por programa entre registros consecutivos con subtotales y total general, descripciones truncadas del legado, máscara `***.XXX.XXX-XX`, paginación de 66 líneas reutilizable (`src/domain/relatorios/paginacao.ts`) y versión imprimible.
- **Implementado en paralelo** (worktree); integrado por merge (tras traer `main` y unificar la impresión con 7.2).
- **Review:** 33 hallazgos — 8 patches (1 `medium`), 1 diferido, 24 rechazados.
- **Follow-up review recomendado:** `false`.
- **Verificación (tras merge):** lint 0; `npm test` 683/683; build OK; e2e 66/66 (×3).
- **Pendiente de negocio:** LGPD — la máscara del informe expone los dígitos 4–11 del CPF.

