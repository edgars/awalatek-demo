---
title: 'Story 2.1 — Inclusión y alteración de beneficiario'
type: 'feature'
created: '2026-09-24'
status: 'draft'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** No se pueden registrar ni alterar beneficiarios (CADBENEF), base de dependientes, elegibilidad, cálculo y pagos.

**Approach:** Entregar `/beneficiarios` (lista), `/beneficiarios/novo` (operación I) y `/beneficiarios/[cpf]/editar` (operación A) con la validación secuencial de CADBENEF en `src/domain/beneficiario/cadastro.ts`, casos de uso en `src/server/beneficiarios.ts` y los componentes `CpfInput`/`NisInput`, reutilizando el kit y patrones de la historia 1.1.

## Boundaries & Constraints

**Always:**
- Orden de validación de CADBENEF, cortando en el primer error y mostrando un solo mensaje literal: operación ∉ {I,A} → "OPERACAO INVALIDA - INFORME I OU A" (RK-c83257ae5f85, :99); CPF vacío/0 → "CPF OBRIGATORIO" (RK-40623cadda7c, :105); módulo 11 inválido → "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO" (reusar `validaModulo11`/`MSG_CPF_INVALIDO`); nombre vacío → "NOME OBRIGATORIO" (RK-e1aba7261a6b, :119); nacimiento 0 → "DATA NASCIMENTO OBRIGATORIA" (RK-a14601290959, :125); sexo ∉ {M,F} → "SEXO INVALIDO" (RK-e17b444be69b, :131); I con CPF existente → "BENEFICIARIO JA CADASTRADO" (RK-7d4387e99f5a, :143); A con CPF inexistente → "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO" (RK-2f8766f52e1b, :149); con error no se graba (RK-07ac728d731a, :171); rama I/A (RK-b89433734937, :177).
- Inclusión: status `A` (RK-e4b2970fefe6, :162); `dtCadastro = dtUltAlteracao = hoje().data`; mensaje "BENEFICIARIO INCLUIDO COM SUCESSO".
- Edad = año actual − año de nacimiento (`idadePorAno`, RK-46154d4f44a9, :159); edad > 75 → status `S` en inclusión **y** alteración (RK-9ffc13028ce4, :167) con `// LEGACY-QUIRK(D5)`.
- Alteración cambia solo: nombre, logradouro, municipio, UF, CEP, telefone fijo, RG, status, renta familiar, n.º dependientes, `dtUltAlteracao`; CPF, nacimiento, sexo, programa, región y NIS de solo lectura y el servidor rechaza cambios en ellos; mensaje "BENEFICIARIO ALTERADO COM SUCESSO". Control optimista con `numVersao` (incremento en cada alteración; versión desactualizada → error y no se graba).
- `codPrograma` debe existir en `ProgramaSocial`; `nis`/`cpfDependente`-style vacíos se guardan como `NULL` (deferred de 0.1); NIS duplicado → mensaje de error sin grabar.
- Cada regla con `// RK-<clave> (CADBENEF:<línea>)` y test; zod en las Server Actions; UI pt-BR con `CpfInput` (máscara `000.000.000-00` → string 11 dígitos), `NisInput`, `DataLegada`, `Moeda`, `Select` de UF/programas.

