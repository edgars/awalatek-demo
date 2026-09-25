---
title: 'Story 2.4 — Dependientes del beneficiario'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '5a787f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: >-
      Bloqueo por límite D6 en la página de dependientes sin test de UI al cargar.
    evidence: |-
      El servidor impone el límite en cada envío (test); falta e2e que abra la página con 6 dependientes y verifique el formulario deshabilitado.
    location: >-
      src/app/beneficiarios/[cpf]/dependentes/page.tsx
    severity: medium
  - summary: >-
      E2E comparten beneficiarios del seed y corren en paralelo (fullyParallel): el e2e de dependientes lleva a MARIA a 6 dependientes, lo que cambia el factor familiar que asume el e2e de cálculo (4.1).
    evidence: |-
      Suite completa en verde tras el merge, pero el resultado depende del orden de ejecución entre archivos. Usar titulares creados por cada spec o serializar los specs que mutan el seed.
    location: >-
      tests/e2e/dependentes.spec.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No se pueden registrar dependientes del titular (CADDEPEND), que alimentan el factor familiar del cálculo y la elegibilidad.

**Approach:** Entregar `/beneficiarios/[cpf]/dependentes` (lista + inclusión en serie) con las reglas de CADDEPEND en `src/domain/beneficiario/dependentes.ts` y el caso de uso en `src/server/dependentes.ts`, replicando la semántica del grupo periódico PE del legado.

## Boundaries & Constraints

**Always:**
- Titular por CPF: inexistente → "BENEFICIARIO NAO ENCONTRADO" (RK CADDEPEND:51); status C o D → "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO" (:56).
- Antes de cada inclusión: `numDependentes` del titular > 5 → "LIMITE DE DEPENDENTES ATINGIDO" (:63, `// LEGACY-QUIRK(D6)`: permite llegar a 6).
- Datos: nombre obligatorio → "NOME DO DEPENDENTE OBRIGATORIO" (:79); parentesco ∈ {FI, CO, IR, OU} → si no "PARENTESCO INVALIDO" (:84); con error no se graba y se vuelve a pedir (:90, :105). Ambos errores se muestran si ocurren juntos (el legado escribe cada mensaje).
- CPF de dependiente (normalizado a 11 dígitos; vacío = sin CPF) repetido entre las ocurrencias 1..`numDependentes` del titular → "DEPENDENTE JA CADASTRADO (CPF DUPLICADO)" (:97).
- Inclusión: `occurrence = numDependentes + 1`; se **escribe** esa ocurrencia (upsert por `(beneficiarioId, occurrence)`, sobrescribiendo si existiera, como el `MOVE ... (#IDX)` del PE) y se incrementa `numDependentes`, todo en una transacción; mensaje "DEPENDENTE INCLUIDO - TOTAL: n". CPF vacío → `NULL` (unique nullable).
- Tras cada inclusión la pantalla ofrece "Incluir outro dependente" / "Concluir" (:126).
- Campos: nome (60), data de nascimento (`DataLegada`), parentesco (select FI=Filho, CO=Cônjuge, IR=Irmão, OU=Outro), CPF (`CpfInput`, opcional), documento (15), sexo (M/F, opcional). Sin validación de fecha/CPF del dependiente (el legado no valida).
- Cada una de las 9 reglas con `// RK-<clave> (CADDEPEND:<línea>)` y test; zod en la acción; try/catch en la transición; `falhaInesperada` solo con `name`/`code`.
- En la lista de beneficiarios (`src/app/beneficiarios/page.tsx`) habilitar **solo** la acción de fila "Dependentes" (no tocar las de "Descontos"/"Consultar").

