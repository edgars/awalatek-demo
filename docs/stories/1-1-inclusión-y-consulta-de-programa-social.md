# Story 1.1: Inclusión y consulta de programa social

**Épica:** 1 — Programas sociales  
**Requisitos:** FR-PRG-01, FR-PRG-02, FR-PRG-03, FR-PRG-04 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/programas` lista programas (código, nombre, sigla, tipo, status, valor base) con búsqueda por código/nombre y paginación.
- [ ] `/programas/novo` incluye programa con los campos de FR-PRG-03; valida tipo ∈ {A,P,T}; código duplicado → "PROGRAMA JA CADASTRADO".
- [ ] Al grabar: `fatorK = 1.00 + fatorReajuste × 0.347215`, `vlrBaseIndividual = vlrBase × fatorK` (truncado a centavos), `sitPrograma = 'A'`; mensaje "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO:" + valor. Comentario `// LEGACY-QUIRK(D8)`.
- [ ] `/programas/[cod]` muestra la consulta de FR-PRG-01; código inexistente → "PROGRAMA NAO ENCONTRADO".
- [ ] En la pantalla del programa se editan los grupos `ProgramaFaixaCalculo` (máx. 5) y `ProgramaParamRegional` (máx. 6); el límite se valida en el dominio.
- [ ] No existen acciones de alterar/excluir el programa (fuera de equivalencia legada).
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (6)

| FR | RK | Fuente |
|---|---|---|
| FR-PRG-01 | RK-d20a15a018e6 | CADPROG:51 |
| FR-PRG-01 | RK-a1d8765eea49 | CADPROG:56 |
| FR-PRG-01 | RK-7ca3bec5e5f6 | CADPROG:117 |
| FR-PRG-02 | RK-1559882bffe4 | CADPROG:81 |
| FR-PRG-03 | RK-275e4a632e83 | CADPROG:87 |
| FR-PRG-03 | RK-bd6a7e52a48b | CADPROG:88 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
