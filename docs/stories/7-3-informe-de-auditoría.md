# Story 7.3: Informe de auditoría

**Épica:** 7 — Informes y auditoría  
**Requisitos:** FR-AUD-01, FR-AUD-02, FR-AUD-03, FR-AUD-04, FR-AUD-05, FR-AUD-06, FR-AUD-07 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/relatorios/auditoria` con fecha inicial/final (defaults 19970101 / hoy), acción, usuario, tabla y salida T/I (default T).
- [ ] Eventos `EX` nunca se muestran (cuentan como filtrados); filtros opcionales por igualdad.
- [ ] Salida T: fecha, hora HH:MM:SS, usuario, acción (descripción), tabla, clave; salida I agrega descripción; paginación de 66 líneas.
- [ ] Resumen: total, exhibidos, filtrados y conteo por acción (IN/AL/CO/CN/DV/otras).
- [ ] No existe pantalla ni API para crear/editar/borrar auditoría (FR-AUD-07).
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (16)

| FR | RK | Fuente |
|---|---|---|
| FR-AUD-01 | RK-b4fe11eb2c22 | RELAUDIT:80 |
| FR-AUD-01 | RK-d99bee200be3 | RELAUDIT:84 |
| FR-AUD-01 | RK-819d962f567a | RELAUDIT:87 |
| FR-AUD-02 | RK-713713b19064 | RELAUDIT:93 |
| FR-AUD-02 | RK-aae01121639f | RELAUDIT:96 |
| FR-AUD-03 | RK-2e5c9f06f325 | RELAUDIT:105 |
| FR-AUD-04 | RK-b3ac1f6f4ede | RELAUDIT:111 |
| FR-AUD-04 | RK-be935d51d847 | RELAUDIT:112 |
| FR-AUD-04 | RK-78771795cd8b | RELAUDIT:119 |
| FR-AUD-04 | RK-bea2ff075a6c | RELAUDIT:120 |
| FR-AUD-04 | RK-60326023cab9 | RELAUDIT:127 |
| FR-AUD-04 | RK-7f232f1dd913 | RELAUDIT:128 |
| FR-AUD-05 | RK-6a74a1f56dab | RELAUDIT:137 |
| FR-AUD-06 | RK-9ec291e3f4e5 | RELAUDIT:164 |
| FR-AUD-06 | RK-4e229cab081e | RELAUDIT:169 |
| FR-AUD-06 | RK-7083ebf609a1 | RELAUDIT:210 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
