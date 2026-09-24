# Story 4.3: Recálculo de descuentos de un pago

**Épica:** 4 — Cálculo de beneficio y pagos  
**Requisitos:** FR-DSC-01, FR-DSC-02, FR-DSC-03, FR-DSC-04, FR-DSC-05, FR-DSC-06 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/descontos` recibe CPF + número de pago; precondiciones de FR-DSC-01 con mensajes literales.
- [ ] `src/domain/calculo/descontos.ts`: contribución social progresiva + descuentos vigentes del beneficiario por tipo (J/P/A/I/S) + tope 30 % aplicado dentro del loop tras cada no judicial (`// LEGACY-QUIRK(D2)`).
- [ ] Graba `vlrDescontoTotal` truncado en el pago y una fila `PagamentoDesconto` por descuento procesado; **no** recalcula `vlrLiquido` (`// LEGACY-QUIRK(D13)`).
- [ ] Muestra "DESCONTOS CALCULADOS" con bruto, descuento y tope 30 %.
- [ ] Tests de regresión: solo contribución; judicial + no judicial que dispara el tope; descuento fuera de vigencia; tipo desconocido ignorado.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (23)

| FR | RK | Fuente |
|---|---|---|
| FR-DSC-01 | RK-314dbfb4a26e | CALCDSCT:75 |
| FR-DSC-01 | RK-8b1376b9c23d | CALCDSCT:82 |
| FR-DSC-01 | RK-0a477ffc9ddc | CALCDSCT:91 |
| FR-DSC-02 | RK-83b28551c287 | CALCDSCT:195 |
| FR-DSC-02 | RK-70cdacb35c1a | CALCDSCT:196 |
| FR-DSC-03 | RK-746a7b5738cf | CALCDSCT:102 |
| FR-DSC-03 | RK-3cde6c2d52e2 | CALCDSCT:104 |
| FR-DSC-03 | RK-636a3924f593 | CALCDSCT:105 |
| FR-DSC-03 | RK-07b224be3337 | CALCDSCT:165 |
| FR-DSC-03 | RK-f27df0e84c50 | CALCDSCT:166 |
| FR-DSC-04 | RK-e3256815c49a | CALCDSCT:112 |
| FR-DSC-04 | RK-873a78f8fdfb | CALCDSCT:116 |
| FR-DSC-05 | RK-5d6c495417bb | CALCDSCT:122 |
| FR-DSC-05 | RK-5ebca43330fa | CALCDSCT:125 |
| FR-DSC-05 | RK-7ae0930278f4 | CALCDSCT:128 |
| FR-DSC-05 | RK-813b10f0a6b2 | CALCDSCT:135 |
| FR-DSC-05 | RK-eb8f0ba106d7 | CALCDSCT:138 |
| FR-DSC-05 | RK-88bafd73a684 | CALCDSCT:144 |
| FR-DSC-05 | RK-a6687439e293 | CALCDSCT:149 |
| FR-DSC-05 | RK-43bd100339a0 | CALCDSCT:153 |
| FR-DSC-05 | RK-62ff9a96f5f9 | CALCDSCT:156 |
| FR-DSC-06 | RK-ed72fdc907a3 | CALCDSCT:175 |
| FR-DSC-06 | RK-462a16645319 | CALCDSCT:176 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
