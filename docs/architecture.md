# Arquitectura — SIFAP

> Versión 2 — corrección de rumbo del 2026-09-24. Fuente: DDMs Adabas y
> programas Natural de la workspace RNC `603f473c-…`. Requisitos: `docs/prd.md`.

## 1. Stack

| Capa | Elección |
|---|---|
| Aplicación | Next.js (App Router) — UI + Route Handlers (`/api/*`) en un solo proceso |
| Lenguaje | TypeScript estricto |
| ORM / migraciones | Prisma + prisma-migrate |
| Validación | zod en cada Route Handler y Server Action |
| Aritmética decimal | `decimal.js` (solo dentro de `src/domain/money`) |
| Base de datos | SQLite (archivo en volumen persistente) |
| Tests | Vitest (dominio + regresión de cálculo), Playwright (e2e de flujos) |
| Deployment | docker-compose, **un servicio `app`** |
| Auth / SSO | fuera de alcance (SSO off); usuario operativo por variable `SIFAP_USER` para auditoría |

## 2. Estructura del código

```
prisma/
  schema.prisma
  seed.ts                    ← datos de prueba (programas A/P/T, beneficiarios de ejemplo)
src/
  domain/                    ← TypeScript puro, sin Prisma ni Next. 100 % testeado.
    money.ts                 ← centavos, truncar (padrón mainframe), redondear (D11)
    legacyDate.ts            ← AAAAMMDD / AAAAMM: parse, validar (D16), edad por año
    cpf.ts                   ← módulo 11, dígitos repetidos (D4b), máscaras (D7, RELPGT)
    beneficiario/            ← FR-BEN, FR-VAL, FR-DOC, FR-DEP
    elegibilidade.ts         ← FR-ELG
    calculo/
      tabelas.ts             ← factores regionales y tramos fijos (D1), contribución, IPCA (D9)
      motor.ts               ← FR-CAL-03..10 — único motor, usado por cálculo individual y lote
      descontos.ts           ← FR-DSC (tope 30 %, D2)
      correcao.ts            ← FR-COR
    cnab240.ts               ← parser de retorno (FR-CNB-01)
    quirks.ts                ← flags LEGACY-QUIRK (p. ej. LEGACY_DOC_ESPECIAL_ENABLED)
  server/                    ← casos de uso: orquestan dominio + Prisma + auditoría
    programas.ts beneficiarios.ts dependentes.ts elegibilidade.ts
    calculo.ts lotePagamentos.ts descontos.ts correcao.ts conciliacao.ts
    relatorios.ts auditoria.ts
  app/                       ← rutas Next.js (ver §6)
scripts/
  lote-pagamentos.ts         ← entrada CLI del lote mensual (FR-LOT)
tests/
  regression/                ← casos al centavo derivados del fuente (NFR-03)
```

Regla: toda regla `RK-…` vive en `src/domain` con un comentario `// RK-… (PROG:línea)`;
`src/server` no contiene lógica de negocio, solo orquestación y persistencia.

## 3. Representación de datos (ADR-005, ADR-006)

- **Fechas legadas** → `Int` con el formato original: fecha `AAAAMMDD`,
  competencia `AAAAMM`, hora `HHMMSS`. Motivo: toda la lógica legada opera
  aritméticamente sobre esos enteros (edad = `dt / 10000`, comparaciones de
  vigencia, orden de lectura). La UI convierte hacia/desde selectores de fecha.
  `0` = vacío/indeterminado, como en el legado.
- **Dinero** → `Int` en **centavos**. SQLite no tiene decimal nativo; centavos
  enteros evitan errores de punto flotante. Cálculos intermedios con
  `decimal.js` y truncado a centavos por `money.truncar()`.
- **Factores y porcentajes** (N3.4, N3.2, N5.6) → `String` decimal en la base
  (p. ej. `"1.3500"`), convertidos a `Decimal` en el dominio.
- **CPF / NIS** → `String` de 11 dígitos con ceros a la izquierda (preserva el
  comportamiento de D7, que depende de ceros a la izquierda).

## 4. Modelo de datos

Nombres en camelCase derivados del DDM. Donde el **código** usa un campo que el
DDM no tiene, se agrega (marcado ➕). Dominios de valores: los del código (D15).

### ProgramaSocial (DDM `PROGRAMA-SOCIAL`, arq. 151)

