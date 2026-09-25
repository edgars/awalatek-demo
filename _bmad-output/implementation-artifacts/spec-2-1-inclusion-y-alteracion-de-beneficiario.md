---
title: 'Story 2.1 — Inclusión y alteración de beneficiario'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: 'bb77a9ac3e5c8ea87f90cba57cfbd01dcb212fef'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/bmad-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      La ruta de edición usa el CPF completo (/beneficiarios/[cpf]/editar), que queda en HTML, historial del navegador y logs de acceso.
    evidence: |-
      Ruta definida por la historia y la arquitectura §6; la lista enmascara el CPF pero el enlace lo contiene sin máscara. Evaluar clave opaca (id) con negocio/LGPD.
    location: >-
      src/app/beneficiarios/page.tsx
    severity: medium
  - summary: >-
      Rama P2002 de incluirBeneficiario (inclusión concurrente) sin test.
    evidence: |-
      Los tests de duplicado se detienen en el pre-check; la rama catch que distingue CPF duplicado de NIS duplicado solo se alcanza con una carrera y requiere un db simulado.
    location: >-
      src/server/beneficiarios.ts
    severity: medium
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

- `src/domain/cpf.ts` -- `validaModulo11`, `MSG_CPF_INVALIDO` (reusar; agregar aquí `mascaraCpfLista` = `***.***.XXX-XX`, sin RK).
- `src/domain/legacyDate.ts` -- `idadePorAno`, `hoje`, `dataParaInt`, `intParaData`.
- `src/domain/money.ts` -- `aCentavos`/`deCentavos`/`formatarReais` para renta.
- `src/domain/programa.ts` -- patrón de referencia: mensajes literales + funciones por RK + esquemas zod (`MAX_CENTAVOS_INT32` para montos).
- `src/server/programas.ts` -- patrón de casos de uso (`usuarioOperativo()` = `SIFAP_USER` cortado a 8, `{ok, mensagem}`, P2002 → mensaje); `listarProgramas` para el `Select` de programas.
- `src/app/programas/{actions.ts,estado.ts,page.tsx,novo/page.tsx,_componentes/FormInclusao.tsx}` -- patrón de Server Actions (`falhaValidacao`, `EstadoAcao`) y formularios con `useAcaoFormulario`.
- `src/components/campos/index.ts` -- `Campo`, `Codigo`, `DataLegada`, `Moeda`, `ResultadoLegado`, `TabelaPaginada`, `useAcaoFormulario`, `conversao.ts` (`textoParaCentavos`); agregar `CpfInput.tsx`, `NisInput.tsx` y exportarlos.
- `src/components/layout/navegacao.ts` -- `NAVEGACAO`: agregar `href: "/beneficiarios"` en "Beneficiários".
- `prisma/schema.prisma` modelo `Beneficiario` -- sin cambios de esquema.
- `tests/programas.test.ts` + `tests/e2e/programas.spec.ts` + `scripts/e2e-db.mjs` -- patrón de tests de servidor con base temporal y e2e con base dedicada (seed: 5 beneficiarios, CPFs con `completaDv`).

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

