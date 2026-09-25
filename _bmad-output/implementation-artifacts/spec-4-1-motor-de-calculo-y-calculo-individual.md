---
title: 'Story 4.1 — Cálculo individual de beneficio'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: '5a787f9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: >-
      usuarioOperativo() duplicado en programas, beneficiarios, calculo (y variante en auditoria).
    evidence: |-
      Cuatro copias de la misma lógica (SIFAP_USER cortado a 8); una divergencia haría que distintas pantallas graben usuarios distintos. Extraer a src/server/usuario.ts tras integrar la ola paralela.
    location: >-
      src/server/*.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** El motor de cálculo (tablas, factores, 13.º, abono, descuento simplificado, líquido) ya existe en `src/domain/calculo/motor.ts`, pero no hay forma de calcular el beneficio de un beneficiario para una competencia ni de grabar el pago (CALCBENF).

**Approach:** Entregar `/calculo` (CPF + competencia) con las precondiciones FR-CAL-01/02 en el dominio y un caso de uso `calcularBeneficioIndividual` en `src/server/calculo.ts` que lee beneficiario + programa, invoca `calcular()` y graba el `Pagamento`.

## Boundaries & Constraints

**Always:**
- Competencia AAAAMM (`Competencia` → Int); mes fuera de 1–12 → "COMPETENCIA INVALIDA" (usar `validarCompetencia`/`MSG_COMPETENCIA_INVALIDA` del motor).
- Precondiciones FR-CAL-02, en el dominio (`src/domain/calculo/precondicoes.ts`) con RK: beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO" (RK-a88a2f157187, CALCBENF:155); status ≠ A → "BENEFICIARIO NAO ATIVO - STATUS:" + status (RK-a116de8e94cf, :160); programa inexistente → "PROGRAMA NAO ENCONTRADO" (RK-b030809a3f7c, :174). Orden: competencia → beneficiario → status → programa.
- Llamar `calcular()` con `vlrBase = programa.vlrBaseIndividual`, `fatorReajuste`, `tipoPrograma`, `codRegiao`, `numDependentes`, `renda = vlrRendaFamiliar`, `dtNascimento`, `competencia`, **sin** `fatorRendaAnterior` (D17: individual → factor 0 si renta > 9.999,99).
- Grabar `Pagamento` en una transacción: `numPagamento` = máx.+1 (el legado no numera en CALCBENF; el esquema exige número único), `numCpf`, `codPrograma`, `anoMesRef`, `vlrBruto`, `vlrDescontoTotal` (= `vlrDesc`), `vlrLiquido`, `vlrAbono`, `tipoPgto`, `sitPagamento = 'G'`, `dtGeracao`/`hrGeracao` = `hoje()`, `usrInclusao` = `SIFAP_USER` (8). Sin verificar pago previo de la misma competencia ni status del programa (el legado no lo hace — documentar `// LEGACY-QUIRK`/comentario con fuente).
- Resultado (DESIGN 4.12, `ResumoProcesso` nuevo en `src/components/campos/`): "CALCULO REALIZADO COM SUCESSO" + CPF (enmascarado con `mascaraCpfLista`), competencia, bruto, desconto, líquido, tipo; en diciembre además VLR 13.º y abono (RK-46191b29bce5, CALCBENF:297); enlace al número de pago.
- Enlace "Cálculo de benefício" activo en la barra lateral (`navegacao.ts`).
- zod en la acción; try/catch en la transición; `falhaInesperada` solo con `name`/`code`.

**Never:**
- Modificar `motor.ts`/`tabelas.ts`/`descontos.ts` salvo bug demostrado por test.
- Auditar (CALCBENF no audita); lote (4.2); recálculo de descuentos (4.3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal | beneficiario A del seed, competencia 202609 | pago grabado `G`, tipo `N`, valores iguales a `calcular()` | "CALCULO REALIZADO COM SUCESSO" |
| Diciembre | mismo, 202612, programa tipo A | tipo `D`, 13.º y abono > 0 mostrados | No error expected |
| Competencia inválida | 202613 | nada grabado | "COMPETENCIA INVALIDA" |
| Inexistente | CPF no registrado | nada | "BENEFICIARIO NAO ENCONTRADO" |
| No activo | beneficiario S del seed | nada | "BENEFICIARIO NAO ATIVO - STATUS: S" |
| Numeración | dos cálculos seguidos | `numPagamento` n y n+1 | No error expected |
| Misma competencia ×2 | calcular dos veces 202609 | dos pagos (el legado no lo impide) | No error expected |

</intent-contract>

## Code Map

- `src/domain/calculo/motor.ts` -- `calcular(e: EntradaCalculo): ResultadoCalculo` (centavos enteros; factores string; `tipoPgto` "N"|"D"; lanza `COMPETENCIA INVALIDA`), `validarCompetencia`, `MSG_COMPETENCIA_INVALIDA`; comentarios RK de FR-CAL-01/03..10 ya presentes.
- `src/domain/calculo/rastreabilidade.test.ts` -- test de citas RK (agregar las 3 de FR-CAL-02 y :297 si corresponde).
- `src/server/beneficiarios.ts`, `src/server/programas.ts` -- lectura de beneficiario/programa, `usuarioOperativo`.
- `src/domain/cpf.ts` (`mascaraCpfLista`), `src/domain/money.ts` (`formatarReais`), `src/domain/legacyDate.ts` (`hoje`, `competenciaParaInt`).
- `src/components/campos/*` + `src/app/validacao/cadastro/**` -- patrón de pantalla de proceso (entrada → acción → panel).
- `src/components/layout/navegacao.ts` -- activar `/calculo`.
- **Paralelo:** corre en worktree junto con 2.4 y 2.5. Usar `E2E_PORT=3223`.

## Tasks & Acceptance

**Execution:**
- `src/domain/calculo/precondicoes.ts` (+ test) -- 3 RK de FR-CAL-02.
- `src/server/calculo.ts` (+ `tests/calculo-individual.test.ts`) -- `calcularBeneficioIndividual(cpf, competencia)` transaccional; valores iguales a `calcular()`.
- `src/components/campos/Competencia.tsx`, `ResumoProcesso.tsx` (+ export) -- DESIGN §3.
- `src/app/calculo/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla 4.12.
- `src/components/layout/navegacao.ts` -- enlace activo.
- `tests/e2e/calculo.spec.ts` -- cálculo normal y diciembre; mensaje de no activo.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3223 npx playwright test`, when se ejecutan, then todo en verde (incluida la regresión existente `tests/regression/calculo.test.ts`).

## Spec Change Log

## Review Triage Log

### 2026-09-25 — Review pass
- verdicts: 30 findings — high 0, medium 5, low 17, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) enlace a `/pagamentos/[num]` inexistente — lo implementa la historia 4.4 de la misma ola; se integra antes del cierre de la épica
  - `[false]` `[reject]` (blind) 13.º mostrado pero no grabado — CALCBENF tampoco lo graba (solo VLR-ABONO); el esquema replica el legado
  - `[medium]` `[patch]` (blind) `SIFAP_USER` ausente oculta los mensajes de dominio — el usuario se resuelve solo al grabar
  - `[low]` `[defer]` (blind) `usuarioOperativo` triplicado — refactor transversal a ramas paralelas; se hace tras integrar la ola
  - `[medium]` `[patch]` (blind) reintento P2002 sin test — tests de 1 fallo y de 3 fallos
  - `[low]` `[patch]` (blind) errores de zod no llegan a los campos — campo devuelto en el estado
  - `[low]` `[reject]` (blind) `FormCalculo` no usa `useAcaoFormulario` / `ERRO_INESPERADO` duplicado — patrón de pantalla de proceso de 2.2/2.3
  - `[low]` `[reject]` (blind) `competenciaTexto` duplica lógica — cosmético
  - `[low]` `[patch]` (blind) import duplicado en `conversao.test.ts` — unificado
  - `[low]` `[reject]` (blind) RK-46191b29bce5 no registrada en el test de trazabilidad — ya citada y verificada en `motor.ts`
  - `[false]` `[reject]` (blind) etiqueta "Cálculo individual" vs spec — es la etiqueta del mapa de EXPERIENCE §1
  - `[low]` `[reject]` (blind) resultado anterior visible durante el nuevo cálculo — cosmético
  - `[low]` `[reject]` (blind) chequeo de formato de CPF duplicado con mensajes distintos — la acción valida con zod; el servidor es defensa
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md` 289/289
  - `[false]` `[reject]` (intent) "PROGRAMA NAO ENCONTRADO" inalcanzable por FK — regla preservada en el dominio con test
  - `[low]` `[reject]` (intent) casos de error solo en capas inferiores — cubiertos en servidor/acción
  - `[false]` `[reject]` (intent) LEGACY-QUIRK sin ID en duplicados — comentario con fuente CALCBENF; comportamiento documentado en el contexto de la épica
  - `[false]` `[reject]` (intent) vlr13 no persistido — ver arriba
  - `[medium]` `[patch]` (verif) descuento/líquido nunca probados con descuento ≠ 0 — caso con bruto > 500,00
  - `[medium]` `[patch]` (verif) reintento de numeración sin test — mismo patch
  - `[medium]` `[patch]` (verif) camino de error inesperado de la acción sin test — caso con `SIFAP_USER` vacío
  - `[low]` `[reject]` (verif) enlace 404 — ver arriba
  - `[low]` `[reject]` (edge) enlace 404 — ver arriba
  - `[medium]` `[patch]` (edge) usuario antes de precondiciones — mismo patch
  - `[low]` `[reject]` (edge) SQLITE_BUSY no reintentado — SQLite serializa escritores; diferido de concurrencia entre procesos ya registrado en 0.2
  - `[false]` `[reject]` (edge) vlr13 sin columna — ver arriba
  - `[low]` `[reject]` (edge) año < 1000 en el selector de mes — inalcanzable desde el selector
  - `[low]` `[patch]` (edge) variables de entorno del test sin restaurar — `vi.stubEnv` + unstub y reset del singleton
  - `[false]` `[reject]` (intent) etiqueta del menú — ver arriba
  - `[low]` `[reject]` (intent) trazabilidad por presencia de comentario — reglas con tests de comportamiento en el dominio

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3223 npx playwright test` -- expected: todos en verde

## Auto Run Result

- **Resumen:** cálculo individual (CALCBENF) en `/calculo`: precondiciones FR-CAL-01/02 en el dominio (3 RK), caso de uso transaccional que invoca el motor existente y graba `Pagamento` (G, `numPagamento` máx.+1 con reintento en P2002), resumen con 13.º/abono en diciembre; componentes `Competencia` y `ResumoProcesso`.
- **Implementado en paralelo** (worktree, ola A); integrado en `main` por merge.
- **Review:** 30 hallazgos — 7 patches (3 `medium`: usuario antes de precondiciones, tests con descuento ≠ 0 y de reintento/error inesperado; 4 `low`), 1 diferido (`usuarioOperativo` duplicado), 22 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 3, low 4. Riesgo: enlace al detalle del pago depende de la historia 4.4.
- **Verificación (tras merge):** lint 0; `npm test` 360/360; build OK; e2e 19/19.