| Campo | Tipo | Código legado / nota |
|---|---|---|
| id | Int PK | |
| codPrograma | String(4) **único** | COD-PROGRAMA |
| nomePrograma | String(60) | NOME-PROGRAMA |
| siglaPrograma | String(10)? | |
| tipoPrograma | String(1) | TIPO — A/P/T |
| orgaoResponsavel, leiCriacao | String? | |
| dtCriacao | Int | DT-INICIO |
| dtEncerramento | Int (0 = vigente) | DT-FIM |
| sitPrograma | String(1) | STATUS-PROG — A/I/E; inclusión = A |
| vlrBaseIndividual | Int (centavos) | VLR-BASE — **grabado ya × FATOR-K** (D8) |
| vlrBaseFamiliar, vlrTetoBenef, vlrPisoBenef | Int? | sin lógica en fase 1 |
| fatorReajuste ➕ | String (N3.4) | FATOR-REAJUSTE — usado como `(1 + f)` |
| pctReajusteAnual, dtUltReajuste | String?/Int? | sin lógica en fase 1 |
| fatorK | String (N5.6) | calculado en la inclusión (FR-PRG-03) |
| codElegibilidade ➕ | String(5)? | COD-ELEGIBILIDADE — pos.1 R, pos.2 D (FR-ELG-06) |
| rendaMaxPercap | Int (centavos) | RENDA-MAX (0 = sin límite) |
| idadeMin, idadeMax | Int (0 = sin límite) | |
| indExige* (filhos, escola, vacina, prenatal, biometria), qtdMinFilhos | String(1)?/Int? | sin lógica en fase 1 |
| tiposDescontoAplic | String? (lista CSV, máx. 8) | MU TIPO-DSCT-APLIC |
| dtInclusao, usrInclusao, dtUltAlteracao, usrUltAlteracao | Int/String | |

**ProgramaFaixaCalculo** (PE `GRP-FAIXA-CALCULO`, máx. 5): `id`, `programaId` FK,
`occurrence` 1..5 (único por programa), `rendaInicio`, `rendaFim`, `vlrAdicional`
(centavos), `fatorMultiplicador` (N3.4), `indAcumulativo` S/N.

**ProgramaParamRegional** (PE `GRP-PARAM-REGIONAL`, máx. 6): `id`, `programaId` FK,
`occurrence` 1..6, `codRegiao` (01–05 o 99), `fatorRegional` (N3.4),
`vlrComplementoReg` (centavos), `indAtivoRegiao` S/N.
> D1: persistidos y editables; el motor de cálculo usa las tablas fijas de `tabelas.ts`.

### Beneficiario (DDM `BENEFICIARIO`, arq. 150)

| Campo | Tipo | Código legado / nota |
|---|---|---|
| id | Int PK | |
| numCpf | String(11) **único** | CPF — clave de negocio |
| nis ➕ | String(11)? **único si ≠ vacío** | NIS — búsqueda (FR-CON-01) |
| numInscricao | Int? | |
| nomeCompleto | String(60) | NOME |
| nomeMae, nomePai, estCivil | String? | |
| dtNascimento | Int | DT-NASCIMENTO — inmutable tras la inclusión |
| sexo | String(1) | M/F — inmutable |
| rgNumero | String(15)? | RG |
| rgOrgao, rgUf, rgDtExpedicao | String?/Int? | |
| logradouro | String(80)? | ENDERECO |
| numero, complemento, bairro | String? | |
| municipio, uf | String? | |
| cep | Int? | |
| codIbge | Int? | |
| codRegiao | Int | COD-REGIAO (N2 en el código; 1–25 o 99) — inmutable |
| codPrograma | String(4) → ProgramaSocial.codPrograma | COD-PROGRAMA — inmutable |
| dtCadastro | Int | |
| dtInicioBenef, dtFimBenef | Int? | |
| sitBeneficiario | String(1) | STATUS — A/S/C/I/D |
| motSituacao, dtUltSituacao | String?/Int? | |
| vlrRendaFamiliar | Int (centavos) | RENDA-FAMILIAR |
| qtdMembrosFamilia, indRendaPercap | Int? | |
| numDependentes ➕ | Int | NUM-DEPENDENTES — contador mantenido por CADDEPEND (fuente de los factores) |
| documentosOk ➕ | String(1)? | DOCUMENTOS-OK — S/N (FR-ELG-05) |
| telFixo | String? | TELEFONE |
| telCelular, email | String? | |
| indBiometria, dtColetaBio, codPostoBio, hashDigital | … | sin lógica en fase 1 |
| dtInclusao, hrInclusao, usrInclusao, dtUltAlteracao, hrUltAlteracao, usrUltAlteracao | Int/String | DT-ATUALIZACAO = dtUltAlteracao |
| numVersao | Int | control de concurrencia optimista |

