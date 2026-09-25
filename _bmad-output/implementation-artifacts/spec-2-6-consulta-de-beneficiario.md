---
title: 'Story 2.6 — Consulta de beneficiario'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'c9b43d6'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** No existe la consulta de beneficiario (CONSBENF): búsqueda por CPF o NIS con ficha, descripción de status, historial de pagos y CPF enmascarado.

**Approach:** Entregar `/consulta` con las reglas de CONSBENF en `src/domain/beneficiario/consulta.ts` (incluida la máscara D7 en `src/domain/cpf.ts`) y un caso de uso de solo lectura en `src/server/consulta.ts`.

## Boundaries & Constraints

**Always:**
- Tipo de busca: vacío → `C` (CONSBENF:80); `C` busca por CPF, `N` por NIS; otro → "TIPO BUSCA INVALIDO" (:86); no encontrado → "BENEFICIARIO NAO ENCONTRADO" (:100). RK :72 (pantalla alternativa sin MAP) documentada como sustituida por la pantalla web única, con test del camino por defecto.
- Ficha FR-CON-01: CPF enmascarado, nombre, nacimiento, sexo, dirección, municipio/UF, CEP, status + descripción, programa, renta, dependientes, región, NIS, fecha de cadastro.
- Descripción de status (:110): A=ATIVO, S=SUSPENSO, C=CANCELADO, I=INATIVO, D=DESLIGADO, otro=DESCONHECIDO.
- Máscara `mascaraCpfConsulta` en `cpf.ts` (:177, `// LEGACY-QUIRK(D7)`, "NAO CORRIGIR SEM APROVACAO DA AUDITORIA"): valor numérico del CPF < 10000000000 (empieza por 0) → `XXX.***.***-**` con los 3 primeros dígitos; si no → `***.***.XXX-XX` con dígitos 7–9 y 10–11.
- Historial (:152, :156, :166): pagos del CPF en orden de inserción (`numPagamento` ascendente como aproximación del ISN) hasta 12 — **los primeros 12, no los últimos**, aunque el título diga "ÚLTIMOS 12" (`// LEGACY-QUIRK(D21)`); columnas competencia, bruto, líquido, status, tipo; sin pagos → "NENHUM PAGAMENTO ENCONTRADO".
- Cada una de las 9 reglas con `// RK-<clave> (CONSBENF:<línea>)` y test; entrada CPF normalizada con `normalizaCpfNumerico`; NIS 11 dígitos.
- Pantalla (DESIGN 4.8): radio CPF/NIS (default CPF) + campo; ficha + tabla; try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** el ítem "Consulta"; en la lista de beneficiarios habilitar **solo** la acción de fila "Consultar" (enlaza a `/consulta?cpf=…` usando el CPF sin exponerlo en texto).

**Never:**
- Grabar o auditar (CONSBENF no audita).
- "Corregir" D7 o D21; cambiar `sprint-status.yaml` o specs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Por CPF | CPF de un beneficiario del seed | ficha completa + status con descripción | No error expected |
| Tipo vacío | tipo "" + CPF | busca por CPF | No error expected |
| Por NIS | tipo N + NIS del seed | misma ficha | No error expected |
| Tipo inválido | tipo "X" | nada | "TIPO BUSCA INVALIDO" |
| Inexistente | CPF no registrado | nada | "BENEFICIARIO NAO ENCONTRADO" |
| D7 con cero | CPF `01234567890` | `012.***.***-**` | No error expected |
| D7 normal | CPF `12345678909` | `***.***.789-09` | No error expected |
| Sin pagos | beneficiario sin pagos | tabla vacía | "NENHUM PAGAMENTO ENCONTRADO" |
| D21 | 14 pagos del CPF | se muestran los 12 de menor `numPagamento` | No error expected |
| Status desconocido | status "X" | "DESCONHECIDO" | No error expected |

</intent-contract>

## Code Map

