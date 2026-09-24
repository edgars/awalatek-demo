# Epic 0 Context: Fundación

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Construir la base técnica común de la reingeniería de SIFAP (sistema legado Natural/Adabas de pagos de programas sociales, que se reconstruye con equivalencia funcional al centavo): el proyecto Next.js configurado, el esquema de datos **completo** (todas las tablas, incluidos los grupos periódicos Adabas como tablas hijas), las utilidades de dominio compartidas (dinero, fechas legadas, CPF, flags LEGACY-QUIRK) y el único punto de escritura de auditoría. Ninguna épica posterior (E1–E8) debe inventar infraestructura, tipos ni utilidades: todas reutilizan lo que se entrega aquí.

## Stories

- Story 0.1: Scaffold del proyecto y esquema de datos
- Story 0.2: Utilidades de dominio y auditoría

## Requirements & Constraints

- **Stack fijo (no inventar otro):** Next.js App Router + TypeScript estricto, Prisma + prisma-migrate, zod en cada Route Handler/Server Action, `decimal.js` (solo dentro de `src/domain/money`), SQLite, Vitest (dominio + regresión) y Playwright (e2e). `npm run lint`, `npm test` y `npm run build` deben pasar.
- **Dinero:** nunca `float`. Resultados intermedios se **truncan** a 2 decimales (padrón mainframe: ×100 → entero → /100) mediante una única utilidad. El redondeo (+0,005 y truncar) existe solo para el informe consolidado (LEGACY-QUIRK D11).
- **Fechas legadas:** edad = año de referencia − año de nacimiento (`dtNasc / 10000`), sin mes/día. `hoje()` debe respetar `TZ`. Febrero siempre con 29 días al validar (D16, se usa en E2).
- **CPF — módulo 11 (FR-BEN-03), implementado una sola vez y reutilizado por E2:** DV1 = Σ(dígitos 1–9 × pesos 10..2), resto = Σ mod 11, DV = 0 si resto < 2, si no 11 − resto; debe igualar el dígito 10. DV2 igual sobre dígitos 1–10 con pesos 11..2; debe igualar el dígito 11. Mensaje de fallo literal: "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO". CPF siempre como string de 11 dígitos con ceros a la izquierda. Otras utilidades de CPF previstas en `cpf.ts` para épicas posteriores: dígitos repetidos (D4b: inválido salvo si empieza por `000`) y máscaras (D7).
- **Flags LEGACY-QUIRK:** `LEGACY_DOC_ESPECIAL_ENABLED` con default `false` (D4, bypass de documentos por prefijo de CPF; requiere aprobación de negocio/seguridad para activarlo).
- **Auditoría inmutable:** append-only, la escribe solo el sistema (usuario de `SIFAP_USER`, o `BATCH` en procesos batch). Sin alta/edición/borrado por la UI; el escritor no expone update ni delete.
- **Trazabilidad:** cada regla vive en `src/domain` con comentario `// RK-<12 hex> (PROG:línea)` y al menos un test. Las 11 reglas de esta épica son de CADBENEF (líneas 113, 237–266). Con el MCP de RNC conectado, verificar cada `RK-` con `getRule` antes de cerrar la historia.
- **Convenciones:** rarezas del legado → `// LEGACY-QUIRK(D<n>): …` (se replican, no se corrigen); dudas → `// TODO(review): …`. Mensajes del legado se reproducen literalmente (portugués, mayúsculas). LGPD: datos personales nunca en logs.
- **Entorno:** `.env.example` commiteado documentando `DATABASE_URL`, `SIFAP_USER`, `LEGACY_DOC_ESPECIAL_ENABLED=false`, `TZ=America/Sao_Paulo`.
- **Seed:** al menos 3 programas (tipos A, P, T) y 5 beneficiarios (uno por status A/S/C/I/D) con CPFs válidos.

## Technical Decisions

### Estructura de código

- `src/domain/` — TypeScript puro, sin Prisma ni Next, 100 % testeado: `money.ts`, `legacyDate.ts`, `cpf.ts`, `quirks.ts` (E0); luego `beneficiario/`, `elegibilidade.ts`, `calculo/{tabelas,motor,descontos,correcao}.ts`, `cnab240.ts`.
- `src/server/` — casos de uso: solo orquestación (dominio + Prisma + auditoría), sin lógica de negocio. `auditoria.ts` es el **único** escritor de la tabla Auditoria.
- `src/app/` — rutas Next.js. `scripts/` (CLI del lote, E4). `tests/regression/` (casos al centavo, NFR de regresión). `prisma/schema.prisma` + `prisma/seed.ts`.

### Representación de datos (ADR-005/006)