**BeneficiarioDependente** (PE `GRP-DEPENDENTE`, máx. 10 en el DDM; límite de negocio D6):
`id`, `beneficiarioId` FK, `occurrence`, `nomeDependente`, `dtNascDepend` (Int),
`parentesco` (FI/CO/IR/OU — D15), `cpfDependente` (String? — único por titular si ≠ vacío),
`docDependente` ➕, `sexoDependente` ➕, `sitDependente`, `indDeficiencia`.

**BeneficiarioDesconto** ➕ (PE `DESCONTOS` del código de CALCDSCT — D14): `id`,
`beneficiarioId` FK, `occurrence`, `tipoDesconto` (C/I/J/S/P/A), `vlrDesconto`
(centavos), `pctDesconto` (N3.2), `dtInicioDsct`, `dtFimDsct` (0 = indefinido),
`numProcesso`.

### Pagamento (DDM `PAGAMENTO`, arq. 160)

| Campo | Tipo | Código legado / nota |
|---|---|---|
| id | Int PK | |
| numPagamento | Int **único** | NUM-PAGTO — secuencial (máx. + 1) |
| numCpf | String(11) → Beneficiario.numCpf | CPF-BENEF |
| numInscricao | Int? | |
| codPrograma | String(4) | |
| anoMesRef | Int (AAAAMM) | COMPETENCIA — índice (numCpf, anoMesRef) |
| numCiclo | Int? | |
| vlrBruto, vlrLiquido | Int (centavos) | |
| vlrDescontoTotal | Int (centavos) | VLR-DESCONTO |
| vlrAbono ➕ | Int (centavos) | VLR-ABONO |
| tipoPgto ➕ | String(1) | N/D/T |
| sitPagamento | String(1) | STATUS-PGTO — dominio del código: G/P/C/D/E (D15) |
| dtGeracao, hrGeracao | Int | |
| dtPagamento ➕ | Int? | DT-PAGAMENTO (conciliación 00) |
| codBanco | String(3)? | conciliación graba 1 |
| codRetornoBanco | String(2)? | COD-RETORNO |
| vlrCorrecao ➕, dtCorrecao ➕, indCorrigido ➕ | Int?/Int?/String(1)? | CALCCORR |
| dtEmissao, dtConfirmacao, dtCancelamento, motCancelamento, dados bancários, SIAFI, conciliação (dt/sit/vlr), desRetornoBanco, hashes | … | del DDM; sin lógica en fase 1 salvo lo indicado |
| campos de control | … | usrInclusao = `BATCH` en el lote |

**PagamentoDesconto** (PE `GRP-DESCONTO`, máx. 8 — D14): descuentos **aplicados**
a un pago: `id`, `pagamentoId` FK, `occurrence`, `tipoDesconto`, `vlrDesconto`,
`pctDesconto`, `numProcesso`, `dtInicioDsct`, `dtFimDsct`. Se escribe en FR-DSC-06
(una fila por descuento procesado).

### Auditoria (DDM `AUDITORIA`, arq. 170)

| Campo | Tipo | Código legado / nota |
|---|---|---|
| id | Int PK | |
| numAuditoria | Int **único** | SEQ-AUDIT — secuencial |
| dtEvento, hrEvento | Int | índice por dtEvento |
| codAcao | String(2) | ACAO — IN/AL/CO/CN/DV/EX |
| tipoEntidade | String(15) | TABELA-REF |
| idEntidade | String(20) | CHAVE-REF |
| usrEvento | String(8) | USUARIO |
| desAcao | String(80) | DESCRICAO |
| valorAnterior, valorPosterior | String? | VLR-ANTERIOR / VLR-NOVO (MU simplificado) |
| demás campos del DDM (módulo, CPF afectado, perfil, IP, sesión, batch, correlación) | String?/Int? | opcionales |

Solo `src/server/auditoria.ts` escribe en esta tabla (append-only; sin update/delete).

### Relaciones

- `Beneficiario.codPrograma → ProgramaSocial.codPrograma` (confirmado: `FIND PROGRAMA-V WITH COD-PROGRAMA = BENEFICIARIO-V.COD-PROGRAMA`, CALCBENF/BATCHPGT).
- `Pagamento.numCpf → Beneficiario.numCpf` (confirmado: `READ PAGAMENTO-V BY CPF-BENEF`, CONSBENF/CALCCORR).
- Hijos PE → padre por FK con `onDelete: Cascade`.
- `Beneficiario.codRegiao` **no** es FK a `ProgramaParamRegional` (D1: el cálculo usa tabla fija).

