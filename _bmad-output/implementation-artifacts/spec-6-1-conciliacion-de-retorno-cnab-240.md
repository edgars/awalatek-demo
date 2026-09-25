---
title: 'Story 6.1 — Conciliación de retorno CNAB 240'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** No existe la conciliación del retorno bancario CNAB 240 (BATCHCON): los pagos generados nunca pasan a pagado/devuelto/estornado ni se auditan.

**Approach:** Parser y decisión de conciliación puros en `src/domain/cnab240.ts` (9 RK), caso de uso `conciliarRetorno({ competencia, conteudo })` en `src/server/conciliacao.ts` con una transacción por registro (update + auditoría), expuesto en `/conciliacao` con upload.

## Boundaries & Constraints

**Always:**
- Seguir al pie de la letra el extracto de BATCHCON del `epic-6-context.md` (posiciones 1-based, `ESCAPE TOP` si tipo ≠ '3', valor ÷ 100 en centavos exactos, fecha grabada sin conversión con `TODO(review)`, umbral **estricto** `> 0,01`, mensajes literales con prefijos intactos, contadores).
- `REGISTROS LIDOS` cuenta **todas** las líneas (header/trailer incluidos), antes del filtro de tipo. Líneas vacías finales (salto de línea al final del archivo) no cuentan; líneas de largo ≠ 240 se procesan con `SUBSTR` sobre lo que haya (relleno con blancos), sin abortar.
- Correspondencia: `numPagamento` = nº documento (entero) **y** `numCpf` = CPF normalizado a 11 dígitos **y** `anoMesRef` = competencia; si no → "NAO ENCONTRADO: CPF=… DOC=…", contador, sin auditoría.
- Divergencia (`|vlrLiquido − valorBanco| > 1 centavo`): mensaje "DIVERGENCIA: CPF=… SIFAP=… BANCO=…", pago **no** actualizado, auditoría `DV` (valorAnterior = líquido SIFAP, valorPosterior = valor banco, desAcao "DIVERGENCIA VALOR SIFAP X BANCO").
- Sin divergencia → cuenta como conciliado (también con código desconocido): 00 → `sitPagamento` P + `dtPagamento` + `codBanco` "1" + `codRetornoBanco`; 01 → D + código; 02 → E + código; otro → "COD RETORNO DESCONHECIDO: …" sin update. Auditoría `CO` ("CONCILIADO COD RET=<cod>") en todos los casos, valores anterior/posterior `null` con `TODO(review)`.
- No tocar `dtConciliacao`, `sitConciliacao`, `vlrConciliado`.
- Auditoría: `usuario` `BATCH`, `tipoEntidade` `PAGAMENTO`, `idEntidade` = nº de pago. Extender `registrarEvento` con un momento opcional `{ data, hora }` (diferido E6) y pasar el momento tomado **una vez** al inicio de la corrida; el comportamiento sin momento no cambia (tests existentes verdes).
- Una transacción por registro (update + `registrarEvento(evento, tx)`); candado en memoria: segunda corrida simultánea → "Conciliação já em execução.".
- Formato numérico de SIFAP=/BANCO= y separación del `COMPRESS`: `TODO(review)`; usar valor con 2 decimales y punto (N9.2) sin ceros a la izquierda.
- Resumen: encabezado "BATCHCON - RESUMO CONCILIACAO" y las 5 etiquetas literales del contexto; listas de divergencias y no encontrados (CPF enmascarado en la UI con `mascaraCpfLista`; mensajes legados completos en el dominio). Sin registros tipo 3 → resumen con 0 conciliados + aviso "arquivo sem registros de detalhe".
- Pantalla (DESIGN, sección conciliación): Competência + upload `.ret`/`.txt` (límite 5 MB, validado con zod), confirmación en la página antes de ejecutar, `ResumoProcesso` + tablas Divergências / Não encontrados; try/catch; `falhaInesperada` solo `name`/`code`. En la barra lateral activar **solo** "Conciliação bancária".
- Cada una de las 9 RK con `// RK-<clave> (BATCHCON:<línea>)` en `src/domain` y test.

**Never:**
- Portar el bloque comentado del Banco Real (356). Auditar registros no encontrados o de otro tipo. Cambiar `sprint-status.yaml` o specs. Tocar motor, lote, descuentos o corrección.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Conciliado 00 | pago G, valor = líquido, cód. 00 | status P, fecha, banco 1, auditoría CO | No error expected |
| Devuelto 01 / Estornado 02 | cód. 01 / 02 | status D / E, sin fecha ni banco; CO | No error expected |
| Código desconocido | cód. 99 | sin update; mensaje; cuenta conciliado; CO | "COD RETORNO DESCONHECIDO: 99 …" |
| Divergente | líquido 100,00, banco 100,02 | sin update; DV con valores | "DIVERGENCIA: CPF=…" |
| Umbral exacto | diferencia 0,01 | concilia | No error expected |
| No encontrado | doc inexistente / CPF distinto / otra competencia | contador; sin auditoría | "NAO ENCONTRADO: CPF=… DOC=…" |
| Header/trailer | líneas tipo 0/1/5/9 | cuentan como leídas; ignoradas | No error expected |
| Sin detalle | solo header/trailer | 0 conciliados + aviso | No error expected |
| Momento único | 3 registros | los 3 eventos con la misma fecha/hora | No error expected |
| Concurrente | dos corridas simultáneas | la segunda devuelve "Conciliação já em execução." | No error expected |

</intent-contract>

## Code Map

- `_bmad-output/implementation-artifacts/epic-6-context.md` -- extracto BATCHCON completo (posiciones, decisión, auditoría, resumen).
- `src/server/auditoria.ts` (`registrarEvento`) -- extender con momento opcional; `src/domain/legacyDate.ts` (`hoje`), `src/domain/money.ts`, `src/domain/cpf.ts` (`normalizaCpfNumerico`, `mascaraCpfLista`).
- `src/server/lotePagamentos.ts` o `src/server/calculo.ts` -- patrón de caso de uso con candado/transacción (el lote puede no estar en main aún: usar `calculo.ts`).
- `src/components/campos/{ResumoProcesso,Competencia}.tsx`, `src/app/calculo/**` -- patrón de pantalla de proceso.
- `src/components/layout/navegacao.ts` -- ítem "Conciliação bancária".
- **Paralelo:** corre en worktree con 7.1 y 7.2. Usar `E2E_PORT=3230`. En e2e crear pagos propios con Prisma (números 96101+ y competencia 199201, exclusivos) y limpiar por `numPagamento`; aserciones de auditoría acotadas a esos `idEntidade`.

## Tasks & Acceptance

**Execution:**
- `src/domain/cnab240.ts` (+ test) -- `parseLinhaCnab`, `decidirConciliacao`, mensajes, resumen; 9 RK.
- `src/server/auditoria.ts` (+ test) -- momento opcional.
- `src/server/conciliacao.ts` (+ `tests/conciliacao.test.ts`) -- `conciliarRetorno` con candado.
- `src/app/conciliacao/page.tsx`, `actions.ts`, `_componentes/*` -- pantalla.
- `navegacao.ts` -- solo su ítem.
- `tests/e2e/conciliacao.spec.ts` -- upload con conciliado + divergente + no encontrado, resumen y tablas.

**Acceptance Criteria:**
- Given `npm run lint && npm test && npm run build && E2E_PORT=3230 npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3230 npx playwright test` -- expected: todo en verde
