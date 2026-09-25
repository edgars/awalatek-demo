---
title: 'Story 2.3 — Validación de documentos'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '5a787f965578cc241441a6a234a4cb925041a40c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: >-
      Pantalla /validacao/documentos con LEGACY_DOC_ESPECIAL_ENABLED=true (sello "DOCUMENTO ESPECIAL VALIDADO") sin test de UI.
    evidence: |-
      Playwright fija el flag en false; solo la acción verifica docEspecial=true. Requiere un segundo proyecto/servidor e2e con el flag activo.
    location: >-
      src/app/validacao/documentos/_componentes/FormValidacaoDocumentos.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** No existe la rutina VALDOCS de validación de documentos del beneficiario (CPF, RG y documento especial por prefijo).

**Approach:** Implementar `validarDocumentos(dados, quirks)` en `src/domain/beneficiario/documentos.ts` replicando VALDOCS (con D4 detrás del flag `LEGACY_DOC_ESPECIAL_ENABLED`, desactivado por defecto) y exponerla en `/validacao/documentos`, siguiendo el patrón de la pantalla de 2.2.

## Boundaries & Constraints

**Always:**
- Resultado `{ resultado: 'V' | 'I', erros: string[], docEspecial: boolean }`, hasta 5 errores, en el orden legado CPF → RG, con mensajes literales "CPF INVALIDO" y "RG INVALIDO OU FORMATO INCORRETO".
- CPF (`VALIDA-CPF-DOC`): CPF numérico 0 (vacío) → inválido (RK VALDOCS:102); si no, módulo 11 con `calculaDv1/calculaDv2` (sin regla de dígitos repetidos — VALDOCS no la tiene). Entrada normalizada con `normalizaCpfNumerico`.
- RG (`VALIDA-RG`): vacío → inválido; se simula el campo Natural A15 (`rg.padEnd(15).slice(0,15)`), longitud = posición del primer espacio − 1 (15 si no hay espacio); longitud < 5 → inválido (`// LEGACY-QUIRK(D20)`: un RG con espacio interno cuenta solo hasta el espacio, p. ej. "12 345678" → longitud 2 → inválido).
- Documento especial (`CHECK-DOC-ESPECIAL`, D4): **solo si** `quirks.docEspecialHabilitado` es `true` y el CPF (11 dígitos) empieza por 000, 001, 002, 010, 011, 099, 100 o 999 → anula todos los errores, resultado `V`, `docEspecial: true` y aviso "** DOCUMENTO ESPECIAL VALIDADO **"; con el flag en `false` el prefijo no tiene efecto. Comentario `// LEGACY-QUIRK(D4)`.
- Título de elector (12) y CTPS (15) se reciben y no se validan (igual que el legado).
- Cada una de las 18 reglas de la tabla de la historia con `// RK-<clave> (VALDOCS:<línea>)` y test; el flag se lee con `lerQuirks()` en el servidor e inyecta en el dominio.
- Pantalla `/validacao/documentos` (DESIGN 4.10): CPF (`CpfInput`), RG, Título de eleitor, CTPS; resultado en `ResultadoLegado` (`V`/`I` + lista numerada + sello si `docEspecial`); try/catch en la transición; enlace "Documentos" activo en la barra lateral. Truncar entradas al ancho legado en vez de rechazarlas.

**Never:**
- Grabar nada ni auditar; tocar `documentosOk` del beneficiario.
- Activar D4 por defecto o fuera del flag.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Válido | CPF válido, RG "123456789" | `V`, sin errores | No error expected |
| CPF vacío | CPF "" , RG válido | `I` | "CPF INVALIDO" |
| CPF DV inválido | `01234567891` | `I` | "CPF INVALIDO" |
| Repetidos | `11111111111` (DV coincide) | CPF válido (VALDOCS no chequea repetidos) | No error expected |
| RG vacío | RG "" | `I` | "RG INVALIDO OU FORMATO INCORRETO" |
| RG corto | "1234" | `I` | "RG INVALIDO OU FORMATO INCORRETO" |
| RG 5 | "12345" | RG válido | No error expected |
| D20 espacio interno | "12 345678" | `I` | "RG INVALIDO OU FORMATO INCORRETO" |
| Acumula | CPF inválido y RG vacío | `I` con 2 errores en orden CPF, RG | No error expected |
| D4 flag off | CPF `00100000000` inválido, RG vacío, flag false | `I` con 2 errores, `docEspecial: false` | No error expected |
| D4 flag on | mismo caso, flag true | `V`, 0 errores, `docEspecial: true`, aviso | No error expected |

</intent-contract>

## Code Map

- `src/domain/cpf.ts` -- `calculaDv1`, `calculaDv2`, `normalizaCpfNumerico`; agregar comentarios RK de VALDOCS 114–140 junto a los existentes (sin cambiar comportamiento).
- `src/domain/quirks.ts` -- `lerQuirks()` → `{ docEspecialHabilitado }`.
- `src/domain/beneficiario/validacao.ts` + `src/app/validacao/cadastro/**` -- patrón de 2.2 (esquema que trunca al ancho legado, acciones con try/catch, `ResultadoLegado`).
- `src/components/layout/navegacao.ts` -- activar `href: "/validacao/documentos"`.
- Reglas: `docs/stories/2-3-validación-de-documentos.md` (18 RK) y `docs/prd.md` Anexo A (VALDOCS 69–174).

## Tasks & Acceptance

