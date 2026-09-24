# Story 2.1: Inclusión y alteración de beneficiario

**Épica:** 2 — Beneficiarios  
**Requisitos:** FR-BEN-01, FR-BEN-02, FR-BEN-04, FR-BEN-05 (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `/beneficiarios` lista (CPF enmascarado, nombre, programa, status, región) con búsqueda por CPF/nombre y paginación.
- [ ] `/beneficiarios/novo` (operación I) y `/beneficiarios/[cpf]/editar` (operación A) con los campos de la pantalla legada CADASTRO DE BENEFICIARIO.
- [ ] Validación en orden, cortando en el primer error y mostrando el mensaje literal: operación, CPF obligatorio, CPF módulo 11 (utilidad de 0.2), nombre, fecha de nacimiento, sexo, duplicado/no encontrado.
- [ ] En alteración solo son editables los campos listados en FR-BEN-01; CPF, nacimiento, sexo, programa, región y NIS se muestran de solo lectura y el servidor rechaza cambios.
- [ ] Status inicial `A` en inclusión; edad (año actual − año de nacimiento) > 75 → status `S` en inclusión **y** alteración, con `// LEGACY-QUIRK(D5)`.
- [ ] Inclusión graba dtCadastro = dtUltAlteracao = hoy; alteración actualiza dtUltAlteracao; `codPrograma` debe existir en ProgramaSocial.
- [ ] Cada regla de la tabla siguiente está implementada en `src/domain` con comentario `// RK-… (PROG:línea)` y cubierta por al menos un test.
- [ ] Con el MCP de RNC conectado: `getRule` verificado para cada `RK-` de la tabla (ver `bmad-context.md`).

## Reglas legadas (12)

| FR | RK | Fuente |
|---|---|---|
| FR-BEN-01 | RK-c83257ae5f85 | CADBENEF:99 |
| FR-BEN-01 | RK-7d4387e99f5a | CADBENEF:143 |
| FR-BEN-01 | RK-2f8766f52e1b | CADBENEF:149 |
| FR-BEN-01 | RK-07ac728d731a | CADBENEF:171 |
| FR-BEN-01 | RK-b89433734937 | CADBENEF:177 |
| FR-BEN-02 | RK-40623cadda7c | CADBENEF:105 |
| FR-BEN-02 | RK-e1aba7261a6b | CADBENEF:119 |
| FR-BEN-02 | RK-a14601290959 | CADBENEF:125 |
| FR-BEN-02 | RK-e17b444be69b | CADBENEF:131 |
| FR-BEN-04 | RK-e4b2970fefe6 | CADBENEF:162 |
| FR-BEN-05 | RK-46154d4f44a9 | CADBENEF:159 |
| FR-BEN-05 | RK-9ffc13028ce4 | CADBENEF:167 |

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
