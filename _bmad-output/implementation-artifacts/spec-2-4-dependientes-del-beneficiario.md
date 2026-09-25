---
title: 'Story 2.4 — Dependientes del beneficiario'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
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

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3221 npx playwright test` -- expected: todos en verde