- `src/domain/cpf.ts` -- agregar `mascaraCpfConsulta` (D7); `mascaraCpfLista`, `normalizaCpfNumerico` existentes.
- `src/server/beneficiarios.ts` -- lectura de beneficiario; patrón de caso de uso.
- `src/app/validacao/cadastro/**` -- patrón de pantalla de consulta sin escritura (acción, try/catch, panel).
- `src/app/beneficiarios/page.tsx` -- acción de fila "Consultar" deshabilitada (habilitar).
- `src/components/layout/navegacao.ts` -- ítem "Consulta".
- `prisma/schema.prisma` `Pagamento` (`numCpf`, `anoMesRef`, `vlrBruto`, `vlrLiquido`, `sitPagamento`, `tipoPgto`, `numPagamento`).
- Tests de servidor/e2e: crear pagos directamente con Prisma sobre la base de test (el seed no tiene pagos).
- **Paralelo:** corre en worktree con 3.1 y 4.4. Usar `E2E_PORT=3224`.

## Tasks & Acceptance

**Execution:**
- `src/domain/cpf.ts` (+ test) -- `mascaraCpfConsulta`.
- `src/domain/beneficiario/consulta.ts` (+ test) -- tipo de busca, descripción de status, selección D21, mensajes.
- `src/server/consulta.ts` (+ `tests/consulta.test.ts`) -- `consultarBeneficiario({tipo, valor})` con historial.
- `src/app/consulta/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.8.
- `src/app/beneficiarios/page.tsx`, `navegacao.ts` -- solo sus ítems.
- `tests/e2e/consulta.spec.ts` -- CPF, NIS, inexistente, sin pagos.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3224 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 33 findings — high 0, medium 3, low 16, false 14, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (edge) `?cpf=` con más de 11 dígitos truncado podía mostrar otro beneficiario real — sin truncado; devuelve no encontrado
  - `[medium]` `[patch]` (verif) camino de error inesperado de la consulta sin test — test con error con CPF; log sin PII
  - `[medium]` `[patch]` (verif/edge) límites de zod devolvían mensajes no legados y el test no verificaba el mensaje — truncado con semántica A1/dígitos; mensajes legados exactos en tests
  - `[low]` `[patch]` ×3 — URL `?cpf=` desincronizada tras búsqueda manual (history.replaceState), panel no limpiado al cambiar CPF/NIS, `competenciaTexto` con 0
  - `[low]` `[patch]` (blind/intent) comentario de `selecionarHistorico` vs `ESCAPE BOTTOM` — corregido
  - `[low]` `[reject]` (blind/edge/verif) CPF completo en `?cpf=` y en el input — mismo diferido LGPD de 2.1 (clave opaca en rutas)
  - `[low]` `[reject]` ×10 — NIS sin máscara (el legado lo muestra), sin control de acceso/auditoría de lecturas (auth fuera de alcance; CONSBENF no audita), `ERRO_INESPERADO` duplicado (diferido de 4.4), `aria-live`, códigos sin descripción en el historial, `key={i}`, imports dinámicos en tests, etc.
  - `[false]` `[reject]` ×14 — título "últimos 12" con los primeros 12 (literal del legado + D21), TIPO BUSCA INVALIDO inalcanzable desde la UI (radio; regla en dominio/acción), filtro/límite duplicados en consulta y dominio (equivalente al READ), RK :72 documentada como sustituida, sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3224 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** consulta de beneficiario (CONSBENF, 9 RK) en `/consulta`: búsqueda por CPF (por defecto) o NIS, ficha FR-CON-01 con status y descripción, máscara D7, historial de los primeros 12 pagos (D21), atajo `?cpf=` desde la lista.
- **Implementado en paralelo** (worktree); integrado por merge (conflicto trivial en la lista de beneficiarios: las tres acciones de fila quedan habilitadas).
- **Review:** 33 hallazgos — 6 patches (3 `medium`), 0 diferidos nuevos, 27 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 3, low 3. Riesgo: superficie LGPD del CPF en URLs (diferido de producto).
- **Verificación (tras merge):** lint 0; `npm test` 533/533; build OK; e2e 42/42.
- **Pendiente de negocio:** D21 (título "últimos 12" muestra los primeros 12).
