---
title: 'Story 6.1 — Conciliación de retorno CNAB 240'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_revision: 'e6dbeb9'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred:
  - summary: Candado de conciliación entre procesos (fila de control en la base) en lugar de un flag en memoria.
    evidence: El candado vive en globalThis; réplicas standalone o CLI no lo ven.
  - summary: Identidad del operador y autorización en la conciliación disparada desde la web.
    evidence: Toda la auditoría se graba como `BATCH`; no hay control de acceso (auth fuera de alcance).
  - summary: Validación del header CNAB 240 (banco 001, archivo de retorno, competencia del archivo vs. la informada).
    evidence: Solo se validan extensión y tamaño; un archivo equivocado produce "NAO ENCONTRADO" o 0 conciliados sin error claro.
  - summary: Rendimiento con archivos cercanos al límite (~21k líneas): una transacción por registro dentro de una Server Action.
    evidence: Sin progreso visible ni protección de timeout de la solicitud.
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

### 2026-09-25 — Review pass
- verdicts: 38 findings — high 0, medium 2, low 18, false 18, maybe-false 0
- findings (resumen por grupo):
  - `[medium]` `[patch]` (blind/edge) upload decodificado como UTF-8 desplazaba posiciones fijas con bytes Latin-1 — `decodificarArquivo` Latin-1 con tests de acentos antes de las columnas 44/120/231
  - `[medium]` `[patch]` (blind) fecha de pago DDMMAAAA grabada sin conversión con fixtures inconsistentes — marcado `LEGACY-QUIRK(D23)` + `TODO(review)`; fixtures DDMMAAAA
  - `[low]` `[patch]` ×7 — resumen parcial ante error inesperado + revalidación, split CR/LF/CRLF con líneas vacías solo al final descartadas, límite de 5 MB en una sola constante con chequeo en cliente y e2e de ~2 MB (prueba `bodySizeLimit`), fieldset deshabilitado y foco en la confirmación, validación AAAAMMDD/HHMMSS del momento de auditoría, rótulo COMPETENCIA en el dominio + test de pago repetido en el archivo, `TODO(review)` de re-ejecución del mismo archivo
  - `[low]` `[defer]` ×4 — candado entre procesos, identidad del operador, validación del header CNAB, rendimiento con archivos grandes
  - `[low]` `[reject]` ×5 — mensajes literales con CPF completo en pantalla (NFR-04), limpieza de su propia auditoría en `e2e.db`, keys por índice, etc.
  - `[false]` `[reject]` ×18 — código desconocido cuenta como conciliado y audita CO (extracto BATCHCON), una transacción por registro (arquitectura §5), sin evidencia de `getRule` (`rk-verification.md`), etc.

## Verification

**Commands:**
- `npm run lint` · `npm test` · `npm run build` · `E2E_PORT=3230 npx playwright test` -- expected: todo en verde

## Auto Run Result

- **Resumen:** conciliación de retorno CNAB 240 (BATCHCON, 9 RK) en `/conciliacao`: parser por posiciones (Latin-1), correspondencia por nº/CPF/competencia, divergencia estricta > 0,01 con auditoría DV, actualización por código 00/01/02 con auditoría CO, una transacción por registro, momento de auditoría único por corrida (extensión de `registrarEvento`), candado en proceso, resumen literal y tablas con CPF enmascarado.
- **Implementado en paralelo** (worktree); integrado por merge (conflicto trivial en `navegacao.ts`).
- **Review:** 38 hallazgos — 9 patches (2 `medium`), 4 diferidos, 23 rechazados.
- **Follow-up review recomendado:** `true` — reconciliar dos veces el mismo archivo re-aplica y re-audita (como el legado); candado solo en proceso.
- **Verificación (tras merge):** lint 0; `npm test` 721/721; build OK; e2e 71/71 (×3).
- **Pendiente de negocio:** D23 — `dtPagamento` puede quedar en DDMMAAAA (formato del banco) mientras el resto del modelo usa AAAAMMDD.

