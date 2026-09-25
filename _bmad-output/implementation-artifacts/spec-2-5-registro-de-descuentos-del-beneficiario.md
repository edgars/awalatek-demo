---
title: 'Story 2.5 — Registro de descuentos del beneficiario'
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
      Ocultar errores por fila tras agregar/quitar filas en EditorDescontos (y EditorGrupo) sin test.
    evidence: |-
      Sin tests de componentes ni e2e que quiten una fila después de un error; solo afecta la UI.
    location: >-
      src/app/beneficiarios/[cpf]/descontos/EditorDescontos.tsx
    severity: low
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

### 2026-09-25 — Review pass
- verdicts: 38 findings — high 0, medium 3, low 22, false 13, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verif) camino de error inesperado de la acción sin test — test con error con PII
  - `[low]` `[defer]` (verif) ocultar errores por fila tras agregar/quitar sin test — mismo patrón sin test que EditorGrupo (1.1); solo UI
  - `[low]` `[patch]` (verif) seed con J sin número de proceso — seed corregido
  - `[low]` `[reject]` (verif) e2e serial no recupera en reintentos — la base e2e se recrea por corrida
  - `[false]` `[reject]` (intent) edición/borrado como reemplazo total — decisión del spec (patrón de grupos de 1.1)
  - `[low]` `[reject]` (intent) tope de 8 en la UI sin e2e — dominio/servidor/acción lo imponen (tests)
  - `[low]` `[reject]` (intent) reglas AC3 solo probadas en dominio/acción — cubiertas; pantalla probada en flujo
  - `[false]` `[reject]` (intent) decisiones no explícitas (inicio obligatorio, 20 caracteres, 999,99 %, S con valor, 0 = vacío) — decisiones del spec
  - `[false]` `[reject]` (intent) vigencia fuera de "sin reglas legadas" — el spec pide el indicador reutilizando `descontoVigente`
  - `[false]` `[reject]` (intent) checkboxes sin marcar — gestión del workflow
  - `[low]` `[reject]` (intent) segundo e2e depende del primero — ver arriba
  - `[medium]` `[patch]` (blind) tipo I con solo valor fijo descuenta cero — I exige percentual > 0
  - `[low]` `[patch]` (blind) C y S con entradas sin efecto sin aviso — pistas en la fila
  - `[low]` `[patch]` (blind) seed viola la regla J — mismo patch
  - `[medium]` `[patch]` (blind) badges de vigencia en filas equivocadas si se agrega/quita durante el guardado — botones deshabilitados mientras está pendiente
  - `[low]` `[reject]` (blind) badges/mensajes obsoletos tras editar — se actualizan al guardar; cosmético
  - `[low]` `[reject]` (blind) errores cruzados en segunda vuelta — improbable
  - `[low]` `[patch]` (blind) servidor no revalida el esquema completo — `descontoRegistradoSchema` en el caso de uso
  - `[low]` `[patch]` (blind) tipo truncado acepta basura — se rechaza > 1 carácter
  - `[false]` `[reject]` (blind) percentual sin tope de negocio / valor y % juntos — N3.2 del spec; en J/P/A el valor fijo gana como en CALCDSCT
  - `[false]` `[reject]` (blind) sin chequeo contra `tiposDescontoAplic` del programa — CALCDSCT no lo verifica
  - `[low]` `[reject]` (blind) `lerFilas` copiado — un archivo `"use server"` no puede exportar helpers síncronos; refactor tras integrar la ola
  - `[low]` `[reject]` (blind) tests faltantes varios — falhaInesperada cubierto por el patch; resto improbable
  - `[low]` `[reject]` (blind) e2e dependiente del orden — ver arriba
  - `[low]` `[patch]` (blind) `DATABASE_URL` global sin restaurar — `vi.stubEnv` + reset del singleton
  - `[medium]` `[patch]` (edge) vigentes mapeados por posición durante el guardado — mismo patch
  - `[low]` `[patch]` (edge) agregar/quitar habilitados mientras pendiente — mismo patch
  - `[false]` `[reject]` (edge) tipo almacenado fuera del dominio — no hay datos legados migrados
  - `[false]` `[reject]` (edge) `pctDesconto` almacenado mal formado — solo se graba vía esquema
  - `[low]` `[reject]` (edge) filas almacenadas inválidas no marcadas al cargar — el seed se corrige; no hay otras fuentes
  - `[low]` `[patch]` (edge) fechas fuera de calendario (20260231) — validación de calendario real
  - `[low]` `[patch]` (edge) FormData con columnas desalineadas — rechazo si longitudes difieren
  - `[low]` `[reject]` (edge) `z.coerce.number` acepta 1e3/0x10 — entradas vienen de componentes que envían dígitos
  - `[low]` `[patch]` (edge) listado que lanza rompe la página — try/catch con error genérico
  - `[false]` `[reject]` (edge) claim de reutilizar el editor de 1.1 — el agente documentó por qué creó `EditorDescontos` (tipos de columna distintos)
  - `[false]` `[reject]` (blind) cobertura del tope de 8 — ver arriba
  - `[false]` `[reject]` (intent) S con valores aceptada — lectura R3a del spec
  - `[false]` `[reject]` (intent) "0 = indefinido" como campo vacío — decisión del spec

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3222 npx playwright test` -- expected: todos en verde

## Auto Run Result

- **Resumen:** registro de descuentos del beneficiario (D14) en `/beneficiarios/[cpf]/descontos`: tabla editable (máx. 8) que reemplaza el grupo en una transacción, validaciones por fila (tipo C/I/J/S/P/A — D15, J con proceso, I con percentual, valor/percentual > 0 salvo S, fechas de calendario, fin ≥ inicio), indicador de vigencia reutilizando `descontoVigente`, pistas para C/S.
- **Implementado en paralelo** (worktree, ola A); integrado por merge (conflicto trivial en la lista de beneficiarios con 2.4).
- **Review:** 38 hallazgos — 10 patches (3 `medium`: tipo I con solo valor descontaba cero, badges en filas equivocadas, error inesperado sin test; 7 `low`), 1 diferido, 27 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 3, low 7. Riesgo: coherencia entre lo que se registra y lo que 4.3 descuenta.
- **Verificación (tras merge):** lint 0; `npm test` 437/437; build OK; e2e 26/26.
