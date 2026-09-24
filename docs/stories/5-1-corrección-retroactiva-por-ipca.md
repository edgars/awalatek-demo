# Story 5.1: Corrección retroactiva por IPCA

**Épica:** 5 — Corrección retroactiva  
**Requisitos:** FR-COR-01, FR-COR-02, FR-COR-03, FR-COR-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/correcao` recibe CPF + competencia inicial y final; inicial > final → "PERIODO INVALIDO - COMP INICIAL > FINAL".
- [ ] Tabla IPCA 2010–2012 en `tabelas.ts`; competencia fuera de la tabla → índice 1 (`// LEGACY-QUIRK(D9)`).
- [ ] Para cada pago del período no corregido: corregido = bruto × índice (truncar); solo si diferencia > 0 graba vlrCorrecao, dtCorrecao = hoy, indCorrigido = 'S'.
- [ ] Resumen "CORRECAO RETROATIVA FINALIZADA" con registros corregidos y valor total; re-ejecutar no vuelve a corregir (test).
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (14)

| FR | RK | Fuente |
|---|---|---|
| FR-COR-01 | RK-5416be5ab4a9 | CALCCORR:119 |
| FR-COR-01 | RK-fadeb6de594c | CALCCORR:129 |
| FR-COR-01 | RK-21f4cc982e48 | CALCCORR:133 |
| FR-COR-01 | RK-fa50ce8fa3e7 | CALCCORR:136 |
| FR-COR-02 | RK-d24d71f27db8 | CALCCORR:140 |
| FR-COR-03 | RK-d87bc4bc2bc4 | CALCCORR:180 |
| FR-COR-03 | RK-d7af59c5343d | CALCCORR:181 |
| FR-COR-03 | RK-012f5e03ef37 | CALCCORR:184 |
| FR-COR-03 | RK-2a52231a524c | CALCCORR:185 |
| FR-COR-04 | RK-7ac41f6abbe2 | CALCCORR:152 |
| FR-COR-04 | RK-26314a2e669a | CALCCORR:154 |
| FR-COR-04 | RK-ef8db09fc095 | CALCCORR:155 |
| FR-COR-04 | RK-146fee57d2a4 | CALCCORR:156 |
| FR-COR-04 | RK-b5eb9d994cd9 | CALCCORR:158 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
