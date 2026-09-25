---
title: 'Story 1.2 — Alteración y desactivación de programa social'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'e68be16'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** La pantalla de programas solo permite incluir y consultar (el legado CADPROG solo tiene las operaciones I y C). El usuario pidió (2026-09-25) poder **editar** programas existentes, **crearlos** (ya existe) y **desactivarlos**.

**Approach:** Funcionalidad nueva, no legada: alteración de los datos del programa con la misma regla de valor base de la inclusión (decisión del usuario: "igual que la inclusión" — FATOR-K recalculado, D8) y cambio de situación A ↔ I (desactivar / reactivar), en `/programas/[cod]/editar` y en el detalle `/programas/[cod]`.

## Boundaries & Constraints

**Always:**
- Reglas de validación de la inclusión reutilizadas tal cual (mismo esquema zod/dominio de `src/domain/programa.ts`, mismos mensajes literales), salvo el código, que es inmutable en la alteración.
- **Valor base (decisión del usuario):** el operador informa valor base y fator de reajuste; se recalcula `fatorK = calcularFatorK(fatorReajuste)` y se graba `vlrBaseIndividual = calcularVlrBaseAjustado(vlrBase, fatorK)`, exactamente como `incluirPrograma` (`// LEGACY-QUIRK(D8)`), con el mismo límite Int32. El formulario de edición precarga el valor base **informado originalmente** cuando se puede derivar; como hoy solo se guarda el valor ajustado, mostrar el valor ajustado actual como referencia ("Valor base gravado (ajustado): R$ …") y exigir que el operador informe el valor base de nuevo si quiere cambiarlo; si no cambia valor base ni fator, no se recalcula nada (no aplicar FATOR-K dos veces).
- Campos editables: nombre, tipo, fechas inicio/fin (con la validación de fechas existente), fator de reajuste, valor base, código de elegibilidad, renta máxima, edades mín./máx. Los grupos (faixas, params regionales) siguen editándose en el detalle como hoy.
- **Desactivar / reactivar:** botones en el detalle con confirmación en la página ("Desativar o programa PA01? Beneficiários deste programa deixam de ser pagos no lote e são inelegíveis (PROGRAMA INATIVO)."). Desactivar = `sitPrograma` A → I; reactivar = I → A. Programa con situación E (encerrado) no se reactiva desde la UI. Sin borrado físico (nunca `delete`).
- Control de concurrencia optimista: columna nueva `numVersao Int @default(1)` en `ProgramaSocial` (migración `npx prisma migrate dev --name programa_versao`), incrementada en cada alteración/cambio de situación; conflicto → mensaje "Programa alterado por outro usuário. Recarregue a página.".
- `dtUltAlteracao`/`usrUltAlteracao` (y `hrUltAlteracao` si existe) actualizados con `usuarioOperativo()`.
- Auditoría: registrar `AL` (tabla `PROGRAMA`, clave = código) en alteración y en cambio de situación vía `registrarEvento` en la misma transacción, con `desAcao` descriptiva ("ALTERACAO PROGRAMA", "PROGRAMA DESATIVADO", "PROGRAMA REATIVADO") y valores anterior/nuevo de la situación. (CADPROG no auditaba; funcionalidad nueva — decisión de diseño documentada.)
- Lista `/programas`: acción de fila "Editar" y badge de situación ya existente; el detalle muestra botones Editar / Desativar (o Reativar).
- Sin PII en logs; errores inesperados con `falhaInesperada` de `@/lib/falhas`; configuración leída como en el resto de la app.
- Documentar en `docs/prd.md` (FR-PRG-01, nota) y en `docs/ux/DESIGN.md` la nueva operación de alteración/desactivación como extensión fuera del legado.

