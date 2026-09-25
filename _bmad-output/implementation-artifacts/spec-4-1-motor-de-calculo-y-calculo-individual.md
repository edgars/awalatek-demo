---
title: 'Story 4.1 — Cálculo individual de beneficio'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
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

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `E2E_PORT=3223 npx playwright test` -- expected: todos en verde
