---
title: 'Story 1.1 — Inclusión y consulta de programa social'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: '60e9f56e31cb56b041f2705ecb7076f9c0c040da'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/bmad-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Rama P2002 de incluirPrograma (inclusión concurrente del mismo código) sin test.
    evidence: |-
      El test de duplicado pasa por el pre-check findUnique; la rama catch que mapea P2002 a "PROGRAMA JA CADASTRADO" solo se alcanza con doble envío simultáneo y necesita un cliente Prisma simulado.
    location: >-
      src/server/programas.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No existe interfaz ni lógica para programas sociales (CADPROG), que son el dato raíz de beneficiarios, elegibilidad y cálculo; tampoco hay kit de UI ni base de e2e para las épicas siguientes.

**Approach:** Entregar `/programas` (lista con búsqueda/paginación), `/programas/novo` (inclusión con FATOR-K) y `/programas/[cod]` (consulta + edición de los grupos de tramos y parámetros regionales), con reglas en `src/domain/programa.ts`, casos de uso en `src/server/programas.ts`, el kit visual (Tailwind + shadcn/ui, layout con navegación, componentes de campo) y una base SQLite dedicada para e2e.

## Boundaries & Constraints

**Always:**
- Reglas CADPROG en `src/domain/programa.ts`, cada una con `// RK-<clave> (CADPROG:<línea>)` y test: 51 (operación ≠ I/C → "OPERACAO INVALIDA"), 56 (C → consulta), 117 (inexistente → "PROGRAMA NAO ENCONTRADO"), 81 (duplicado → "PROGRAMA JA CADASTRADO"), 87 (`fatorK = 1.00 + fatorReajuste × 0.347215`), 88 (`vlrBase × fatorK`).
- Truncado de asignación Natural: `fatorK` truncado a 6 decimales (N5.6) antes de guardarlo y de multiplicar; `vlrBaseIndividual` truncado a centavos (N9.2). Comentario `// LEGACY-QUIRK(D8)` en el cálculo.
- Inclusión graba `sitPrograma = 'A'`, `fatorK`, `vlrBaseIndividual` ajustado, `dtInclusao/usrInclusao` (`hoje()`, `SIFAP_USER`); mensaje literal "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO:" + valor en `R$`.
- Toda entrada del servidor validada con zod (Server Actions); tipo ∈ {A, P, T}; UI en pt-BR; valores con los componentes de conversión (`Moeda` → centavos, `Fator` → string, `DataLegada` → AAAAMMDD, vacío → 0).
- Grupos: máx. 5 tramos y 6 parámetros regionales validados en el dominio; guardar un grupo reemplaza todas sus filas en una transacción con `occurrence` 1..n.
- Aviso fijo en los parámetros regionales: "Parâmetros informativos — o cálculo usa as tabelas legadas (D1)".

