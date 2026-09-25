---
title: 'Story 2.5 — Registro de descuentos del beneficiario'
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

**Problem:** No hay forma de registrar los descuentos del beneficiario (PE `DESCONTOS` que lee CALCDSCT), entrada necesaria para el recálculo de descuentos de la historia 4.3 (D14).

**Approach:** Entregar `/beneficiarios/[cpf]/descontos`, una tabla editable (máx. 8 filas) que reemplaza el grupo completo en una transacción, con validaciones en `src/domain/beneficiario/descontosRegistrados.ts` y el caso de uso en `src/server/descontosRegistrados.ts`, reutilizando el editor de grupos de la historia 1.1.

## Boundaries & Constraints

**Always:**
- Filas de `BeneficiarioDesconto` (máx. 8, validado en el dominio): tipo ∈ {C, I, J, S, P, A} (dominio del código, D15: C=Contribuição, I=Imposto, J=Judicial, S=Sindical, P=Pensão alimentícia, A=Administrativo), valor fijo (`Moeda` → centavos, ≤ Int32), porcentaje (`Fator` N3.2 → string), fecha inicio (`DataLegada`, obligatoria), fecha fin (`DataLegada`, vacío = 0 indefinido), número de proceso (20, obligatorio si tipo J).
- Validaciones: al menos uno de valor/porcentaje > 0 salvo tipo S; fecha fin 0 o ≥ fecha inicio; mensajes en pt-BR por fila ("Desconto n — …").
- Guardar reemplaza todas las filas del beneficiario con `occurrence` 1..n en una transacción (patrón `salvarFaixas` de 1.1); lectura ordenada por `occurrence`.
- Indicador "vigente hoje" por fila (usando la regla de vigencia de `src/domain/calculo/descontos.ts` → `descontoVigente`, sin duplicarla).
- Beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO".
- zod en la acción; try/catch en la transición; `falhaInesperada` solo con `name`/`code`; entradas truncadas al ancho del campo.
- En la lista de beneficiarios (`src/app/beneficiarios/page.tsx`) habilitar **solo** la acción de fila "Descontos".

**Never:**
- Calcular descuentos ni tocar `Pagamento`/`PagamentoDesconto` (eso es 4.3).
- Auditar; cambiar `sprint-status.yaml` o `navegacao.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Guardar dos | J (R$ 25,00, proceso "123") + S (sin valor) | 2 filas, occurrence 1..2 | "Descontos gravados (2)." |
| Límite | 9 filas | nada grabado | mensaje de límite (máx. 8) |
| J sin proceso | tipo J sin número | nada grabado | error en la fila (proceso obligatorio) |
| Sin valor ni % | tipo I con 0 y 0 | nada grabado | error en la fila |
| Fechas invertidas | inicio 20260101, fin 20251231 | nada grabado | error en la fila |
| Fin indefinido | fin vacío | `dtFimDsct = 0` | No error expected |
| Vigencia | fin < hoy | fila marcada "não vigente" | No error expected |
| Inexistente | CPF no registrado | nada | "BENEFICIARIO NAO ENCONTRADO" |

</intent-contract>

## Code Map

- `src/app/programas/_componentes/EditorGrupo.tsx` + `src/app/programas/actions.ts` (`lerFilas`, `salvarGrupo`) + `src/server/programas.ts` (`salvarFaixas`) -- patrón de edición de grupos a reutilizar (extraer a `src/components/campos/` solo si es necesario y sin romper 1.1).
- `src/domain/calculo/descontos.ts` -- `descontoVigente` (reusar para el indicador).
- `src/server/beneficiarios.ts` -- `obterBeneficiario`, `usuarioOperativo`.
- `src/domain/programa.ts` -- `MAX_CENTAVOS_INT32`, esquemas de centavos/fator/data como referencia.
- `prisma/schema.prisma` `BeneficiarioDesconto`.
- **Paralelo:** corre en worktree junto con 2.4 y 4.1. Usar `E2E_PORT=3222`.

## Tasks & Acceptance

**Execution:**
- `src/domain/beneficiario/descontosRegistrados.ts` (+ test) -- tipos/rótulos, esquema zod por fila, límite 8, validaciones cruzadas.
- `src/server/descontosRegistrados.ts` (+ `tests/descontos-registrados.test.ts`) -- `listarDescontosRegistrados(cpf)`, `salvarDescontosRegistrados(cpf, filas)`.
- `src/app/beneficiarios/[cpf]/descontos/page.tsx`, `actions.ts` -- pantalla 4.7.
- `src/app/beneficiarios/page.tsx` -- acción de fila "Descontos" habilitada.
- `tests/e2e/descontos-registrados.spec.ts` -- guardar dos filas, recargar, error de J sin proceso.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3222 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3222 npx playwright test` -- expected: todos en verde
