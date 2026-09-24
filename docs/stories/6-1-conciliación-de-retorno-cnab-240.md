# Story 6.1: Conciliación de retorno CNAB 240

**Épica:** 6 — Conciliación bancaria  
**Requisitos:** FR-CNB-01, FR-CNB-02, FR-CNB-03, FR-CNB-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/conciliacao` recibe competencia + upload del archivo de retorno (texto, líneas de 240 posiciones).
- [ ] `src/domain/cnab240.ts` extrae de los registros tipo 3 los campos por posición de FR-CNB-01 (valor ÷ 100); tests con líneas de ejemplo.
- [ ] Correspondencia por número de pago + CPF + competencia; no encontrado → mensaje literal y contador.
- [ ] Divergencia > 0,01 → mensaje + auditoría `DV`; sin divergencia → actualización de status por código 00/01/02 (P/D/E) + auditoría `CO`; código desconocido → mensaje.
- [ ] Todo registro procesado y su auditoría en la misma transacción; resumen final con los 5 contadores.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (9)

| FR | RK | Fuente |
|---|---|---|
| FR-CNB-01 | RK-7747831dca9a | BATCHCON:116 |
| FR-CNB-01 | RK-1121c69fbbdb | BATCHCON:132 |
| FR-CNB-02 | RK-3d6fe48b2bba | BATCHCON:140 |
| FR-CNB-02 | RK-31d94b6dc065 | BATCHCON:146 |
| FR-CNB-03 | RK-8649d421b7d9 | BATCHCON:155 |
| FR-CNB-03 | RK-25bb549502ed | BATCHCON:156 |
| FR-CNB-03 | RK-46ead0f200b6 | BATCHCON:157 |
| FR-CNB-03 | RK-8c11d37225a3 | BATCHCON:160 |
| FR-CNB-04 | RK-9af86fb5374c | BATCHCON:171 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