## 5. Procesos (casos de uso)

| Proceso | Disparo | Transacción |
|---|---|---|
| Cálculo individual (FR-CAL) | UI `/calculo` | 1 transacción: lee beneficiario+programa, graba pago |
| Lote mensual (FR-LOT) | UI `/lote` (botón, con confirmación) **y** CLI `npm run lote:pagamentos` | por beneficiario (como `END TRANSACTION` del legado); resumen al final; no se re-generan pagos de la misma competencia |
| Recálculo de descuentos (FR-DSC) | UI `/descontos` | 1 transacción por pago |
| Corrección retroactiva (FR-COR) | UI `/correcao` | por pago |
| Conciliación (FR-CNB) | UI `/conciliacao` con upload del archivo de retorno | por registro; auditoría CO/DV en la misma transacción |

## 6. Rutas

| Ruta | Pantalla legado | Épica |
|---|---|---|
| `/programas`, `/programas/novo`, `/programas/[cod]` | CADASTRO PROGRAMAS SOCIAIS / DADOS DO PROGRAMA | E1 |
| `/beneficiarios`, `/beneficiarios/novo`, `/beneficiarios/[cpf]/editar` | CADASTRO DE BENEFICIARIO | E2 |
| `/beneficiarios/[cpf]/dependentes` | CADASTRO DE DEPENDENTES / DADOS DO DEPENDENTE | E2 |
| `/beneficiarios/[cpf]/descontos` | (registro de descuentos — PE DESCONTOS) | E2/E4 |
| `/consulta` | CONSULTA BENEFICIARIO | E2 |
| `/validacao/cadastro`, `/validacao/documentos` | VALBENEF / VALIDACAO DE DOCUMENTOS | E2 |
| `/elegibilidade` | VALIDACAO ELEGIBILIDADE | E3 |
| `/calculo`, `/lote`, `/descontos` | CALCULO BENEFICIO / BATCHPGT / CALCULO DESCONTOS | E4 |
| `/correcao` | CORRECAO RETROATIVA | E5 |
| `/conciliacao` | CONCILIACAO BANCARIA | E6 |
| `/relatorios/pagamentos`, `/relatorios/consolidado`, `/relatorios/auditoria` | RELATORIO PAGAMENTOS / COMPETENCIA RELATORIO / RELATORIO AUDITORIA | E7 |
| `/pagamentos`, `/pagamentos/[num]` | (solo lectura) | E4 |

## 7. Deployment — docker-compose (ADR-007)

- **Un servicio `app`**: imagen multi-stage, Next.js `output: "standalone"`, puerto 3000.
- SQLite en volumen nombrado `sifap-data` montado en `/data`
  (`DATABASE_URL=file:/data/sifap.db`); `prisma migrate deploy` al arrancar.
- No hay servicio `db` ni `api` separados: SQLite es un archivo y la API es parte de Next.js.
- Lote mensual: `docker compose run --rm app npm run lote:pagamentos`
  (programable por cron del host; el legado corría el 1.er día hábil).
- `.env.example`: `DATABASE_URL`, `SIFAP_USER`, `LEGACY_DOC_ESPECIAL_ENABLED=false`, `TZ=America/Sao_Paulo`.

## 8. Decisiones de arquitectura (ADR)

- **ADR-001 Stack:** Next.js + Prisma + SQLite (canvas RNC).
- **ADR-002 Módulos por dominio**, no por tabla: épicas E1–E7 = procesos del legado.
- **ADR-003 Dominio puro:** reglas en `src/domain`, testeables sin base; un solo motor de cálculo para individual y lote.
- **ADR-004 Directivas del autor** prevalecen sobre valores derivados.
- **ADR-005 Fechas como enteros legados** (AAAAMMDD/AAAAMM/HHMMSS).
- **ADR-006 Dinero en centavos enteros** + `decimal.js` + truncado mainframe centralizado.
- **ADR-007 Un solo contenedor** con SQLite en volumen.
- **ADR-008 Grupos periódicos → tablas hijas** con `occurrence` y límite validado en el dominio.
- **ADR-009 Pagamento y Auditoria no tienen CRUD:** pagos solo por procesos; auditoría append-only.
- **ADR-010 LEGACY-QUIRK:** comportamientos raros replicados y marcados (`docs/prd.md` §5); flags en `src/domain/quirks.ts`.