**Execution:**
- `src/domain/beneficiario/documentos.ts` (+ test) -- mensajes, `validarRg` (D20), `ehDocEspecial` (D4), `validarDocumentos(dados, quirks)`; tests por RK y por fila de la matriz.
- `src/app/validacao/documentos/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.10.
- `src/components/layout/navegacao.ts` -- enlace activo.
- `tests/validacao-documentos.test.ts` -- acción con flag on/off (stub de env) y sin escrituras en base.
- `tests/e2e/validacao-documentos.spec.ts` -- válido `V`; CPF inválido + RG corto → 2 errores en orden.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && npx playwright test`, when se ejecutan, then todo en verde.
- Given `LEGACY_DOC_ESPECIAL_ENABLED` ausente, when se valida un CPF con prefijo especial, then no hay sello ni se anulan errores.

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 25 findings — high 0, medium 1, low 13, false 11, maybe-false 0
- findings:
  - `[medium]` `[defer]` (verif) pantalla con flag D4 activo nunca probada (sello) — requiere segundo proyecto Playwright con el flag en true
  - `[false]` `[reject]` (blind) CPF vacío + flag on → documento especial — equivalente al legado: #CPF N11 = 0 → "00000000000" → prefijo 000; flag desactivado por defecto
  - `[false]` `[reject]` (blind) D4 anula también el error de RG — confirmado en VALDOCS CHECK-DOC-ESPECIAL: `MOVE 'V' TO #RESULTADO` + `MOVE 0 TO #QTD-ERROS`
  - `[low]` `[reject]` (blind) sello sin test de UI — mismo que el diferido
  - `[low]` `[patch]` (blind) flag mal configurado sin pista en el log — log con razón sin PII
  - `[false]` `[reject]` (blind) RG sin trim — semántica A15 del legado (D20); decisión de negocio pendiente
  - `[low]` `[reject]` (blind) TODO D20 sin seguimiento — registrado en la lista de decisiones de negocio del informe
  - `[low]` `[reject]` (blind) JSDoc "até 5 erros" — replica el arreglo `#MSG(5)` del legado
  - `[low]` `[reject]` (blind) `ERRO_INESPERADO` duplicado — mismo patrón de 1.1/2.1/2.2; cosmético
  - `[low]` `[reject]` (blind) firma de la acción con `_anterior` — patrón compartido; sin impacto
  - `[low]` `[reject]` (blind) `setPainel` tras `await` en la transición — el estado se aplica igual; cosmético
  - `[low]` `[reject]` (blind) test "não grava nada" cubre 2 tablas — la acción no importa db; suficiente
  - `[false]` `[reject]` (blind) diff sin el spec — el spec se revisa por separado (claims file)
  - `[low]` `[patch]` (blind) enlace del e2e sin scope — acotado a la navegación
  - `[false]` `[reject]` (edge) CPF parcial (≤8 dígitos) + flag on → prefijo 000 — igual al legado (N11 numérico)
  - `[false]` `[reject]` (edge) CPF de 1–10 dígitos rellenado — igual al legado (N11 numérico)
  - `[low]` `[reject]` (edge) RG con tabs/NBSP — improbable
  - `[low]` `[reject]` (edge) RG con caracteres astrales — improbable
  - `[false]` `[reject]` (intent) R2: grabar `documentosOk` — la historia no lo pide; VALDOCS no graba
  - `[low]` `[reject]` (intent) tope de 5 solo probado en helper — máximo real 2 (CPF, RG)
  - `[low]` `[reject]` (intent) RK 114–138 probadas sobre código compartido — son exactamente esas funciones (mismo algoritmo en los tres programas)
  - `[false]` `[reject]` (intent) D20 no está en el PRD — decisión documentada en el spec; va a la lista de negocio
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md` 289/289
  - `[false]` `[reject]` (intent) CPF repetido válido — VALDOCS no tiene la regla D4b
  - `[false]` `[reject]` (intent) sprint-status modificado fuera del diff — gestión del workflow

## Design Notes

- D20 (nuevo): `EXAMINE #RG FOR ' ' GIVING POSITION #RG-LEN` mide hasta el primer espacio del A15 relleno; se replica y se suma a la lista de decisiones de negocio.
- VALDOCS no tiene la regla de dígitos repetidos de VALBENEF (D4b): los CPF de dígitos repetidos (`11111111111`, etc.) satisfacen el módulo 11, así que VALDOCS los acepta; la matriz lo fija.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `npx playwright test` -- expected: todos en verde

## Auto Run Result

- **Resumen:** VALDOCS: `validarDocumentos` (CPF 0/mód. 11 sin regla de repetidos, RG con semántica A15 — D20 nuevo, documento especial D4 solo con flag), pantalla `/validacao/documentos`, sin grabar.
- **Archivos:** `src/domain/beneficiario/documentos.ts` (18 RK), `src/domain/cpf.ts` (comentarios RK), `src/app/validacao/documentos/**`, `navegacao.ts`, `playwright.config.ts` (flag fijado en false para e2e), tests.
- **Review:** 25 hallazgos — 2 patches (`low`: log de flag mal configurado, scope del e2e), 1 diferido (pantalla con flag activo), 22 rechazados (equivalencia confirmada en VALDOCS).
- **Follow-up review recomendado:** `false` — patches: high 0, medium 0, low 2.
- **Verificación:** lint 0; tests y e2e en verde (ver commit).
- **Pendiente de negocio:** D20 (longitud del RG hasta el primer espacio).
