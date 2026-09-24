# Story 2.3: Validación de documentos

**Épica:** 2 — Beneficiarios  
**Requisitos:** FR-DOC-01, FR-DOC-02, FR-DOC-03 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] Pantalla `/validacao/documentos` con CPF, RG, título de elector y CTPS; resultado `V`/`I` y errores (máx. 5) con mensajes literales.
- [ ] CPF = 0 o módulo 11 inválido → "CPF INVALIDO"; RG vacío o < 5 caracteres → "RG INVALIDO OU FORMATO INCORRETO".
- [ ] Documento especial por prefijo (000, 001, 002, 010, 011, 099, 100, 999) **solo** si `LEGACY_DOC_ESPECIAL_ENABLED=true`: anula errores, resultado `V`, aviso "** DOCUMENTO ESPECIAL VALIDADO **" (`// LEGACY-QUIRK(D4)`). Con el flag en false el prefijo no tiene efecto; test para ambos casos.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (18)

| FR | RK | Fuente |
|---|---|---|
| FR-DOC-01 | RK-82c01a2ea13d | VALDOCS:69 |
| FR-DOC-01 | RK-55a63d755481 | VALDOCS:102 |
| FR-DOC-01 | RK-4187fc1c9b8e | VALDOCS:114 |
| FR-DOC-01 | RK-9d67b2c9881b | VALDOCS:117 |
| FR-DOC-01 | RK-1a2b8aca3fed | VALDOCS:118 |
| FR-DOC-01 | RK-533f71e705bc | VALDOCS:121 |
| FR-DOC-01 | RK-ca3109301dbc | VALDOCS:123 |
| FR-DOC-01 | RK-4cd00622ae5a | VALDOCS:131 |
| FR-DOC-01 | RK-bb14087b5111 | VALDOCS:134 |
| FR-DOC-01 | RK-e3ad9c603136 | VALDOCS:135 |
| FR-DOC-01 | RK-06b627574a45 | VALDOCS:138 |
| FR-DOC-01 | RK-08b9ede5ec74 | VALDOCS:140 |
| FR-DOC-02 | RK-b0821b60ecb6 | VALDOCS:79 |
| FR-DOC-02 | RK-2b0e2875eb48 | VALDOCS:148 |
| FR-DOC-02 | RK-f018750c00d0 | VALDOCS:155 |
| FR-DOC-02 | RK-cf4926ddfa8b | VALDOCS:160 |
| FR-DOC-03 | RK-5549fc642f21 | VALDOCS:95 |
| FR-DOC-03 | RK-4aa29d42f19a | VALDOCS:174 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