**Never:**
- Replicar el borrado de status en la alteración del legado (D18, ver Design Notes).
- Validaciones de VALBENEF/VALDOCS (historias 2.2/2.3), dependientes (2.4), auditoría (CADBENEF no audita).
- Borrar beneficiarios.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inclusión válida | CPF válido nuevo, nombre, nac. 19850412, sexo F, programa existente | grabado con status A, dtCadastro = hoy | "BENEFICIARIO INCLUIDO COM SUCESSO" |
| Primer error gana | CPF vacío y nombre vacío | nada grabado | solo "CPF OBRIGATORIO" |
| CPF DV inválido | `01234567891` | nada grabado | "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO" |
| Sexo inválido | sexo `X` | nada grabado | "SEXO INVALIDO" |
| Duplicado | inclusión con CPF del seed | nada grabado | "BENEFICIARIO JA CADASTRADO" |
| Alteración inexistente | A con CPF válido no registrado | nada grabado | "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO" |
| Mayor de 75 | inclusión nac. 19400101 (año actual 2026) | status `S` | "BENEFICIARIO INCLUIDO COM SUCESSO" |
| Alteración mayor de 75 | alterar beneficiario de 80 años con status A | status queda `S` | "BENEFICIARIO ALTERADO COM SUCESSO" |
| Campo inmutable | alteración enviando otro `dtNascimento` | nada grabado | error de campo no editable |
| Versión desactualizada | alteración con `numVersao` viejo | nada grabado | error de concurrencia |
| NIS vacío | inclusión sin NIS | `nis = NULL`; dos beneficiarios sin NIS conviven | No error expected |
| Búsqueda | `/beneficiarios?q=silva` | coincidencias por CPF o nombre, paginadas | No error expected |

</intent-contract>

## Code Map

- `src/domain/cpf.ts` -- `validaModulo11`, `MSG_CPF_INVALIDO` (reusar; agregar aquí `mascaraCpfLista` = `***.***.XXX-XX` para la lista, sin RK).
- `src/domain/legacyDate.ts` -- `idadePorAno`, `hoje`, `dataParaInt`.
- `src/domain/money.ts` -- `aCentavos`/`deCentavos` para renta.
- `src/domain/programa.ts`, `src/server/programas.ts` -- patrón de dominio + casos de uso + Server Actions de la historia 1.1 (completar con rutas exactas tras cerrar 1.1).
- `src/components/ui/*`, `src/components/campos/*` -- kit de 1.1 (`Moeda`, `DataLegada`, `Codigo`, `ResultadoLegado`, `TabelaPaginada`); agregar `CpfInput`, `NisInput`.
- `prisma/schema.prisma` modelo `Beneficiario` -- sin cambios de esquema.
- `tests/e2e/*` + `playwright.config.ts` -- base e2e dedicada de 1.1.

## Tasks & Acceptance

**Execution:**
- `src/domain/beneficiario/cadastro.ts` (+ test) -- mensajes, `validarCadastro(op, dados, existe)` secuencial, `statusResultante(op, dtNasc, anoAtual, statusInformado)`, campos editables en alteración.
- `src/server/beneficiarios.ts` (+ `tests/beneficiarios.test.ts`) -- `listarBeneficiarios({q,pagina})`, `incluirBeneficiario`, `alterarBeneficiario` (versión optimista, inmutables, NIS vacío → NULL).
- `src/components/campos/CpfInput.tsx`, `NisInput.tsx` -- componentes de DESIGN §3.
- `src/app/beneficiarios/page.tsx`, `novo/page.tsx`, `[cpf]/editar/page.tsx`, `actions.ts` -- pantallas 4.4/4.5; enlace en la barra lateral.
- `tests/e2e/beneficiarios.spec.ts` -- incluir, error de primer campo, alterar con status S por edad.

**Acceptance Criteria:**
- Given la lista, when se muestra, then el CPF aparece enmascarado y no hay acción de excluir.
- Given `npm run lint && npm test && npm run build && npx playwright test`, when se ejecutan, then todo en verde.

## Spec Change Log

## Review Triage Log

## Design Notes

- **D18 (desvío documentado):** en CADBENEF la pantalla no tiene STATUS; en la alteración `#STATUS` queda en blanco y se graba `' '` salvo edad > 75. El PRD aprobado (FR-BEN-01, DESIGN 4.5) define status editable en la alteración; se sigue el PRD (select prellenado con el status actual) y se marca `// D18: el legado grababa status en blanco en la alteración — decisión PRD FR-BEN-01; confirmar con negocio`.
- Legacy: `COD-REGIAO` N2, `CEP` N8, `COD-PROGRAMA` N4, `RENDA-FAMILIAR` N9.2 → entradas numéricas acotadas; UF no se valida en CADBENEF (la valida VALBENEF, 2.2).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `npx playwright test` -- expected: todos los e2e en verde
