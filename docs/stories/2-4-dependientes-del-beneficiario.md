# Story 2.4: Dependientes del beneficiario

**Épica:** 2 — Beneficiarios  
**Requisitos:** FR-DEP-01, FR-DEP-02, FR-DEP-03, FR-DEP-04, FR-DEP-05 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/beneficiarios/[cpf]/dependentes` lista y agrega dependientes del titular (hijos PE `BeneficiarioDependente`).
- [ ] Titular inexistente → "BENEFICIARIO NAO ENCONTRADO"; titular con status C o D → "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO".
- [ ] Antes de cada inclusión: numDependentes > 5 → "LIMITE DE DEPENDENTES ATINGIDO" (`// LEGACY-QUIRK(D6)`).
- [ ] Nombre obligatorio y parentesco ∈ {FI, CO, IR, OU}; CPF de dependiente ≠ vacío no puede repetirse en el mismo titular ("DEPENDENTE JA CADASTRADO (CPF DUPLICADO)").
- [ ] Cada inclusión incrementa `numDependentes` del titular en la misma transacción y muestra "DEPENDENTE INCLUIDO - TOTAL:" n; la UI ofrece "Incluir otro dependiente".
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (9)

| FR | RK | Fuente |
|---|---|---|
| FR-DEP-01 | RK-6badeec05527 | CADDEPEND:51 |
| FR-DEP-01 | RK-7f25da1eeff3 | CADDEPEND:56 |
| FR-DEP-02 | RK-728f8d2bc779 | CADDEPEND:63 |
| FR-DEP-03 | RK-cf0d5200aad9 | CADDEPEND:79 |
| FR-DEP-03 | RK-bba959226637 | CADDEPEND:84 |
| FR-DEP-03 | RK-4dfeeb238cf7 | CADDEPEND:90 |
| FR-DEP-03 | RK-f8707d9be137 | CADDEPEND:105 |
| FR-DEP-04 | RK-d08414712f34 | CADDEPEND:97 |
| FR-DEP-05 | RK-db6fc93c9e4c | CADDEPEND:126 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
