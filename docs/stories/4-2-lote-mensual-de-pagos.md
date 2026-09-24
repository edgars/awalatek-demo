# Story 4.2: Lote mensual de pagos

**Épica:** 4 — Cálculo de beneficio y pagos  
**Requisitos:** FR-LOT-01, FR-LOT-02, FR-LOT-03, FR-LOT-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `src/server/lotePagamentos.ts` ejecuta el lote para la competencia = año/mes de la fecha de ejecución, recorriendo beneficiarios en orden de `numCpf`.
- [ ] Reglas de omisión de FR-LOT-02 (duplicado, status ≠ A, ya generado en la competencia, programa inactivo) y error registrado para programa inexistente, sin abortar.
- [ ] Usa **el mismo** `motor.calcular()` de la historia 4.1, pasando `fatorRendaAnterior` del beneficiario previo (D17).
- [ ] Transacción por beneficiario; `usrInclusao = 'BATCH'`; log de progreso cada 1.000 y resumen final (procesados, generados, ignorados, errores, totales).
- [ ] Disparo por `/lote` (con confirmación y muestra del resumen) y por `npm run lote:pagamentos` (`scripts/lote-pagamentos.ts`); re-ejecutar en la misma competencia no duplica pagos (test).
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (45)

| FR | RK | Fuente |
|---|---|---|
| FR-LOT-01 | RK-275ebe83e773 | BATCHPGT:108 |
| FR-LOT-01 | RK-af5872bb5b6c | BATCHPGT:109 |
| FR-LOT-01 | RK-8b46847de08b | BATCHPGT:110 |
| FR-LOT-02 | RK-7d3e373f4754 | BATCHPGT:188 |
| FR-LOT-02 | RK-bf3826b5e614 | BATCHPGT:195 |
| FR-LOT-02 | RK-644073d95848 | BATCHPGT:203 |
| FR-LOT-02 | RK-684b2581729a | BATCHPGT:207 |
| FR-LOT-02 | RK-7f911d03a299 | BATCHPGT:220 |
| FR-LOT-02 | RK-4f462c2048b7 | BATCHPGT:227 |
| FR-LOT-03 | RK-714fd6ddfb82 | BATCHPGT:236 |
| FR-LOT-03 | RK-540fc024b18c | BATCHPGT:237 |
| FR-LOT-03 | RK-0dd27e7579c4 | BATCHPGT:240 |
| FR-LOT-03 | RK-5ea515fab8f3 | BATCHPGT:247 |
| FR-LOT-03 | RK-f5d5302be54b | BATCHPGT:250 |
| FR-LOT-03 | RK-c22371bd5232 | BATCHPGT:251 |
| FR-LOT-03 | RK-214450c0f73f | BATCHPGT:253 |
| FR-LOT-03 | RK-c4f50dc3ca8a | BATCHPGT:254 |
| FR-LOT-03 | RK-536175a6629f | BATCHPGT:256 |
| FR-LOT-03 | RK-809cefb3e473 | BATCHPGT:265 |
| FR-LOT-03 | RK-b9c96b4d502e | BATCHPGT:268 |
| FR-LOT-03 | RK-783a0059ec74 | BATCHPGT:271 |
| FR-LOT-03 | RK-82624e7a43c9 | BATCHPGT:280 |
| FR-LOT-03 | RK-a807625f63e9 | BATCHPGT:282 |
| FR-LOT-03 | RK-4cab47bee5b1 | BATCHPGT:284 |
| FR-LOT-03 | RK-00a9411b5321 | BATCHPGT:285 |
| FR-LOT-03 | RK-d4c02c7ef1e7 | BATCHPGT:292 |
| FR-LOT-03 | RK-1838f13fae05 | BATCHPGT:294 |
| FR-LOT-03 | RK-7d6f8bc734b4 | BATCHPGT:295 |
| FR-LOT-03 | RK-7b2fc1482b07 | BATCHPGT:296 |
| FR-LOT-03 | RK-a049d00d5cfc | BATCHPGT:297 |
| FR-LOT-03 | RK-76c532772e71 | BATCHPGT:298 |
| FR-LOT-03 | RK-a202ec1224da | BATCHPGT:299 |
| FR-LOT-03 | RK-9ff58ea7fd88 | BATCHPGT:300 |
| FR-LOT-03 | RK-76a575ac73c7 | BATCHPGT:301 |
| FR-LOT-03 | RK-6f5f5f139ddf | BATCHPGT:302 |
| FR-LOT-03 | RK-75ff56906ba0 | BATCHPGT:308 |
| FR-LOT-03 | RK-1d328e485c60 | BATCHPGT:309 |
| FR-LOT-03 | RK-2dd8a96d00d2 | BATCHPGT:310 |
| FR-LOT-03 | RK-f56fad9e4ff6 | BATCHPGT:311 |
| FR-LOT-03 | RK-61c33b29d6a8 | BATCHPGT:315 |
| FR-LOT-03 | RK-b5749db3ea0e | BATCHPGT:316 |
| FR-LOT-03 | RK-8cbfbd730fa5 | BATCHPGT:319 |
| FR-LOT-03 | RK-273a402e3fcf | BATCHPGT:320 |
| FR-LOT-03 | RK-bf29157d9a87 | BATCHPGT:370 |
| FR-LOT-04 | RK-69bb52067a2a | BATCHPGT:345 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