### 2026-09-24 — Review pass
- verdicts: 29 findings — high 0, medium 7, low 9, false 13, maybe-false 0
- findings:
  - `[medium]` `[defer]` (blind) CPF completo en el enlace de edición/historial/logs — la ruta `/beneficiarios/[cpf]/editar` es la del intent (historia + arquitectura §6); cambiar a clave opaca es decisión de producto (LGPD)
  - `[medium]` `[patch]` (blind) búsqueda parcial por CPF permite enumerar CPFs — CPF solo con 11 dígitos exactos
  - `[medium]` `[patch]` (blind) `falhaInesperada` loguea `e.message` con datos personales de Prisma — solo `name`/`code` (NFR-04)
  - `[low]` `[reject]` (blind) `.bind` expone el CPF y no hay autorización — auth/SSO fuera de alcance; el servidor sobrescribe el CPF con el de la ruta (test agregado)
  - `[medium]` `[patch]` (blind) select de Situação pierde la elección tras error — estado de última versión independiente de `estado.ok`
  - `[low]` `[patch]` (blind) CEP parcial aceptado — exactamente 8 dígitos o vacío
  - `[false]` `[reject]` (blind) inscripción en programa cerrado/inactivo — CADBENEF no verifica el programa (ni su existencia)
  - `[false]` `[reject]` (blind) D18 con TODO abierto — desvío documentado (PRD FR-BEN-01) pendiente de confirmación de negocio
  - `[low]` `[reject]` (blind) Server Actions sin tests — guard de CPF cubierto por el test agregado; resto improbable
  - `[low]` `[reject]` (blind) imports dinámicos en tests — funcionan (verificado por el reviewer de verificación); cosmético
  - `[low]` `[patch]` (blind) `SomenteLeitura.exibicao` tipado ReactNode — tipado string
  - `[false]` `[reject]` (blind) `mascaraCpfLista` con entrada vacía — `numCpf` es NOT NULL de 11 dígitos
  - `[low]` `[reject]` (blind) página de edición inexistente con HTTP 200 / CPF con máscara en la URL — mensaje legado visible; improbable
  - `[medium]` `[patch]` (verif) guard de CPF de la acción de alteración sin test — test con CPF manipulado
  - `[medium]` `[patch]` (verif) campos no editados sobreviven al guardar sin test — e2e con CEP/logradouro/renda
  - `[medium]` `[defer]` (verif) rama P2002 de `incluirBeneficiario` sin test — requiere stub de db
  - `[false]` `[reject]` (intent) "operación" inalcanzable desde la UI — rutas reemplazan I/A (decisión del spec, igual que 1.1)
  - `[low]` `[reject]` (intent) orden del primer error por las acciones no probado; errores de formato antes de existencia — orden legado garantizado en el dominio; formato es validación adicional del borde
  - `[low]` `[reject]` (intent) solo lectura de sexo/programa/región/NIS no verificado en e2e — el servidor rechaza cambios (test de servidor)
  - `[low]` `[reject]` (intent) búsqueda por CPF/paginación sin e2e — cubiertos en el test de servidor
  - `[false]` `[reject]` (intent) máscara D7 ausente en la lista — D7 es de la consulta (2.6)
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — `rk-verification.md` (289/289)
  - `[false]` `[reject]` (edge) status en blanco/fuera de dominio cae en "A" — no hay datos legados migrados; solo se graban status válidos
  - `[false]` `[reject]` (edge) UF fuera de la lista se anula — UF solo se graba desde el select
  - `[low]` `[patch]` (edge) select de Situação se remonta tras éxito+error — mismo patch
  - `[low]` `[patch]` (edge) CEP de 1–7 dígitos — mismo patch
  - `[false]` `[reject]` (edge) región 0/26–98 aceptada — CADBENEF no valida COD-REGIAO; el cálculo usa factor 1,0 fuera de 1–25 (equivalencia)
  - `[false]` `[reject]` (edge) nacimiento futuro aceptado — CADBENEF no lo valida (lo hace VALBENEF, historia 2.2)
  - `[false]` `[reject]` (edge) `numDependentes` editable en la alteración — CADBENEF mueve #NUM-DEP en la alteración (equivalencia)
  - `[false]` `[reject]` (edge) máscara con CPF vacío — NOT NULL

## Design Notes

- **D18 (desvío documentado):** en CADBENEF la pantalla no tiene STATUS; en la alteración `#STATUS` queda en blanco y se graba `' '` salvo edad > 75. El PRD aprobado (FR-BEN-01, DESIGN 4.5) define status editable en la alteración; se sigue el PRD (select prellenado con el status actual) y se marca `// D18: el legado grababa status en blanco en la alteración — decisión PRD FR-BEN-01; confirmar con negocio`.
- Legacy: `COD-REGIAO` N2, `CEP` N8, `COD-PROGRAMA` N4, `RENDA-FAMILIAR` N9.2 → entradas numéricas acotadas; UF no se valida en CADBENEF (la valida VALBENEF, 2.2).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos en verde
- `npm run build` -- expected: OK
- `npx playwright test` -- expected: todos los e2e en verde

## Auto Run Result

- **Resumen:** beneficiarios (CADBENEF): lista con CPF enmascarado y búsqueda (CPF exacto o nombre), inclusión y alteración con la validación secuencial legada (primer error gana, mensajes literales), status A/S por edad (D5), status editable en la alteración (D18, desvío documentado), campos inmutables, control optimista por `numVersao`, NIS vacío → NULL.
- **Archivos principales:** `src/domain/beneficiario/cadastro.ts` (12 RK), `src/server/beneficiarios.ts`, `src/app/beneficiarios/**`, `src/components/campos/{CpfInput,NisInput}.tsx`, `src/domain/cpf.ts` (`mascaraCpfLista`), tests de dominio/servidor/e2e.
- **Review:** 29 hallazgos — 7 patches (5 `medium`: enumeración de CPF por búsqueda parcial, datos personales en logs, select de Situação, test del guard de CPF, e2e de preservación de campos; 2 `low`), 2 diferidos (CPF en la URL de edición — LGPD; carrera P2002), 20 rechazados.
- **Follow-up review recomendado:** `true` — patches: high 0, medium 5, low 2. Riesgo no verificado: superficies LGPD (CPF completo en rutas/HTML, logs de otras acciones que copien el patrón).
- **Verificación:** lint 0; `npm test` 239/239; build OK; e2e 10/10; RK verificadas en RNC (`rk-verification.md`).
- **Pendiente de negocio:** D18 (status en la alteración).
