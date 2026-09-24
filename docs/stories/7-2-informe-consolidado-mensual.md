# Story 7.2: Informe consolidado mensual

**Épica:** 7 — Informes y auditoría  
**Requisitos:** FR-REL-05, FR-REL-06, FR-REL-07, FR-REL-08 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/relatorios/consolidado` con competencia; totales por región, por status y generales.
- [ ] Agrupación por región según FR-REL-06 (`// LEGACY-QUIRK(D10)`).
- [ ] Bruto redondeado con `money.redondear()` antes de sumar (`// LEGACY-QUIRK(D11)`); descuento y líquido sin redondeo.
- [ ] Status desconocido cuenta como GERADO.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (9)

| FR | RK | Fuente |
|---|---|---|
| FR-REL-05 | RK-4aadc8392e9b | BATCHREL:106 |
| FR-REL-06 | RK-d8b1ac2e14eb | BATCHREL:117 |
| FR-REL-06 | RK-0cdc90e2bd81 | BATCHREL:120 |
| FR-REL-06 | RK-8b828d08f033 | BATCHREL:123 |
| FR-REL-06 | RK-893670f64c20 | BATCHREL:126 |
| FR-REL-07 | RK-35bd4d675058 | BATCHREL:137 |
| FR-REL-07 | RK-aeeeeeec3fcd | BATCHREL:138 |
| FR-REL-07 | RK-1a7fe69dd6d1 | BATCHREL:139 |
| FR-REL-08 | RK-95081b4796b9 | BATCHREL:146 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