**Never:**
- Acciones de alterar o excluir el programa (el legado no las tiene).
- Registrar auditoría (CADPROG no audita).
- Usar los grupos en cálculos (D1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inclusión válida | cód `PX01`, tipo A, base R$ 150,00, fator reajuste `0.0450` | `fatorK` `1.015624` (1.01562467… truncado), base grabada R$ 152,34 (152,343… truncado), status A, mensaje con `R$ 152,34` | No error expected |
| Código duplicado | incluir `PX01` de nuevo | nada grabado | "PROGRAMA JA CADASTRADO" |
| Tipo inválido | tipo `X` | nada grabado | error de validación en el campo tipo |
| Consulta existente | `/programas/PX01` | código, nombre, tipo, valor base, elegibilidad, status + grupos | No error expected |
| Consulta inexistente | `/programas/ZZZZ` | panel de resultado | "PROGRAMA NAO ENCONTRADO" |
| Operación inválida | `validarOperacao("X")` | — | "OPERACAO INVALIDA" |
| Límite de tramos | guardar 6 tramos | nada grabado | mensaje de límite (máx. 5) |
| Límite regional | guardar 7 parámetros | nada grabado | mensaje de límite (máx. 6) |
| Búsqueda | `/programas?q=renda` | solo programas con código o nombre que contienen el texto (sin distinguir mayúsculas) | No error expected |

</intent-contract>

## Code Map

- `src/domain/money.ts` -- `dec`, `truncar`, `aCentavos`, `deCentavos`, `fator`; usar para FATOR-K (truncar a 6 con `toDecimalPlaces(6, ROUND_DOWN)` vía una función nueva en money si hace falta, sin importar decimal.js fuera de money).
- `src/domain/legacyDate.ts` -- `dataParaInt`/`intParaData`, `hoje()`.
- `src/server/db.ts` -- `prisma`, `createPrismaClient` (tests con base temporal, patrón de `tests/schema.test.ts`).
- `prisma/schema.prisma` -- modelos `ProgramaSocial`, `ProgramaFaixaCalculo`, `ProgramaParamRegional` (sin cambios de esquema).
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` -- reemplazar por layout con barra lateral de 5 grupos (DESIGN §2); "Programas sociais" enlaza a `/programas`.
- `playwright.config.ts` -- `webServer` hoy sin base propia (deferred de 0.1): pasar `DATABASE_URL=file:./e2e.db` y ejecutar `prisma migrate reset --force` + seed antes de `next dev`.
- `.gitignore` -- ya ignora `*.db`.
- Contexto: `epic-1-context.md` (FR-PRG-01..04, pantallas 4.1–4.3, componentes, flujo F1).

## Tasks & Acceptance

**Execution:**
- `package.json`, `src/app/globals.css`, `components.json`, `src/components/ui/*` -- Tailwind CSS 4 + shadcn/ui (button, input, label, select, table, card, badge, alert) -- kit visual de ARCH §1.
- `src/components/campos/*` -- `Moeda`, `Fator`, `DataLegada`, `Codigo`, `ResultadoLegado`, `TabelaPaginada` según DESIGN §3 -- reutilizables por E2–E7.
- `src/app/layout.tsx` -- layout pt-BR con barra lateral (Cadastro, Validação, Cálculo e Pagamentos, Processos, Relatórios) y encabezado con `SIFAP_USER`.
- `src/domain/programa.ts` (+ test) -- mensajes, `validarOperacao`, `calcularFatorK`, `calcularVlrBaseAjustado`, validación de límites de grupos, esquema zod de inclusión.
- `src/server/programas.ts` (+ `tests/programas.test.ts`) -- `listarProgramas({q, pagina})`, `consultarPrograma(cod)`, `incluirPrograma(dados)`, `salvarFaixas(cod, filas)`, `salvarParamsRegionais(cod, filas)`.
- `src/app/programas/page.tsx`, `novo/page.tsx`, `[cod]/page.tsx`, `actions.ts` -- pantallas 4.1–4.3 con Server Actions validadas por zod.
- `playwright.config.ts`, `tests/e2e/programas.spec.ts` -- base e2e dedicada; flujo F1: incluir, ver mensaje con valor ajustado, consultar, agregar un tramo.

**Acceptance Criteria:**
- Given la pantalla de un programa, when se inspecciona, then no hay botones ni rutas de alterar/excluir el programa.
- Given `npm run lint && npm test && npm run build && npx playwright test`, when se ejecutan, then todo en verde.
- Given `grep -rn "decimal.js" src | grep -v src/domain/money`, when se ejecuta, then sin resultados.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 50 findings — high 0, medium 5, low 26, false 19, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) máx. de centavos supera Int32 de Prisma → error genérico — tope 2.147.483.647 con mensaje
  - `[medium]` `[patch]` (blind) sin control de overflow del valor ajustado — rechazo con mensaje antes de grabar
  - `[false]` `[reject]` (blind) faltan validaciones cruzadas (dtFim≥dtInicio, idadeMin≤idadeMax, faixas invertidas/superpuestas, codRegiao duplicado) — CADPROG no valida ninguna; equivalencia funcional; los grupos no se usan en cálculos (D1)
  - `[false]` `[reject]` (blind) `dtInicio` vacío → `dtCriacao = 0` — CADPROG acepta DT-INICIO 0 sin validar
  - `[low]` `[reject]` (blind) fecha a medio tipear en `DataLegada` → 0 — el selector nativo no envía valores parciales en el uso normal; exigiría `validity.badInput` en todos los campos
  - `[medium]` `[patch]` (blind) `textoParaCentavos` interpreta mal puntos ("1.2345" → R$ 12.345) — regex estricta de miles/decimales + tests
  - `[false]` `[reject]` (blind) edición de grupos sin auditoría — FR-PRG-04/historia piden editar los grupos en la pantalla del programa; CADPROG no audita
  - `[low]` `[patch]` (blind) `EditorGrupo` con errores por índice que sobreviven a agregar/quitar — se limpian al cambiar filas
  - `[low]` `[reject]` (blind) `EditorGrupo` no toma datos revalidados — tras guardar la página recarga el estado del servidor en la navegación; improbable
  - `[low]` `[reject]` (blind) faltan tests de `actions.ts`/P2002/`formatarReais`/componentes — cubiertos por el e2e ampliado (patch de verificación); resto improbable
  - `[low]` `[reject]` (blind) literal `E2E_DATABASE_URL` duplicado y `npx` en Windows — entorno macOS/Linux/Docker; deriva improbable
  - `[low]` `[patch]` (blind) `TabelaPaginada` con `id="busca"` fijo y `key` por título — `useId()` + clave estable
  - `[false]` `[reject]` (blind) búsqueda ignora sigla — la historia pide búsqueda por código/nombre
  - `[false]` `[reject]` (intent) RK-d20a15a018e6/RK-a1d8765eea49 inalcanzables desde la UI — decisión del spec: las rutas reemplazan la operación I/C; regla preservada en el dominio con test
  - `[false]` `[reject]` (intent) columna sigla sin origen — la historia pide la columna; el campo existe en el DDM/seed
  - `[false]` `[reject]` (intent) "Valor base" muestra el ajustado — FR-PRG-03 graba el valor × FATOR-K; la ficha lo rotula
  - `[false]` `[reject]` (intent) tipo fuera de {A,P,T} solo probado en esquema — la UI no puede enviarlo; el esquema es la defensa
  - `[low]` `[reject]` (intent) paginación sin e2e — cubierta en el test de servidor
  - `[low]` `[reject]` (intent) límite de grupos no alcanzable desde la UI — guard de dominio/servidor probado
  - `[false]` `[reject]` (intent) FATOR-K truncado a N5.6 no está en el texto de la historia — decisión explícita del spec (semántica de asignación Natural, D8)
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md`: 289/289 verificadas en RNC (se commitea con esta historia)
  - `[false]` `[reject]` (intent) infraestructura fuera del alcance — el intent del spec incluye kit visual y base e2e
  - `[low]` `[patch]` (verif) guardado de parámetros regionales por la UI sin test — e2e ampliado
  - `[low]` `[patch]` (verif) lectura multi-fila del formulario solo probada con una fila — e2e con 2 faixas + fila inválida
  - `[medium]` `[defer]` (verif) rama P2002 (carrera de duplicado) sin test — requiere stub de Prisma; pre-check común verificado
  - `[low]` `[patch]` (verif) tope de 8 caracteres de `usrInclusao` no observado — test con `OPERADOR01`
  - `[low]` `[patch]` (edge) `decodeURIComponent` lanza con escapes inválidos (×2: metadata y página) — try/catch con fallback
  - `[low]` `[reject]` (edge) `intParaData` lanza con fechas grabadas inválidas — solo se graban fechas validadas por zod/seed
  - `[low]` `[patch]` (edge) errores obsoletos por índice en `EditorGrupo` — mismo patch
  - `[false]` `[reject]` (edge) faixa invertida, codRegiao duplicado, codRegiao fuera de 01–05/99, dtFim<dtInicio, idadeMin>idadeMax, dtInicio vacío (×6) — el legado no valida; grupos informativos (D1)
  - `[medium]` `[patch]` (edge) overflow del valor ajustado — mismo patch
  - `[medium]` `[patch]` (edge) valores con puntos mal formados — mismo patch de `conversao.ts`
  - `[low]` `[reject]` (edge) encabezado muestra `SIFAP_USER` completo vs 8 grabados — cosmético
  - `[false]` `[reject]` (edge) `codElegibilidade` arbitrario — CADPROG acepta cualquier A5

## Design Notes

- Código de programa: 1–4 caracteres `[A-Z0-9]` en mayúsculas (DDM A4; el seed usa `PA01`); el código N4 del programa Natural se admite como caso particular.
- La operación I/C del legado se sustituye por rutas; `validarOperacao` conserva la regla 51/56 como función de dominio que las acciones usan con valores fijos.
- Ejemplo FATOR-K: `0.0450 × 0.347215 = 0.015624675` → `1.015624675` → N5.6 → `1.015624`; `150.00 × 1.015624 = 152.3436` → N9.2 → `152.34`.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `npx playwright test` -- expected: home + programas en verde
- `grep -rn "decimal.js" src | grep -v src/domain/money` -- expected: sin resultados

## Auto Run Result

- **Resumen:** programas sociales (CADPROG): lista con búsqueda/paginación, inclusión con FATOR-K (D8, truncados Natural N5.6/N9.2), consulta con edición de faixas/parâmetros regionais (D1), más el kit visual (Tailwind 4 + shadcn/ui), layout con navegación, componentes de campo y base SQLite dedicada para e2e.
- **Archivos principales:** `src/domain/programa.ts` (6 RK + esquemas zod), `src/server/programas.ts` (casos de uso), `src/app/programas/**` (pantallas 4.1–4.3 + Server Actions), `src/components/{ui,campos,layout}/**`, `src/domain/money.ts` (`truncarCasas`, `fatorParaString`, `formatarReais`), `scripts/e2e-db.mjs`, `playwright.config.ts`, tests unitarios/servidor/e2e.
- **Review:** 50 hallazgos — 8 patches (3 `medium`: tope Int32 de centavos, overflow del valor ajustado, lectura de montos con puntos; 5 `low`), 1 diferido (carrera P2002), 41 rechazados (mayoría: validaciones que el legado no hace).
- **Follow-up review recomendado:** `true` — patches: high 0, medium 3, low 5. Riesgo no verificado: conversión de montos en la UI (`textoParaCentavos`) y límites Int32 en todos los campos monetarios, que las épicas siguientes reutilizan.
- **Verificación:** lint 0 errores; `npm test` 86/86; build OK; `npx playwright test` 5/5; sin `decimal.js` fuera de `money.ts`; RK verificadas en RNC (`rk-verification.md`).
- **Riesgos residuales:** e2e fuera de `npm test` (sin CI); desvío documentado del reset de base e2e (script con ruta fija en vez de `migrate reset`).
