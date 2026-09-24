# Story 7.1: Informe analítico de pagos

**Épica:** 7 — Informes y auditoría  
**Requisitos:** FR-REL-01, FR-REL-02, FR-REL-03, FR-REL-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/relatorios/pagamentos` con competencia inicial/final y programa (0 = todos).
- [ ] Lista ordenada por competencia/programa con corte de control y subtotales por programa + total general.
- [ ] Descripciones de tipo y status de FR-REL-03; CPF enmascarado `***.XXX.XXX-XX`; nombre (30) y UF.
- [ ] Paginación en pantalla y vista imprimible equivalente a 66 líneas/página.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (7)

| FR | RK | Fuente |
|---|---|---|
| FR-REL-01 | RK-c1a8ff5dbe7b | RELPGT:83 |
| FR-REL-01 | RK-5a5f1426d63d | RELPGT:87 |
| FR-REL-02 | RK-7c5773e59cfe | RELPGT:93 |
| FR-REL-02 | RK-65a445d0bcfe | RELPGT:173 |
| FR-REL-03 | RK-b0f53e1b01b3 | RELPGT:116 |
| FR-REL-03 | RK-4fcb39638b68 | RELPGT:128 |
| FR-REL-04 | RK-e6e70b3b6737 | RELPGT:144 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