- Fechas → `Int` en formato legado: fecha AAAAMMDD, competencia AAAAMM, hora HHMMSS. `0` = vacío/indeterminado.
- Dinero → `Int` en **centavos**; cálculo intermedio en `Decimal` y truncado con `money.truncar()`.
- Factores/porcentajes (N3.4, N3.2, N5.6) → `String` decimal (p. ej. `"1.3500"`), convertidos a `Decimal` en el dominio.
- CPF / NIS → `String(11)` con ceros a la izquierda.
- Grupos periódicos Adabas (ADR-008) → tablas hijas con FK al padre + `occurrence` (única por padre), `onDelete: Cascade`; el límite de ocurrencias se valida en el dominio.
- Dominios de valores: los del **código** legado, no los del DDM (D15). Campos marcados ➕ no existen en el DDM pero el código los usa.
- ADR-009: `Pagamento` y `Auditoria` sin CRUD libre (pagos solo por procesos de E4–E6; auditoría append-only).

### Modelo de datos (story 0.1 implementa todo)

Nombres camelCase derivados del DDM. Campos de control comunes: `dtInclusao`, `usrInclusao`, `dtUltAlteracao`, `usrUltAlteracao` (Int/String; Beneficiario además `hrInclusao`, `hrUltAlteracao`).

**ProgramaSocial**
- `id` Int PK · `codPrograma` String(4) **único** · `nomePrograma` String(60) · `siglaPrograma` String(10)? · `tipoPrograma` String(1) A/P/T · `orgaoResponsavel`, `leiCriacao` String?
- `dtCriacao` Int · `dtEncerramento` Int (0 = vigente) · `sitPrograma` String(1) A/I/E (inclusión = A)
- `vlrBaseIndividual` Int centavos — **ya grabado × fatorK** (D8) · `vlrBaseFamiliar`, `vlrTetoBenef`, `vlrPisoBenef` Int? (sin lógica fase 1)
- `fatorReajuste` ➕ String N3.4 (usado como `1 + f`) · `pctReajusteAnual` String? · `dtUltReajuste` Int? · `fatorK` String N5.6 (calculado en la inclusión)
- `codElegibilidade` ➕ String(5)? (pos.1 R, pos.2 D) · `rendaMaxPercap` Int centavos (0 = sin límite) · `idadeMin`, `idadeMax` Int (0 = sin límite)
- `indExigeFilhos`, `indExigeEscola`, `indExigeVacina`, `indExigePrenatal`, `indExigeBiometria` String(1)? · `qtdMinFilhos` Int? (sin lógica fase 1)
- `tiposDescontoAplic` String? (CSV, máx. 8)

**ProgramaFaixaCalculo** (hijo, máx. 5): `id`, `programaId` FK, `occurrence` 1..5 (único por programa), `rendaInicio`, `rendaFim`, `vlrAdicional` (centavos), `fatorMultiplicador` (N3.4), `indAcumulativo` S/N.

**ProgramaParamRegional** (hijo, máx. 6): `id`, `programaId` FK, `occurrence` 1..6, `codRegiao` (01–05 o 99), `fatorRegional` (N3.4), `vlrComplementoReg` (centavos), `indAtivoRegiao` S/N. Se persisten y editan, pero el motor usa tablas fijas (D1).

**Beneficiario**
- `id` Int PK · `numCpf` String(11) **único** (clave de negocio) · `nis` ➕ String(11)? único si no vacío · `numInscricao` Int?
- `nomeCompleto` String(60) · `nomeMae`, `nomePai`, `estCivil` String? · `dtNascimento` Int (inmutable) · `sexo` String(1) M/F (inmutable)
- `rgNumero` String(15)? · `rgOrgao`, `rgUf` String? · `rgDtExpedicao` Int?
- `logradouro` String(80)? · `numero`, `complemento`, `bairro`, `municipio`, `uf` String? · `cep` Int? · `codIbge` Int?
- `codRegiao` Int (1–25 o 99; inmutable) · `codPrograma` String(4) → `ProgramaSocial.codPrograma` (inmutable)
- `dtCadastro` Int · `dtInicioBenef`, `dtFimBenef` Int? · `sitBeneficiario` String(1) A/S/C/I/D · `motSituacao` String? · `dtUltSituacao` Int?
- `vlrRendaFamiliar` Int centavos · `qtdMembrosFamilia`, `indRendaPercap` Int? · `numDependentes` ➕ Int (contador mantenido al gestionar dependientes) · `documentosOk` ➕ String(1)? S/N
- `telFixo`, `telCelular`, `email` String? · `indBiometria`, `dtColetaBio`, `codPostoBio`, `hashDigital` (sin lógica fase 1)
- `numVersao` Int (concurrencia optimista)

**BeneficiarioDependente** (hijo; DDM admite 10, el negocio limita según D6): `id`, `beneficiarioId` FK, `occurrence`, `nomeDependente`, `dtNascDepend` Int, `parentesco` (FI/CO/IR/OU), `cpfDependente` String? (único por titular si no vacío), `docDependente` ➕, `sexoDependente` ➕, `sitDependente`, `indDeficiencia`.

