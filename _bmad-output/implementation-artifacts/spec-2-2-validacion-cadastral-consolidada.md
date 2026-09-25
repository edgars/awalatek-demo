---
title: 'Story 2.2 — Validación cadastral consolidada'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: 'd0f67c2583280800e95056597a43dbb09ef5a044'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: >-
      Rama de error inesperado (try/catch → falhaInesperada) de las Server Actions sin test, en validacao/cadastro, programas y beneficiarios.
    evidence: |-
      Ningún test fuerza una excepción de la base; quitar el try/catch o loguear e.message (con datos personales) no rompería ningún test.
    location: >-
      src/app/*/actions.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No existe la rutina VALBENEF, que valida los datos cadastrales acumulando todos los errores (a diferencia de CADBENEF, que corta en el primero).

**Approach:** Implementar `validarCadastroConsolidado(dados, anoAtual)` en `src/domain/beneficiario/validacao.ts` replicando VALBENEF (incluidas sus rarezas D4b, D16 y D19), agregar a `src/domain/cpf.ts` la validación completa con dígitos repetidos, y exponerla en la pantalla `/validacao/cadastro`.

## Boundaries & Constraints

**Always:**
- Resultado `{ resultado: 'V' | 'I', erros: string[] }` acumulando hasta 10 errores, en el orden del legado: CPF → fecha → nombre → UF → status, con mensajes literales: "CPF INVALIDO - DIGITO VERIFICADOR", "DATA NASCIMENTO INVALIDA", "NOME INVALIDO - DEVE TER NOME E SOBRENOME", "UF INVALIDA", "STATUS INVALIDO".
- CPF (`validaCpfCompleto` en `cpf.ts`): 11 dígitos todos iguales → inválido, **excepto** si los tres primeros son `0` (es decir, `00000000000` es válido) con `// LEGACY-QUIRK(D4b)`; si no, módulo 11 reutilizando `calculaDv1/calculaDv2`.
- Fecha AAAAMMDD: año entre 1900 y `anoAtual`, mes 1–12, día 1..días del mes con febrero = 29 siempre (`// LEGACY-QUIRK(D16)`).
- Nombre: vacío → inválido; si no, se simula el campo Natural A60 relleno con espacios (`nome.padEnd(60).slice(0,60)`) y se busca la posición del primer espacio; posición > 1 → válido (`// LEGACY-QUIRK(D19)`: por el relleno, un nombre de una sola palabra es válido salvo que ocupe 60 caracteres).
- UF: solo si informada (no en blanco) debe pertenecer a las 27 UFs.
- Status ∈ {A, S, C, I, D}; blanco es inválido.
- Cada una de las 30 reglas de la tabla de la historia con `// RK-<clave> (VALBENEF:<línea>)` y al menos un test; `anoAtual` se inyecta (`hoje()` en el servidor).
- Pantalla `/validacao/cadastro` (DESIGN 4.9): campos CPF (`CpfInput`), Nome, Data de nascimento (`DataLegada`), UF (select con opción vacía), Situação (select con opción vacía) + botón "Carregar do cadastro" que rellena desde un beneficiario por CPF; resultado en `ResultadoLegado` (`V`/`I` + lista numerada). Enlace "Validação cadastral" activo en la barra lateral.

**Never:**
- Grabar nada ni auditar (VALBENEF solo valida y muestra).
- Cambiar el comportamiento de CADBENEF (2.1) ni integrar esta rutina en la inclusión.
- "Corregir" D4b, D16 o D19.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Todo válido | CPF válido, 19850412, "MARIA DA SILVA", SP, A | `V`, sin errores | No error expected |
| Acumula todos | CPF DV inválido, fecha 18990101, nombre vacío, UF "XX", status "Z" | `I` con 5 errores en orden CPF, fecha, nombre, UF, status | No error expected |
| D4b ceros | `00000000000` | CPF válido | No error expected |
| D4b repetidos | `11111111111` | "CPF INVALIDO - DIGITO VERIFICADOR" | No error expected |
| D16 | `20230229` (año no bisiesto) | fecha válida | No error expected |
| Fecha fuera de rango | `20260431` / `18991231` / año > actual | "DATA NASCIMENTO INVALIDA" | No error expected |
| D19 una palabra | "MARIA" | nombre válido | No error expected |
| D19 60 caracteres sin espacio | "A"×60 | "NOME INVALIDO - DEVE TER NOME E SOBRENOME" | No error expected |
| UF en blanco | UF "" | sin error de UF | No error expected |
| Status en blanco | status "" | "STATUS INVALIDO" | No error expected |
| Cargar del cadastro | CPF de un beneficiario del seed | campos rellenados con sus datos | CPF inexistente → "BENEFICIARIO NAO ENCONTRADO" |

</intent-contract>

## Code Map

- `src/domain/cpf.ts` -- `calculaDv1`, `calculaDv2`, `validaModulo11`; agregar `validaCpfCompleto` (D4b) con RK de VALBENEF 190–236.
- `src/domain/legacyDate.ts` -- `anoDe`, `hoje`; la validación de calendario D16 vive en `validacao.ts` (no cambiar `intParaData`).
- `src/domain/beneficiario/cadastro.ts` -- patrón de mensajes y RK por línea (no modificar su comportamiento).
- `src/server/beneficiarios.ts` -- `obterBeneficiario(cpf)` (o equivalente) para "Carregar do cadastro".
- `src/app/beneficiarios/actions.ts` + `src/components/campos/*` -- patrón de Server Action con zod, `CpfInput`, `DataLegada`, `ResultadoLegado`, `useAcaoFormulario`.
- `src/components/layout/navegacao.ts` -- activar `href: "/validacao/cadastro"`.
- Fuente legado: `docs/prd.md` FR-VAL-01..05 y Anexo A (VALBENEF 110–274).

## Tasks & Acceptance

**Execution:**
- `src/domain/cpf.ts` (+ test) -- `validaCpfCompleto(cpf)` con D4b.
- `src/domain/beneficiario/validacao.ts` (+ test) -- mensajes, `validarDataNascimento`, `validarNome` (D19), `validarUf`, `validarStatus`, `validarCadastroConsolidado(dados, anoAtual)`; tests por RK y por fila de la matriz.
- `src/app/validacao/cadastro/page.tsx`, `actions.ts` -- pantalla 4.9 con Server Actions (validar / cargar del cadastro).
- `src/components/layout/navegacao.ts` -- enlace activo.
- `tests/e2e/validacao-cadastro.spec.ts` -- cargar un beneficiario del seed y validar (`V`); validar datos con varios errores (lista numerada en orden).

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && npx playwright test`, when se ejecutan, then todo en verde.
- Given la pantalla, when se valida, then no se graba ningún registro (conteos de beneficiarios y auditoría iguales).

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 33 findings — high 0, medium 3, low 16, false 14, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) CPF en blanco pasa desde la pantalla — equivalente al legado: #CPF N11 en blanco = 0 → `00000000000` → válido por D4b
  - `[medium]` `[patch]` (blind) carga fallida deja datos del beneficiario anterior — se limpian los demás campos
  - `[low]` `[patch]` (blind) `carregarDoCadastroAction` sin validar entrada — rechaza lo que no sea 1–11 dígitos
  - `[low]` `[reject]` (blind) consulta de datos personales sin autorización/auditoría — auth fuera de alcance; VALBENEF no audita
  - `[low]` `[patch]` (blind) normalización de CPF duplicada — helper único en `cpf.ts`
  - `[medium]` `[patch]` (blind) cableado frágil de la base en el test de acciones — singleton global reiniciado y desconectado
  - `[low]` `[reject]` (blind) mensajes sin fuente citada / "INCORRETO" vs sin — literales de FR-VAL-01 vs FR-BEN-03 (programas distintos); cosmético
  - `[low]` `[patch]` (blind) `.max(200)` + solo `issues[0]` rompe la acumulación — se trunca en lugar de rechazar
  - `[false]` `[reject]` (blind) contrato de formato de la fecha sin test — el e2e espera `V` con fecha del selector (falla si cambia)
  - `[low]` `[reject]` (blind) e2e sin UF inválida/D4b/D16 — cubiertos por tests de dominio
  - `[false]` `[reject]` (blind) tope de 10 errores inalcanzable — replica el arreglo `#MSG-ERRO(10)` del legado; máximo real 5
  - `[false]` `[reject]` (blind) sin test de dígitos repetidos ≠ 0 contra `validaModulo11` — `validaCpfCompleto` tiene el loop de repetidos
  - `[false]` `[reject]` (intent) no se integra en el guardado — la historia define servicio + pantalla; CADBENEF no llama a VALBENEF; el spec lo excluye
  - `[false]` `[reject]` (intent) regla de nombre D19 vs texto — decisión explícita del spec (semántica A60 de Natural)
  - `[low]` `[reject]` (intent) nombre `validarCadastroConsolidado` vs `validarCadastro` — `validarCadastro` ya existe (CADBENEF, 2.1); mismo contrato de resultado
  - `[false]` `[reject]` (intent) excepción `000` — confirmado en VALBENEF:195–203: anidada en "todos iguales"
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md` 289/289
  - `[low]` `[reject]` (intent) quirks solo en tests de dominio — lógica pura; pantalla probada en flujo
  - `[medium]` `[defer]` (verif) rama de error inesperado de las acciones sin test — mismo patrón sin test en 1.1/2.1; fallback defensivo
  - `[low]` `[patch]` (edge) rechazo de `validarCadastroAction` no capturado en la transición — try/catch
  - `[low]` `[patch]` (edge) rechazo de `carregarDoCadastroAction` no capturado — mismo patch
  - `[low]` `[reject]` (edge) ediciones durante la carga descartadas — ventana mínima; improbable
  - `[false]` `[reject]` (edge) status cargado fuera de dominio → select vacío — solo se graban status válidos
  - `[low]` `[reject]` (edge) UF/status con espacios vs ancho legado — entradas vienen de selects
  - `[low]` `[patch]` (edge) nombre > 200 devuelve mensaje no legado — mismo patch de truncado
  - `[low]` `[patch]` (edge) solo `issues[0]` — mismo patch
  - `[medium]` `[patch]` (edge) singleton no desconectado antes de `rmSync` — mismo patch del test
  - `[medium]` `[patch]` (edge) singleton de otro archivo apunta a otra base — mismo patch del test

## Design Notes

- D19 (nuevo): VALBENEF `EXAMINE #NOME FOR ' ' GIVING POSITION #POS` sobre A60 relleno con espacios → la regla "nombre y apellido" solo falla con 60 caracteres sin espacios. Se replica; queda en la lista de decisiones de negocio junto a D4, D17, D18.
- Fila "Acumula todos" usa `18990101` como fecha inválida (año < 1900).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `npx playwright test` -- expected: todos en verde

## Auto Run Result

- **Resumen:** VALBENEF consolidado: `validarCadastroConsolidado` acumula hasta 10 errores (CPF → fecha → nombre → UF → status) con mensajes literales; `validaCpfCompleto` (D4b), febrero con 29 días (D16), nombre con semántica A60 (D19, nuevo); pantalla `/validacao/cadastro` con "Carregar do cadastro", sin grabar ni auditar.
- **Archivos:** `src/domain/cpf.ts` (`validaCpfCompleto`, `normalizaCpfNumerico`), `src/domain/beneficiario/validacao.ts` (30 RK), `src/app/validacao/cadastro/**`, `src/components/layout/navegacao.ts`, tests de dominio/acciones/e2e.
- **Review:** 33 hallazgos — 6 patches (2 `medium`: datos residuales tras carga fallida, singleton de base en el test; 4 `low`), 1 diferido (rama de error inesperado de las acciones sin test), 26 rechazados.
- **Follow-up review recomendado:** `false` — patches: high 0, medium 2 (agrupados), low 4; sin riesgo no verificado nombrable más allá del diferido.
- **Verificación:** lint 0; `npm test` 299/299; build OK; e2e 13/13; D4b confirmado en VALBENEF:195–203.
- **Pendiente de negocio:** D19 (validación de nombre y apellido prácticamente inactiva en el legado).
