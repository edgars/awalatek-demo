# Verificación de reglas RK contra RNC

- **Fecha:** 2026-09-24
- **Workspace:** `603f473c-d0aa-4d1a-bdb1-6e365371c787` (módulo `4cf7ed9e-0cf6-4b28-a604-a4264592a561`)
- **Método:** `getRule(workspaceId, RK-…)` para cada una de las 289 reglas (API MCP de RNC vía SSE); comparación de `ruleKey`, `sourceExcerpt` y línea de origen con el UIR usado para generar `docs/prd.md` y las historias.
- **Resultado:** 289/289 coinciden; 0 discrepancias.

| Programa | Reglas verificadas |
|---|---|
| BATCHCON | 9 |
| BATCHPGT | 45 |
| BATCHREL | 9 |
| CADBENEF | 23 |
| CADDEPEND | 9 |
| CADPROG | 6 |
| CALCBENF | 42 |
| CALCCORR | 14 |
| CALCDSCT | 23 |
| CONSBENF | 9 |
| RELAUDIT | 16 |
| RELPGT | 7 |
| VALBENEF | 30 |
| VALDOCS | 18 |
| VALELEG | 29 |

Satisface el criterio "Con el MCP de RNC conectado: `getRule` verificado para cada `RK-`" de todas las historias, mientras el UIR no cambie. Si RNC re-ingiere el fuente, repetir la verificación.