**BeneficiarioDesconto** ➕ (hijo; descuentos **registrados**, D14): `id`, `beneficiarioId` FK, `occurrence`, `tipoDesconto` (C/I/J/S/P/A), `vlrDesconto` (centavos), `pctDesconto` (N3.2), `dtInicioDsct`, `dtFimDsct` (0 = indefinido), `numProcesso`.

**Pagamento**
- `id` Int PK · `numPagamento` Int **único** (secuencial máx.+1) · `numCpf` String(11) → `Beneficiario.numCpf` · `numInscricao` Int? · `codPrograma` String(4)
- `anoMesRef` Int AAAAMM — índice (`numCpf`, `anoMesRef`) · `numCiclo` Int?
- `vlrBruto`, `vlrLiquido`, `vlrDescontoTotal`, `vlrAbono` ➕ Int centavos · `tipoPgto` ➕ String(1) N/D/T · `sitPagamento` String(1) G/P/C/D/E (dominio del código)
- `dtGeracao`, `hrGeracao` Int · `dtPagamento` ➕ Int? · `codBanco` String(3)? · `codRetornoBanco` String(2)?
- `vlrCorrecao` ➕ Int? · `dtCorrecao` ➕ Int? · `indCorrigido` ➕ String(1)?
- Resto del DDM, opcional y sin lógica en fase 1: `dtEmissao`, `dtConfirmacao`, `dtCancelamento`, `motCancelamento`, datos bancarios, SIAFI, conciliación (dt/sit/vlr), `desRetornoBanco`, hashes. `usrInclusao = "BATCH"` en el lote.

**PagamentoDesconto** (hijo, máx. 8; descuentos **aplicados**, D14): `id`, `pagamentoId` FK, `occurrence`, `tipoDesconto`, `vlrDesconto`, `pctDesconto`, `numProcesso`, `dtInicioDsct`, `dtFimDsct`.

**Auditoria**
- `id` Int PK · `numAuditoria` Int **único** (secuencial máx.+1) · `dtEvento`, `hrEvento` Int (índice por `dtEvento`)
- `codAcao` String(2) IN/AL/CO/CN/DV/EX · `tipoEntidade` String(15) · `idEntidade` String(20) · `usrEvento` String(8) · `desAcao` String(80)
- `valorAnterior`, `valorPosterior` String? · opcionales del DDM: módulo, CPF afectado, perfil, IP, sesión, batch, correlación.

**Relaciones:** `Beneficiario.codPrograma → ProgramaSocial.codPrograma`; `Pagamento.numCpf → Beneficiario.numCpf`; hijos → padre con `onDelete: Cascade`. `Beneficiario.codRegiao` **no** es FK a `ProgramaParamRegional`.

### API de las utilidades (story 0.2)

- `money.ts`: centavos ↔ Decimal, `truncar()`, `redondear()` (D11).
- `legacyDate.ts`: parse/format AAAAMMDD y AAAAMM, `hoje()` según `TZ`, `idadePorAno(dtNasc, anoRef)`.
- `cpf.ts`: `validaModulo11(cpf)`.
- `quirks.ts`: lectura tipada de flags.
- `server/auditoria.ts`: `registrarEvento({acao, tabela, chave, usuario, descricao, valorAnterior?, valorPosterior?})` → asigna `numAuditoria` (máx.+1) y dt/hr del evento.

## UX & Interaction Patterns

- La UI (pt-BR) nunca pide AAAAMMDD ni centavos: componentes de campo convierten (`CpfInput` máscara `000.000.000-00` → String(11); `DataLegada` → Int AAAAMMDD, 0 si vacío; `Competencia` → Int AAAAMM; `Moeda` `R$ 0.000,00` → Int centavos). Esta épica no construye pantallas, pero las conversiones de `money.ts` y `legacyDate.ts` deben servir a esos componentes.

## Cross-Story Dependencies

- 0.2 depende de 0.1 (proyecto, esquema Prisma y tabla Auditoria existentes).
- Todas las épicas E1–E8 dependen de E0: el esquema completo evita migraciones estructurales posteriores; `cpf.validaModulo11` se reutiliza en validación cadastral y de documentos (E2); `money`/`legacyDate` en cálculo, lote, corrección, conciliación e informes (E4–E7); `registrarEvento` en conciliación (acciones CO/DV, usuario `BATCH`, E6) y es la fuente del informe de auditoría (E7); `LEGACY_DOC_ESPECIAL_ENABLED` se consume en E2.
- Orden de implementación: el de `_bmad-output/implementation-artifacts/sprint-status.yaml` (0.1 primero). La épica termina cuando ambas historias están en `done` y sus reglas trazadas en tests.