**Never:**
- Editar o borrar dependientes (el legado solo incluye).
- Auditar (CADDEPEND no audita).
- Cambiar `sprint-status.yaml` o `navegacao.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inclusión | titular A con 0 dep., nombre, FI | ocurrencia 1, `numDependentes` 1 | "DEPENDENTE INCLUIDO - TOTAL: 1" |
| Titular inexistente | CPF no registrado | nada | "BENEFICIARIO NAO ENCONTRADO" |
| Titular cancelado | titular C (o D) | formulario bloqueado | "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO" |
| D6 límite | titular con 5 dep. → incluye 6.º; con 6 → otra | 6.º grabado; 7.º rechazado | "LIMITE DE DEPENDENTES ATINGIDO" |
| Datos inválidos | nombre vacío y parentesco "XX" | nada grabado | ambos mensajes |
| CPF duplicado | CPF igual al de la ocurrencia 1 | nada grabado | "DEPENDENTE JA CADASTRADO (CPF DUPLICADO)" |
| Sin CPF ×2 | dos dependientes sin CPF | ambos grabados (`NULL`) | No error expected |
| Contador desfasado | `numDependentes` 0 con una fila en ocurrencia 1 | la nueva inclusión sobrescribe la ocurrencia 1; total 1 | No error expected |

</intent-contract>

## Code Map

- `src/domain/beneficiario/cadastro.ts`, `src/server/beneficiarios.ts` -- patrones (mensajes literales + RK, `usuarioOperativo`, `obterBeneficiario`, P2002, `falhaInesperada`).
- `src/domain/cpf.ts` -- `normalizaCpfNumerico`.
- `src/app/beneficiarios/{page.tsx,actions.ts,_componentes/FormBeneficiario.tsx}` -- patrón de pantallas/acciones; `page.tsx` tiene las acciones de fila deshabilitadas (habilitar solo "Dependentes").
- `src/components/campos/*` -- `CpfInput`, `DataLegada`, `ResultadoLegado`, `useAcaoFormulario`.
- `prisma/schema.prisma` `BeneficiarioDependente` -- `@@unique([beneficiarioId, occurrence])`, `@@unique([beneficiarioId, cpfDependente])`.
- Reglas: `docs/stories/2-4-dependientes-del-beneficiario.md` (9 RK), `docs/prd.md` FR-DEP-01..05.
- **Paralelo:** esta historia corre en un worktree junto con 2.5 y 4.1. Usar `E2E_PORT=3221` para Playwright.

## Tasks & Acceptance

**Execution:**
- `src/domain/beneficiario/dependentes.ts` (+ test) -- mensajes, validaciones por RK, `proximaOcorrencia`, chequeo de duplicado sobre 1..n.
- `src/server/dependentes.ts` (+ `tests/dependentes.test.ts`) -- `listarDependentes(cpf)`, `incluirDependente(cpf, dados)` transaccional.
- `src/app/beneficiarios/[cpf]/dependentes/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.6.
- `src/app/beneficiarios/page.tsx` -- acción de fila "Dependentes" habilitada.
- `tests/e2e/dependentes.spec.ts` -- incluir dos en serie, duplicado, titular cancelado bloqueado.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3221 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 31 findings — high 0, medium 3, low 14, false 14, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Server Action sin autorización — auth/SSO fuera de alcance (igual que 2.1)
  - `[low]` `[reject]` (blind) CPF completo en la ruta — ya diferido en 2.1 (decisión LGPD de producto)
  - `[low]` `[patch]` (blind) todo P2002 reportado como CPF duplicado — solo si `meta.target` incluye `cpfDependente`
  - `[false]` `[reject]` (blind) filas huérfanas sobre n bloquean CPF — decisión de arquitectura "único por titular"; el legado lo permitía, documentado en el spec
  - `[medium]` `[patch]` (blind) guard de concurrencia sin test — test con contador obsoleto
  - `[low]` `[patch]` (blind) "Incluir outro" ofrecido al llegar al límite — condicionado al estado actualizado
  - `[low]` `[patch]` (blind) prompt literal S/N no mostrado y `continuarInclusao` sin uso — prompt visible y botones vía `continuarInclusao`
  - `[false]` `[reject]` (blind) e2e no re-ejecutable — `scripts/e2e-db.mjs` recrea `e2e.db` en cada corrida
  - `[low]` `[reject]` (blind) limpieza frágil del test de integración — improbable
  - `[low]` `[reject]` (blind) validación en dos rondas (zod vs legado) — errores de formato son validación adicional del borde
  - `[low]` `[reject]` (blind) `dataBr` duplicado / fechas inválidas — solo se graban fechas desde el selector
  - `[low]` `[reject]` (blind) guard de CPF en log solo parcialmente probado — `falhaInesperada` solo registra `name`/`code`
  - `[medium]` `[patch]` (edge) upsert hereda `sitDependente`/`indDeficiencia` de la fila sobrescrita — todas las columnas se escriben
  - `[low]` `[reject]` (edge) `numDependentes` negativo — solo lo escriben 2.1 (zod ≥ 0) y esta historia
  - `[low]` `[reject]` (edge) nombre con ß cerca de 60 — improbable
  - `[low]` `[patch]` (edge) P2002 de otro índice como CPF duplicado — mismo patch
  - `[low]` `[reject]` (edge) timeout de transacción SQLite (P2028/P2034) — diferido de concurrencia entre procesos ya registrado
  - `[low]` `[patch]` (edge) página obsoleta tras fallo — `revalidatePath` también en fallo
  - `[low]` `[reject]` (edge) fecha de nacimiento parcial en la tabla — ver arriba
  - `[false]` `[reject]` (edge) claim duplicado solo sobre 1..n — dominio replica 1..n; el unique de base es decisión de arquitectura
  - `[false]` `[reject]` (edge) claim upsert mezcla datos viejos — resuelto por el patch de columnas
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md` 289/289
  - `[false]` `[reject]` (intent) checkboxes de la historia sin marcar — gestión del workflow (sprint-status)
  - `[false]` `[reject]` (intent) límite reverificado en el loop de UI sin e2e — servidor reverifica en cada envío (test)
  - `[low]` `[patch]` (intent) RK-db6fc93c9e4c probada en función no usada — mismo patch del prompt S/N
  - `[false]` `[reject]` (intent) unique de base rechaza copias sobre n — ver arriba
  - `[false]` `[reject]` (intent) CPF "0" tratado como vacío — FR-DEP-04 del PRD (CPF ≠ 0)
  - `[false]` `[reject]` (intent) e2e fuera de `npm test` — el pipeline de verificación corre Playwright aparte
  - `[false]` `[reject]` (intent) transacción sin test de concurrencia — mismo patch
  - `[medium]` `[patch]` (verif) guard de concurrencia sin test — mismo patch
  - `[medium]` `[defer]` (verif) bloqueo por límite D6 en la página sin test — el servidor lo impone; requiere seed e2e con 6 dependientes

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3221 npx playwright test` -- expected: todos en verde

## Auto Run Result

- **Resumen:** dependientes (CADDEPEND) en `/beneficiarios/[cpf]/dependentes`: titular válido (no C/D), límite D6 (> 5), validaciones con mensajes literales, CPF duplicado sobre 1..n, inclusión transaccional con sobrescritura de la ocurrencia n+1 (semántica PE) y guard de concurrencia, prompt legado "INCLUIR OUTRO DEPENDENTE? (S/N)".
- **Implementado en paralelo** (worktree, ola A); integrado por merge.
- **Review:** 31 hallazgos — 7 patches (2 `medium`: herencia de columnas en la sobrescritura, test del guard de concurrencia; 5 `low`), 2 diferidos, 22 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 2, low 5. Riesgo: e2e compartiendo seed en paralelo.
- **Verificación (tras merge):** lint 0; `npm test` 400/400; build OK; e2e 23/23.
