---
title: 'Story 7.3 — Informe de auditoría'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'a316808'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: Control de acceso al informe de auditoría (muestra usuarios, claves tipo CPF y descripciones sin enmascarar).
    evidence: Auth fuera de alcance; cualquiera que llegue a `/relatorios/auditoria` ve la trilla completa.
  - summary: Informe de auditoría sin tope de filas — el período por defecto (1997–hoy) lee toda la tabla `Auditoria`.
    evidence: `findMany` por rango de fechas y filtros en memoria; empujar filtros al `where` y paginar en la base.
---

<intent-contract>

## Intent

**Problem:** No existe el informe de la trilla de auditoría (RELAUDIT) con filtros y resumen por acción.

**Approach:** Reglas puras en `src/domain/relatorios/auditoria.ts` (16 RK) sobre eventos ya leídos, reutilizando la paginación de 66 líneas de 7.1 (`src/domain/relatorios/paginacao.ts`, línea inicial 7); lectura en `src/server/relatorioAuditoria.ts`; pantalla `/relatorios/auditoria`.

## Boundaries & Constraints

**Always:**
- Seguir el extracto RELAUDIT del `epic-7-context.md`.
- Defaults (:80/:84/:87): salida vacía → T; fecha inicial vacía/0 → 19970101; final vacía/0 → hoy (`hoje().data`).
- Rango (:93/:96): `dtEvento` entre inicial y final; total = eventos en el rango. Orden `dtEvento, hrEvento, numAuditoria` (`TODO(review)` del orden secundario).
- `EX` nunca se muestra y cuenta como filtrado, antes de cualquier otro filtro (:105).
- Filtros opcionales por igualdad (:111–:128) — acción, usuario, tabla — comparando sin espacios finales; cada rechazo suma 1 a filtrados (un evento cuenta una sola vez).
- Descripción de acción (:137): IN INCLUSAO · AL ALTERACAO · CO CONCILIACAO · CN CONSULTA · DV DIVERGENCIA · otro OUTRA; resumen literal ('RESUMO AUDITORIA', 'TOTAL REGISTROS....:', 'EXIBIDOS...........:', 'FILTRADOS..........:', 'POR TIPO ACAO:' y las 6 líneas) contando solo exhibidos.
- Hora `HH:MM:SS` desde `hrEvento` con `padStart(6,'0')`.
- Salida T (:169): fecha, hora, usuario, acción (descripción), tabla, clave; I: además descripción. Paginación (:164/:210): nueva página cuando `linha >= 61`, cabecera deja `linha = 7`; cabecera 'SIFAP - TRILHA DE AUDITORIA' 'PAG:' / 'PERIODO:' ini 'A' fim 'DATA:'.
- FR-AUD-07: ninguna ruta, acción ni API para crear/editar/borrar auditoría; test que recorre `src/app` y verifica que no hay Server Action/Route Handler que escriba `auditoria` fuera de `registrarEvento` (búsqueda de `auditoria.create|update|delete|upsert` en `src/app` = 0).
- Pantalla (DESIGN 4.20): Data inicial (default 01/01/1997) · Data final (default hoje) · Ação (Select IN/AL/CO/CN/DV, vacío = todas) · Usuário (8) · Tabela (15) · Saída (T/I); tabla + resumen al pie; versión imprimible (`@media print`). Solo lectura (GET con `searchParams` validados con zod); try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** "Relatório de auditoria".
- Cada una de las 16 RK con `// RK-<clave> (RELAUDIT:<línea>)` y test.

