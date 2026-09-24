# Story 0.2: Utilidades de dominio y auditoría

**Épica:** 0 — Fundación  
**Requisitos:** FR-BEN-03 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `src/domain/money.ts`: conversión centavos↔Decimal, `truncar()` (padrón mainframe ×100→entero→/100) y `redondear()` (+0,005 y truncar, D11); tests unitarios con casos límite.
- [ ] `src/domain/legacyDate.ts`: parse/format AAAAMMDD y AAAAMM, `hoje()` según `TZ`, `idadePorAno(dtNasc, anoRef)` = anoRef − dtNasc/10000; tests.
- [ ] `src/domain/cpf.ts`: `validaModulo11(cpf)` implementando FR-BEN-03 exactamente (pesos 10..2 y 11..2, resto<2→0); tests con CPFs válidos, inválidos y con ceros a la izquierda.
- [ ] `src/domain/quirks.ts`: lectura tipada de flags (`LEGACY_DOC_ESPECIAL_ENABLED`, default false).
- [ ] `src/server/auditoria.ts`: `registrarEvento({acao, tabela, chave, usuario, descricao, valorAnterior?, valorPosterior?})` con `numAuditoria` secuencial (máx.+1) y dt/hr del evento; sin funciones de update/delete.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (11)

| FR | RK | Fuente |
|---|---|---|
| FR-BEN-03 | RK-bc7d67f3dad4 | CADBENEF:113 |
| FR-BEN-03 | RK-99ffed6e1d57 | CADBENEF:237 |
| FR-BEN-03 | RK-ab368e4ef3e2 | CADBENEF:240 |
| FR-BEN-03 | RK-a04fb0c62d98 | CADBENEF:241 |
| FR-BEN-03 | RK-02b5279daf63 | CADBENEF:244 |
| FR-BEN-03 | RK-476620ed64ce | CADBENEF:247 |
| FR-BEN-03 | RK-98472f98558e | CADBENEF:256 |
| FR-BEN-03 | RK-d05375bd9555 | CADBENEF:259 |
| FR-BEN-03 | RK-8178f6bfb367 | CADBENEF:260 |
| FR-BEN-03 | RK-a4491331af7d | CADBENEF:263 |
| FR-BEN-03 | RK-9e739b6b003d | CADBENEF:266 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