**Never:**
- Cambiar la inclusión, el cálculo, el lote o la elegibilidad (ya tratan `sitPrograma ≠ A` como inactivo). Cambiar `sprint-status.yaml` salvo agregar la historia si el formato lo permite (no requerido).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Editar nombre | PA01, nombre nuevo | grabado; valor base intacto; AL auditado | No error expected |
| Editar valor base | valor 200,00, fator 0,05 | fatorK recalculado, valor ajustado grabado como en la inclusión | No error expected |
| Sin cambio de valor/fator | solo cambia edades | vlrBaseIndividual y fatorK sin cambios (sin doble FATOR-K) | No error expected |
| Validación | fecha fin < inicio, edad mín > máx, etc. | nada grabado | mensajes literales de la inclusión |
| Desactivar | PA01 A | situación I; lote ignora beneficiarios de PA01; elegibilidad "PROGRAMA INATIVO" | No error expected |
| Reactivar | PA01 I | situación A | No error expected |
| Encerrado | programa E | sin botón de reactivar | No error expected |
| Concurrencia | numVersao desactualizado | nada grabado | "Programa alterado por outro usuário. Recarregue a página." |
| Inexistente | código desconocido | nada | "PROGRAMA NAO ENCONTRADO" |

</intent-contract>

## Code Map

- `src/domain/programa.ts` -- esquemas y reglas de la inclusión, `calcularFatorK`, `calcularVlrBaseAjustado`, rótulos.
- `src/server/programas.ts` -- `incluirPrograma` (patrón), `consultarPrograma`, `salvarFaixas`.
- `src/app/programas/**` -- lista, detalle `[cod]`, `novo`, `actions.ts`, `_componentes/FormInclusao.tsx` (reutilizar para edición).
- `src/server/auditoria.ts` (`registrarEvento`), `src/server/unicidade.ts`, `src/lib/falhas.ts`, `src/server/usuario.ts`.
- `src/server/beneficiarios.ts` -- patrón de alteración con `numVersao` y `dtUltAlteracao`.
- E2E: `tests/e2e/programas.spec.ts` (patrón). Crear un programa propio del spec (código exclusivo, p. ej. `Z1xx`) para editar/desactivar sin afectar a los del seed usados por otros specs.

## Tasks & Acceptance

**Execution:**
- Migración `numVersao` + dominio (validación de alteración, transición de situación) + tests.
- `src/server/programas.ts`: `alterarPrograma`, `alterarSituacaoPrograma` + tests (incluida la no-duplicación de FATOR-K, concurrencia, auditoría, inexistente).
- Pantallas: `/programas/[cod]/editar`, botones en el detalle con confirmación, acción "Editar" en la lista.
- E2E: editar, desactivar (y verificar badge I), reactivar, validación.
- Docs (PRD/DESIGN).

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3247 npx playwright test` (dos corridas) y `npm run db:check`, when se ejecutan, then todo en verde.

## Verification

- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3247 npx playwright test` · `npm run db:check`

## Review Triage Log

### 2026-09-25 — Review pass (Blind + Edge)
- `[medium]` `[patch]` ×3 — guardado sin cambios sin nueva versión ni auditoría; programa encerrado (E) no editable; formulario refrescado tras guardar (revalidación del layout, remonte por versión).
- `[low]` `[patch]` ×9 — "Recarregar" ante conflicto; foco/Escape en la confirmación y panel pendiente hasta el resultado; resumen de auditoría escapado, normalizado y truncado (60, `TODO(review)`); "R$" solo = vacío; prefill robusto de datos raros; código de ruta validado solo por largo; tests de efectos (lote/elegibilidad), acciones inválidas y `Moeda`; e2e autocontenido; helper de ruta compartido.
- `[reject]` documentados en PRD — estado automático por fecha de fin; guardar el valor base sin ajustar (cambiar el fator exige reinformar el valor base).

## Auto Run Result

- **Resumen:** extensión fuera del legado — edición de programas (`/programas/[cod]/editar`, FATOR-K recalculado solo si cambian valor base o fator), desactivar/reactivar con confirmación, control optimista por `numVersao`, auditoría AL.
- **Verificación (main):** lint 0; `npm test` 1128/1128 (×3, incluido `ALL,D7`); build OK; e2e 87/87 (×3); `db:check` sin diferencias.