**Never:**
- Escribir auditoría; mostrar eventos EX; cambiar `sprint-status.yaml` o specs; tocar otros informes (si `paginacao.ts` necesita un ajuste, solo compatible).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Defaults | sin filtros | rango 19970101–hoy, salida T | No error expected |
| EX | evento EX en el rango | no se muestra; filtrados +1 | No error expected |
| Filtro acción | acción CO | solo CO; otros filtrados | No error expected |
| Filtros combinados | acción IN + usuario X | igualdad en ambos; cada evento rechazado cuenta 1 | No error expected |
| Espacios | usuario "BATCH  " | coincide con "BATCH" | No error expected |
| Hora | hrEvento 90503 | "09:05:03" | No error expected |
| Salida I | tipo I | columna descripción | No error expected |
| Acción desconocida | codAcao "ZZ" | OUTRA | No error expected |
| Paginación | 60 eventos | 54 + 6 | No error expected |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-7-context.md` -- extracto RELAUDIT.
- `src/server/auditoria.ts` (`ACOES_AUDITORIA`, `registrarEvento` para sembrar en tests), `src/domain/legacyDate.ts`.
- `src/domain/relatorios/paginacao.ts` (de 7.1).
- `src/components/campos/{DataLegada,TabelaPaginada}.tsx`, `src/app/pagamentos/**` -- patrón de solo lectura.
- `src/components/layout/navegacao.ts` -- ítem "Relatório de auditoria".
- Usar `E2E_PORT=3233`. En e2e sembrar eventos con `registrarEvento` usando un usuario exclusivo (p. ej. `E2EAUD`) y filtrar por él en las aserciones.

## Tasks & Acceptance

**Execution:**
- `src/domain/relatorios/auditoria.ts` (+ test) -- 16 RK.
- `src/server/relatorioAuditoria.ts` (+ `tests/relatorio-auditoria.test.ts`) -- `relatorioAuditoria(filtros)`; test FR-AUD-07.
- `src/app/relatorios/auditoria/page.tsx`, `_componentes/*` -- pantalla 4.20.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/relatorio-auditoria.spec.ts` -- defaults, filtro por acción/usuario, salida I.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3233 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 36 findings — high 0, medium 1, low 17, false 18, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (blind/edge) en la versión impresa el resumen salía siempre solo en una hoja extra (`:last-of-type` nunca coincidía) — hojas en su propio contenedor con salto salvo la última (7.1 revisado: no afectado)
  - `[low]` `[patch]` ×9 — seed e2e con `registrarEvento` + momento (sin `update` de auditoría), fechas de calendario reales, Usuário/Tabela en mayúsculas con `trimEnd()` (semántica A de Natural), valor inválido redisplayado, e2e de filtros conservados en paginación/impresión/volver + `pagina=99` + "Limpar", `print:hidden` en controles de pantalla, tests sin depender de TZ, segunda línea de guiones de la cabecera (RELAUDIT:216–219)
  - `[low]` `[defer]` ×2 — control de acceso/PII en pantalla, volumen sin tope
  - `[low]` `[reject]` ×6 — select de Ação limitado a IN/AL/CO/CN/DV (DESIGN 4.20; el dominio conserva la igualdad libre), período invertido con error (coherente con 7.1), horas inválidas, casts, prueba de Server Action falsa, etc.
  - `[false]` `[reject]` ×18 — conteo por acción solo de exhibidos (RELAUDIT:134 antes de :137), paginación 54 detalles por hoja (cabecera deja `linha = 7`), T/I como layout de columnas con versión impresa aparte, sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3233 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** informe de auditoría (RELAUDIT, 16 RK) en `/relatorios/auditoria`: defaults (T, 19970101, hoy), rango de fechas, EX nunca visible (cuenta como filtrado), filtros por igualdad, conteo por acción, salida T/I, paginación de 66 líneas (54 detalles), cabecera literal y versión imprimible; FR-AUD-07 verificado por test (único escritor `registrarEvento`).
- **Implementado en paralelo** (worktree); integrado por merge.
- **Review:** 36 hallazgos — 10 patches (1 `medium`), 2 diferidos, 24 rechazados.
- **Follow-up review recomendado:** `false`.
- **Verificación (tras merge):** lint 0; `npm test` 762/762; build OK; e2e 79/79 (×3).

