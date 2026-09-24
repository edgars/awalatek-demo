# Story 4.1: Motor de cálculo y cálculo individual

**Épica:** 4 — Cálculo de beneficio y pagos  
**Requisitos:** FR-CAL-01, FR-CAL-02, FR-CAL-03, FR-CAL-04, FR-CAL-05, FR-CAL-06, FR-CAL-07, FR-CAL-08, FR-CAL-09, FR-CAL-10 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `src/domain/calculo/tabelas.ts` contiene las tablas fijas de factor regional (25 regiones) y tramos de renta (`// LEGACY-QUIRK(D1)`).
- [ ] `src/domain/calculo/motor.ts` expone `calcular({vlrBase, fatorReajuste, tipoPrograma, codRegiao, numDependentes, renda, dtNascimento, competencia, fatorRendaAnterior?})` → `{vlrBenf, vlr13, vlrAbono, vlrBruto, vlrDesc, vlrLiq, tipoPgto}` aplicando FR-CAL-03..10 con truncado en cada paso indicado.
- [ ] Renta > 9.999,99: factor de renta = `fatorRendaAnterior ?? 0` (`// LEGACY-QUIRK(D17)` + `TODO(review)`).
- [ ] `/calculo` recibe CPF + competencia; valida FR-CAL-01/02 con mensajes literales; graba `Pagamento` (status G, `numPagamento` = máx.+1) y muestra el resumen (13.º y abono en diciembre).
- [ ] `tests/regression/calculo.test.ts`: casos al centavo cubriendo cada factor, diciembre con programa A y no-A, descuento >500 y ≤500, líquido negativo→0 (NFR-03).
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (42)

| FR | RK | Fuente |
|---|---|---|
| FR-CAL-01 | RK-7116b6a5174c | CALCBENF:138 |
| FR-CAL-01 | RK-140d297f9d0c | CALCBENF:139 |
| FR-CAL-01 | RK-886f1116333c | CALCBENF:141 |
| FR-CAL-02 | RK-a88a2f157187 | CALCBENF:155 |
| FR-CAL-02 | RK-a116de8e94cf | CALCBENF:160 |
| FR-CAL-02 | RK-b030809a3f7c | CALCBENF:174 |
| FR-CAL-03 | RK-f8d9475ad104 | CALCBENF:180 |
| FR-CAL-04 | RK-2cced191e62e | CALCBENF:187 |
| FR-CAL-04 | RK-c0d4163cc4d1 | CALCBENF:190 |
| FR-CAL-04 | RK-3461de4d19c8 | CALCBENF:191 |
| FR-CAL-04 | RK-b13aff8bf789 | CALCBENF:193 |
| FR-CAL-04 | RK-5aae34cd08cf | CALCBENF:194 |
| FR-CAL-04 | RK-7e690c7a89ec | CALCBENF:196 |
| FR-CAL-05 | RK-f69f8dc0b6c9 | CALCBENF:306 |
| FR-CAL-06 | RK-999fc6833a38 | CALCBENF:205 |
| FR-CAL-06 | RK-7b2181c12f19 | CALCBENF:206 |
| FR-CAL-06 | RK-2f190186d76b | CALCBENF:207 |
| FR-CAL-06 | RK-511b65011b73 | CALCBENF:210 |
| FR-CAL-06 | RK-f036e04b0398 | CALCBENF:213 |
| FR-CAL-07 | RK-92d4dfd5101f | CALCBENF:225 |
| FR-CAL-07 | RK-4bef7758397d | CALCBENF:229 |
| FR-CAL-07 | RK-bb591a41dbf3 | CALCBENF:232 |
| FR-CAL-07 | RK-9ca5d0466ba9 | CALCBENF:233 |
| FR-CAL-08 | RK-be875b52514d | CALCBENF:242 |
| FR-CAL-08 | RK-3ac3d33b1b42 | CALCBENF:244 |
| FR-CAL-08 | RK-0f5eb2af85a0 | CALCBENF:246 |
| FR-CAL-08 | RK-f53c75ffb923 | CALCBENF:247 |
| FR-CAL-08 | RK-5add7ccbf625 | CALCBENF:248 |
| FR-CAL-08 | RK-f81e5c8b9a62 | CALCBENF:251 |
| FR-CAL-08 | RK-602168305a78 | CALCBENF:252 |
| FR-CAL-08 | RK-2aeddfcfa687 | CALCBENF:254 |
| FR-CAL-08 | RK-66a219e18a6a | CALCBENF:255 |
| FR-CAL-08 | RK-e8d3c677f5bc | CALCBENF:256 |
| FR-CAL-08 | RK-46191b29bce5 | CALCBENF:297 |
| FR-CAL-09 | RK-4bee01aa2d9d | CALCBENF:318 |
| FR-CAL-09 | RK-d190c0ee61bb | CALCBENF:319 |
| FR-CAL-09 | RK-f673b82833b9 | CALCBENF:320 |
| FR-CAL-09 | RK-65e0ed4d5b18 | CALCBENF:321 |
| FR-CAL-10 | RK-8d025b23228f | CALCBENF:266 |
| FR-CAL-10 | RK-45fca1f354da | CALCBENF:267 |
| FR-CAL-10 | RK-d8033ba178e5 | CALCBENF:272 |
| FR-CAL-10 | RK-c28ec6795433 | CALCBENF:273 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
