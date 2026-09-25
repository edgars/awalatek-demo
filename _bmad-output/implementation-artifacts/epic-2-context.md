# Epic 2 Context: Beneficiarios

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica cubre el cadastro, las validaciones, los documentos, los dependientes, el registro de descuentos y la consulta del beneficiario. Equivale a los programas legados CADBENEF, VALBENEF, VALDOCS, CADDEPEND y CONSBENF. El beneficiario es la entidad sobre la que operan elegibilidad (E3), cálculo y pagos (E4), corrección (E5), conciliación (E6) e informes (E7). Sus reglas (78 RK) deben replicar el legado al pie de la letra: mensajes literales, cortes en el primer error o errores acumulados según el programa, y los LEGACY-QUIRK D4, D4b, D5, D6, D7, D14, D15 y D16.

## Stories

- Story 2.1: Inclusión y alteración de beneficiario
- Story 2.2: Validación cadastral consolidada
- Story 2.3: Validación de documentos
- Story 2.4: Dependientes del beneficiario
- Story 2.5: Registro de descuentos del beneficiario
- Story 2.6: Consulta de beneficiario

## Requirements & Constraints

Los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes). Abajo va el texto del PRD sin modificar. Las tablas RK completas por historia están en `docs/stories/2-*.md`.

### FR-BEN — Cadastro (CADBENEF) · Story 2.1

**FR-BEN-01 — Inclusión (I) y alteración (A) de beneficiario (CADBENEF)**
- Operación distinta de I/A → "OPERACAO INVALIDA - INFORME I OU A".
- Inclusión con CPF existente → "BENEFICIARIO JA CADASTRADO".
- Alteración con CPF inexistente → "BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO".
- En alteración solo cambian: nombre, dirección, municipio, UF, CEP, teléfono, RG,
  status, renta familiar, n.º de dependientes y fecha de actualización. CPF,
  fecha de nacimiento, sexo, programa, región y NIS son **inmutables**.
- Inclusión graba fecha de cadastro = fecha de actualización = hoy.
- Éxito: "BENEFICIARIO INCLUIDO COM SUCESSO" / "BENEFICIARIO ALTERADO COM SUCESSO".
- La validación corta en el **primer** error y muestra un solo mensaje.
*Reglas (5):* RK-c83257ae5f85 (CADBENEF:99) · RK-7d4387e99f5a (CADBENEF:143) · RK-2f8766f52e1b (CADBENEF:149) · RK-07ac728d731a (CADBENEF:171) · RK-b89433734937 (CADBENEF:177)

**FR-BEN-02 — Campos obligatorios del cadastro**
CPF ≠ 0 ("CPF OBRIGATORIO"); nombre no vacío ("NOME OBRIGATORIO"); fecha de
nacimiento ≠ 0 ("DATA NASCIMENTO OBRIGATORIA"); sexo ∈ {M, F} ("SEXO INVALIDO").
*Reglas (4):* RK-40623cadda7c (CADBENEF:105) · RK-e1aba7261a6b (CADBENEF:119) · RK-a14601290959 (CADBENEF:125) · RK-e17b444be69b (CADBENEF:131)

**FR-BEN-03**: el módulo 11 del CPF ya está implementado en E0 (`src/domain/cpf.ts`, mensaje "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO"). Se reutiliza, no se reimplementa.

**FR-BEN-04 — Status inicial**
Inclusión → status `A` (Ativo).
*Reglas (1):* RK-e4b2970fefe6 (CADBENEF:162)

**FR-BEN-05 — Suspensión automática por edad > 75  ⚠ LEGACY-QUIRK D5**
Edad = año actual − año de nacimiento. Si > 75 → status `S`, **en inclusión y en alteración**.
*Reglas (2):* RK-46154d4f44a9 (CADBENEF:159) · RK-9ffc13028ce4 (CADBENEF:167)

Orden de validación en 2.1: operación → CPF obligatorio → CPF módulo 11 → nombre → fecha de nacimiento → sexo → duplicado/no encontrado. `codPrograma` debe existir en ProgramaSocial. El servidor rechaza cambios en los campos inmutables.

### FR-VAL — Validación cadastral (VALBENEF) · Story 2.2

**FR-VAL-01 — Validación cadastral consolidada (VALBENEF)**
Rutina que se ejecuta antes de grabar y **acumula todos los errores** (máx. 10)
en lugar de cortar en el primero. Resultado `V` (válido) o `I` (inválido) + lista:
"CPF INVALIDO - DIGITO VERIFICADOR", "DATA NASCIMENTO INVALIDA",
"NOME INVALIDO - DEVE TER NOME E SOBRENOME", "UF INVALIDA", "STATUS INVALIDO".
Status válidos: A, S, C, I, D.
*Reglas (5):* RK-4e7cf0ea0beb (VALBENEF:110) · RK-d92621a0cc50 (VALBENEF:116) · RK-b776e6f05132 (VALBENEF:126) · RK-39e9b653aa4d (VALBENEF:136) · RK-3414a3783a2e (VALBENEF:164)

**FR-VAL-02 — CPF completo (con dígitos repetidos)  ⚠ LEGACY-QUIRK D4b**
Además del módulo 11: si los 11 dígitos son iguales → inválido, **excepto** si
empieza por `000` (se considera válido: "teste governo").
*Reglas (13):* RK-b48d9743345d (VALBENEF:190) · RK-605e59b1fe7d (VALBENEF:195) · RK-e67e790f872a (VALBENEF:197) · RK-2dd4cb3c18cd (VALBENEF:209) · RK-9f7df44b6ca1 (VALBENEF:212) · RK-ccc5388150f7 (VALBENEF:213) · RK-9985fab5aca5 (VALBENEF:216) · RK-f19b73dfd406 (VALBENEF:218) · RK-cb78ba074b4e (VALBENEF:227) · RK-23cb286f5641 (VALBENEF:230) · RK-6381e8b050e1 (VALBENEF:231) · RK-03e29441143e (VALBENEF:234) · RK-07ded10a38a1 (VALBENEF:236)

**FR-VAL-03 — Fecha de nacimiento válida (AAAAMMDD)  ⚠ LEGACY-QUIRK D16**
Año entre 1900 y el año actual; mes 1–12; día 1..días del mes, con febrero
**siempre 29** (no verifica año bisiesto).
*Reglas (6):* RK-dec345b9d4e4 (VALBENEF:244) · RK-1f589b644cd7 (VALBENEF:245) · RK-a34852e9ec02 (VALBENEF:246) · RK-39c31733e515 (VALBENEF:248) · RK-f60066fede08 (VALBENEF:252) · RK-db3b53eeb364 (VALBENEF:256)

**FR-VAL-04 — Nombre con nombre y apellido**
No vacío y con un espacio después de la 1.ª posición.
*Reglas (3):* RK-9c6ba0322e06 (VALBENEF:264) · RK-9eb88e2bb408 (VALBENEF:271) · RK-6e161797bb9a (VALBENEF:274)

**FR-VAL-05 — UF válida**
Si informada, debe pertenecer a las 27 UFs brasileñas.
*Reglas (3):* RK-ac7976dff12d (VALBENEF:145) · RK-20056adb605d (VALBENEF:149) · RK-bb74de6a3c53 (VALBENEF:154)

Firma esperada en 2.2: `validarCadastro(dados)` → `{resultado: 'V'|'I', erros: string[]}`.

### FR-DOC — Validación de documentos (VALDOCS) · Story 2.3

**FR-DOC-01 — Validación de documentos: CPF (VALDOCS)**
Entrada: CPF, RG, título de elector, CTPS. CPF = 0 o módulo 11 inválido → "CPF INVALIDO".
Resultado `V`/`I` con lista de errores (máx. 5).
*Reglas (12):* RK-82c01a2ea13d (VALDOCS:69) · RK-55a63d755481 (VALDOCS:102) · RK-4187fc1c9b8e (VALDOCS:114) · RK-9d67b2c9881b (VALDOCS:117) · RK-1a2b8aca3fed (VALDOCS:118) · RK-533f71e705bc (VALDOCS:121) · RK-ca3109301dbc (VALDOCS:123) · RK-4cd00622ae5a (VALDOCS:131) · RK-bb14087b5111 (VALDOCS:134) · RK-e3ad9c603136 (VALDOCS:135) · RK-06b627574a45 (VALDOCS:138) · RK-08b9ede5ec74 (VALDOCS:140)

**FR-DOC-02 — RG con al menos 5 caracteres**
RG vacío o con menos de 5 caracteres → "RG INVALIDO OU FORMATO INCORRETO".
*Reglas (4):* RK-b0821b60ecb6 (VALDOCS:79) · RK-2b0e2875eb48 (VALDOCS:148) · RK-f018750c00d0 (VALDOCS:155) · RK-cf4926ddfa8b (VALDOCS:160)

**FR-DOC-03 — Documento especial por prefijo de CPF  ⚠ LEGACY-QUIRK D4 (seguridad)**
Si el CPF empieza por 000, 001, 002, 010, 011, 099, 100 o 999 → documento
especial: se **anulan todos los errores** (incluido el RG), resultado `V` y
aviso "** DOCUMENTO ESPECIAL VALIDADO **". Solo con el flag `LEGACY_DOC_ESPECIAL_ENABLED=true` (por defecto desactivado: el prefijo no tiene efecto). Ver §5 D4.
*Reglas (2):* RK-5549fc642f21 (VALDOCS:95) · RK-4aa29d42f19a (VALDOCS:174)

Hace falta un test con el flag activo y otro con el flag inactivo. El flag se lee con `lerQuirks().docEspecialHabilitado`.

### FR-DEP — Dependientes (CADDEPEND) · Story 2.4

**FR-DEP-01 — Dependientes: titular válido (CADDEPEND)**
Se identifica al titular por CPF. Inexistente → "BENEFICIARIO NAO ENCONTRADO".
Titular con status C o D → "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO".
*Reglas (2):* RK-6badeec05527 (CADDEPEND:51) · RK-7f25da1eeff3 (CADDEPEND:56)

**FR-DEP-02 — Límite de dependientes  ⚠ LEGACY-QUIRK D6**
Antes de cada inclusión: si n.º de dependientes > 5 → "LIMITE DE DEPENDENTES
ATINGIDO" (permite llegar a 6; el DDM admite 10).
*Reglas (1):* RK-728f8d2bc779 (CADDEPEND:63)

**FR-DEP-03 — Datos del dependiente**
Nombre obligatorio ("NOME DO DEPENDENTE OBRIGATORIO"); parentesco ∈ {FI, CO, IR, OU}
("PARENTESCO INVALIDO"). Con error, se vuelve a pedir el dependiente.
Campos: nombre, fecha de nacimiento, parentesco, CPF, documento, sexo.
*Reglas (4):* RK-cf0d5200aad9 (CADDEPEND:79) · RK-bba959226637 (CADDEPEND:84) · RK-4dfeeb238cf7 (CADDEPEND:90) · RK-f8707d9be137 (CADDEPEND:105)

**FR-DEP-04 — CPF de dependiente no duplicado**
Si CPF ≠ 0 y ya existe entre los dependientes del titular → "DEPENDENTE JA
CADASTRADO (CPF DUPLICADO)".
*Reglas (1):* RK-d08414712f34 (CADDEPEND:97)

**FR-DEP-05 — Inclusión en serie**
Tras cada inclusión: incrementa el contador del titular, muestra "DEPENDENTE
INCLUIDO - TOTAL:" n y pregunta "INCLUIR OUTRO DEPENDENTE? (S/N)"; distinto de S termina.
*Reglas (1):* RK-db6fc93c9e4c (CADDEPEND:126)

El incremento de `numDependentes` y el alta del dependiente se hacen en la **misma transacción**.

### Story 2.5: descuentos registrados (técnica, sin RK)
CRUD de `BeneficiarioDesconto`, con un máximo de 8 filas. Son los datos de entrada que FR-DSC (E4) leerá según D14. Tipos ∈ {C, I, J, S, P, A} según D15. Valor fijo en centavos, porcentaje N3.2, fecha de inicio y fecha de fin (0 = indefinido). `numProcesso` es obligatorio si el tipo es J. Validación: al menos uno de valor o porcentaje debe ser > 0, salvo en el tipo S. La fecha de fin debe ser 0 o ≥ la fecha de inicio.

### FR-CON — Consulta (CONSBENF) · Story 2.6

**FR-CON-01 — Consulta de beneficiario por CPF o NIS (CONSBENF)**
Tipo de búsqueda C (CPF, por defecto si vacío) o N (NIS); otro → "TIPO BUSCA
INVALIDO". Inexistente → "BENEFICIARIO NAO ENCONTRADO". Muestra datos
cadastrales (CPF enmascarado, nombre, nacimiento, sexo, dirección, municipio/UF,
CEP, status, programa, renta, dependientes, región, NIS, fecha de cadastro).
*Reglas (4):* RK-9d9bab8eef93 (CONSBENF:72) · RK-98c65e845b23 (CONSBENF:80) · RK-7ede98209218 (CONSBENF:86) · RK-7b5ef292a4dd (CONSBENF:100)

**FR-CON-02 — Descripción de status**
A=ATIVO, S=SUSPENSO, C=CANCELADO, I=INATIVO, D=DESLIGADO, otro=DESCONHECIDO.
*Reglas (1):* RK-bbda5babb7d9 (CONSBENF:110)

**FR-CON-03 — Historial de los últimos 12 pagos**
Lista competencia, bruto, líquido, status y tipo de hasta 12 pagos del CPF.
Sin pagos → "NENHUM PAGAMENTO ENCONTRADO".
*Reglas (3):* RK-e17f09d66201 (CONSBENF:152) · RK-0550647253b2 (CONSBENF:156) · RK-95a55083feb2 (CONSBENF:166)

**FR-CON-04 — Máscara de CPF  ⚠ LEGACY-QUIRK D7**
CPF ≥ 10000000000 → `***.***.XXX-XX` (muestra dígitos 7–11). CPF menor
(ceros a la izquierda) → muestra los **3 primeros** dígitos: `XXX.***.***-**`.
"NAO CORRIGIR SEM APROVACAO DA AUDITORIA".
*Reglas (1):* RK-cfd080c8d910 (CONSBENF:177)

Hace falta un test para cada uno de los dos formatos. En E2 todavía no existen pagos (los genera E4), así que el historial se prueba con datos sembrados.

### Decisiones LEGACY-QUIRK (se replican tal cual, con `// LEGACY-QUIRK(Dn): …`)

| ID | Comportamiento legado | Decisión fase 1 | FR |
|---|---|---|---|
| D4 | CPF con prefijos especiales anula todos los errores de documentos | Replicar detrás del flag `LEGACY_DOC_ESPECIAL_ENABLED` (**desactivado por defecto**); activar solo con aprobación de negocio/seguridad | FR-DOC-03 |
| D4b | CPF con 11 dígitos iguales empezando por 000 es válido | Replicar | FR-VAL-02 |
| D5 | Edad > 75 → status S también en alteración | Replicar | FR-BEN-05 |
| D6 | Límite de dependientes corta en > 5 (permite 6); DDM admite 10 | Replicar | FR-DEP-02 |
| D7 | Máscara de CPF inconsistente con ceros a la izquierda | Replicar (requiere aprobación de auditoría para cambiar) | FR-CON-04 |
| D14 | CALCDSCT lee descuentos del beneficiario; el DDM los ubica en el pago | Descuentos registrados → hijo de Beneficiario; descuentos aplicados → hijo de Pagamento | FR-DSC-05 |
| D15 | Dominios divergentes código × DDM (status de pago, parentesco, tipo de descuento) | Usar dominios del **código** (comportamiento); documentar los del DDM | FR-DEP-03, FR-DSC-05, FR-CNB-04 |
| D16 | Febrero siempre con 29 días | Replicar | FR-VAL-03 |

### Criterios transversales
- Cada `RK-…` se implementa en `src/domain` con el comentario `// RK-… (PROG:línea)` y tiene al menos un test. Si el MCP de RNC está conectado, verificar cada regla con `getRule` antes de cerrar la historia.
- LGPD (NFR-04): CPF enmascarado en listas y consultas. Nunca datos personales en logs.
- zod en cada Server Action y Route Handler (NFR-06). Los mensajes del legado salen del dominio literales.
- Toda inclusión o alteración deja un evento de auditoría (IN/AL), grabado en la misma transacción.
- DoD: `npm run lint && npm test` en verde. Los `NEEDS REVIEW` se marcan con `// TODO(review): …`.
- **Pendiente de deferred-work que E2 debe resolver:** normalizar `""` → `NULL` en `Beneficiario.nis` y `BeneficiarioDependente.cpfDependente` antes de grabar. Motivo: el unique está sobre una columna nullable. Con `""`, el segundo registro sin NIS o sin CPF de dependiente viola el unique (P2002). E2 es el primer escritor (historias 2.1 y 2.4). También queda pendiente, y conviene cubrirlo aquí, el test de los constraints unique de `nis` y de `(beneficiarioId, cpfDependente)`.

## Technical Decisions

**Capas (ADR-003).** Las reglas viven en `src/domain/beneficiario/` (FR-BEN, FR-VAL, FR-DOC, FR-DEP), en TypeScript puro sin Prisma ni Next. La orquestación con Prisma y auditoría va en `src/server/beneficiarios.ts` y `src/server/dependentes.ts`, sin lógica de negocio. Las rutas y Server Actions van en `src/app/`. Las máscaras de CPF (D7) y la regla de dígitos repetidos (D4b) pertenecen a `src/domain/cpf.ts`, que se extiende en lugar de duplicarse.

**Código existente reutilizable (no duplicar)**
- `src/domain/cpf.ts`: `validaModulo11`, `calculaDv1/2`, `completaDv`, `MSG_CPF_INVALIDO`. Faltan D4b y las máscaras, que agrega E2.
- `src/domain/money.ts`: `dec`, `truncar`, `aCentavos`, `deCentavos`, `fator` (N3.2 para `pctDesconto`).
- `src/domain/legacyDate.ts`: `dataParaInt`, `intParaData`, `anoDe`, `idadePorAno` (edad por año, D5), `hoje()` (para dtCadastro/dtInclusao/dtUltAlteracao y el año actual en FR-VAL-03).
- `src/domain/quirks.ts`: `lerQuirks()` → `{docEspecialHabilitado}` (D4).
- `src/server/auditoria.ts`: `registrarEvento({acao, tabela, chave, descricao, …}, tx?)`. Acepta el cliente de una transacción en curso. Acciones: IN/AL/CO/CN/DV/EX.
- `src/server/db.ts`: `prisma`, cliente singleton.
- **Lo construye ahora la historia 1.1 (verificar antes de usar):**
  - Kit de UI en `src/components/ui` (shadcn: button, input, label, select, table, card, badge, alert).
  - Componentes de campo en `src/components/campos`: `Moeda`, `Fator`, `DataLegada`, `Codigo`, `ResultadoLegado`, `TabelaPaginada`. **`CpfInput` y `NisInput` no están en el alcance de 1.1**, así que E2 los agrega al mismo kit.
  - Layout pt-BR con barra lateral de 5 grupos y `SIFAP_USER` en el encabezado.
  - `src/domain/programa.ts` y `src/server/programas.ts`: fuente para el `Select` de programas y la verificación de que `codPrograma` existe.
  - Patrón de Server Actions (`actions.ts`) con esquema zod.
  - Base e2e dedicada (`DATABASE_URL=file:./e2e.db`, `migrate reset` + seed en el `webServer` de Playwright).

**Modelo (ya existe en `prisma/schema.prisma`)**
- **Beneficiario**:
  - `numCpf` String(11) **único**, con ceros a la izquierda (D7 depende de ellos).
  - `nis` ➕ String(11)? único si no está vacío (NULL cuando vacío).
  - `nomeCompleto`(60). `dtNascimento` Int AAAAMMDD y `sexo` M/F, ambos inmutables.
  - `rgNumero`(15)?, `logradouro`(80)?, `municipio`, `uf`, `cep` Int?, `telFixo`.
  - `codRegiao` Int (1–25 o 99, inmutable). `codPrograma` String(4) → ProgramaSocial.codPrograma (inmutable).
  - `dtCadastro` Int. `sitBeneficiario` A/S/C/I/D. `vlrRendaFamiliar` Int centavos.
  - `numDependentes` ➕ Int: contador mantenido por CADDEPEND. Es la fuente de los factores de E4.
  - `documentosOk` ➕ S/N: lo consume E3.
  - `dtInclusao/hrInclusao/usrInclusao`, `dtUltAlteracao/hrUltAlteracao/usrUltAlteracao` (DT-ATUALIZACAO = dtUltAlteracao).
  - `numVersao`: concurrencia optimista.
  - Los demás campos del DDM no tienen lógica en fase 1.
- **BeneficiarioDependente** (PE, máx. 10 en el DDM, con el límite de negocio D6):
  - `beneficiarioId` FK (cascade) y `occurrence` (único por titular).
  - `nomeDependente`, `dtNascDepend` Int, `parentesco` FI/CO/IR/OU (D15).
  - `cpfDependente` String?: único por titular si no está vacío (`@@unique([beneficiarioId, cpfDependente])`).
  - `docDependente` ➕, `sexoDependente` ➕, `sitDependente`, `indDeficiencia`.
- **BeneficiarioDesconto** ➕ (PE DESCONTOS de CALCDSCT, D14):
  - `beneficiarioId` FK y `occurrence`.
  - `tipoDesconto` C/I/J/S/P/A, `vlrDesconto` en centavos, `pctDesconto` N3.2 (String).
  - `dtInicioDsct`, `dtFimDsct` (0 = indefinido), `numProcesso`.
  - Los descuentos *aplicados* a un pago van en `PagamentoDesconto` (E4), no aquí.
- ADR-008: el límite de ocurrencias (6 por D6, 8 descuentos) se valida en el dominio. Los hijos se editan dentro de la pantalla del padre.
- `Pagamento.numCpf → Beneficiario.numCpf` (RESTRICT). Para 2.6 es solo lectura. Pagamento y Auditoria no tienen CRUD (ADR-009).
- Representación: fechas en Int AAAAMMDD (0 = vacío), dinero en Int centavos, factores y porcentajes en String decimal.

**Rutas:**
- `/beneficiarios`, `/beneficiarios/novo`, `/beneficiarios/[cpf]/editar`
- `/beneficiarios/[cpf]/dependentes`
- `/beneficiarios/[cpf]/descontos`
- `/consulta`
- `/validacao/cadastro`, `/validacao/documentos`

## UX & Interaction Patterns

La UI está en pt-BR, con densidad de back-office y formularios en 2 columnas. Los mensajes del legado se muestran literales en `ResultadoLegado`. El operador nunca teclea AAAAMMDD ni centavos. El CPF va siempre enmascarado en las tablas. Todo campo lleva `<label>` y sus errores se enlazan con `aria-describedby`. Enter envía el formulario. En la barra lateral: Beneficiários, Dependentes, Descontos y Consulta van en **Cadastro**; Cadastral y Documentos en **Validação**.

**4.4 Beneficiários — lista `/beneficiarios`**
Columnas: CPF (enmascarado) · Nome · Programa · Situação (badge) · Região · Dependentes. Búsqueda por CPF o nombre. Acciones por fila: Editar · Dependentes · Descontos · Consultar. Sin registros: "Nenhum beneficiário — Novo beneficiário".

**4.5 Beneficiário — inclusión/alteración `/beneficiarios/novo`, `/beneficiarios/[cpf]/editar`** (legado: CADASTRO DE BENEFICIARIO)

| Campo | Componente | Legado | Alteración |
|---|---|---|---|
| CPF | `CpfInput` | CPF (N11) | solo lectura |
| Nome | texto (60) | NOME | editable |
| Data de nascimento | `DataLegada` | DT NASCIMENTO (AAAAMMDD) | solo lectura |
| Sexo | `Select` M/F | SEXO | solo lectura |
| Endereço | texto (80) | ENDERECO | editable |
| Município | texto (40) | MUNICIPIO | editable |
| UF | `Select` 27 UFs | UF | editable |
| CEP | máscara `00000-000` → Int | CEP (N8) | editable |
| Telefone | texto (15) | TELEFONE | editable |
| RG | texto (15) | RG | editable |
| Programa | `Select` de programas (código – nome) | COD PROGRAMA (N4) | solo lectura |
| Renda familiar | `Moeda` | RENDA FAMILIAR | editable |
| Nº dependentes | numérico (2) | NUM DEPENDENTES | editable (también lo actualiza la pantalla de dependientes) |
| Região | `Codigo(2)` con ayuda de regiones 1–25 / 99 | COD REGIAO | solo lectura |
| NIS | `NisInput` | NIS | solo lectura |
| Situação | `Select` A/S/C/I/D | STATUS | solo en alteración |

Si hay error, se muestra un solo mensaje literal (FR-BEN-01, que corta en el primero), junto al campo y en el panel.
Si al grabar el status pasa a `S` por edad > 75, se muestra el aviso `warning` "Situação ajustada para SUSPENSO (idade > 75 — regra legada)".

**4.6 Dependentes `/beneficiarios/[cpf]/dependentes`** (legado: CADASTRO DE DEPENDENTES + DADOS DO DEPENDENTE)
- Encabezado: titular (CPF enmascarado, nombre, situación, total de dependientes).
- Tabla: Nome · Nascimento · Parentesco · CPF · Documento · Sexo.
- Formulario de alta: Nome (60) · Data de nascimento (`DataLegada`) · Parentesco (`Select` FI=Filho · CO=Cônjuge · IR=Irmão · OU=Outro) · CPF (`CpfInput`, opcional) · Documento (15) · Sexo (M/F).
- Tras grabar: "DEPENDENTE INCLUIDO - TOTAL: n" + botones **Incluir outro dependente** / **Concluir**.
- Titular C/D: formulario deshabilitado con el mensaje literal.

**4.7 Descontos do beneficiário `/beneficiarios/[cpf]/descontos`**
Tabla editable (máx. 8). Columnas:
- Tipo (`Select` C=Contribuição · I=Imposto · J=Judicial · S=Sindical · P=Pensão alimentícia · A=Administrativo)
- Valor (`Moeda`)
- Percentual (`Fator(2)`)
- Início · Fim (vacío = indefinido)
- Nº processo (obligatorio si J)

Cada fila muestra el indicador "vigente hoje".

**4.8 Consulta `/consulta`** (legado: CONSULTA BENEFICIARIO)
- Entrada: Tipo de busca (radio CPF / NIS, default CPF) + CPF o NIS.
- Resultado: ficha (FR-CON-01) con situación + descripción, y la tabla **Histórico de pagamentos (últimos 12)**: Competência · Bruto · Líquido · Situação · Tipo. Si está vacía → "NENHUM PAGAMENTO ENCONTRADO".

**4.9 Validação cadastral `/validacao/cadastro`** (VALBENEF)
- Entrada: CPF, Nome, Data de nascimento, UF, Situação (o el botón "Carregar do cadastro" por CPF).
- Resultado: `ResultadoLegado` con `V`/`I` y hasta 10 errores numerados.

**4.10 Validação de documentos `/validacao/documentos`** (legado: VALIDACAO DE DOCUMENTOS)
- Entrada: CPF · RG (15) · Título de eleitor (12) · CTPS (15).
- Resultado: `V`/`I` + hasta 5 errores. Si aplica (flag activo), se muestra el sello "** DOCUMENTO ESPECIAL VALIDADO **".

**Flujo F2 — Alta de beneficiario con dependientes y descuentos**
`/beneficiarios` → **Novo** → formulario → Gravar
→ (error) mensaje literal, corrige y reenvía
→ (éxito) ficha → **Dependentes** → incluir → "Incluir outro?" → Concluir
→ **Descontos** (si aplica) → agregar filas.

**Flujo F3 — Atención: consulta**
`/consulta` → CPF o NIS → ficha + últimos 12 pagos → atajos a Editar, Dependentes, Elegibilidade.

**Patrones de interacción**
- Cadastro (2.1): corta en el primer error.
- Validaciones VALBENEF y VALDOCS (2.2, 2.3): lista numerada completa, con formulario de proceso (entrada arriba → acción → panel debajo, que persiste hasta la próxima ejecución).
- Beneficiario no encontrado: mensaje literal en el panel.
- Error inesperado: toast genérico, con el detalle solo en el log del servidor y sin datos personales.
- Estados sin depender solo del color: badge con texto.

## Cross-Story Dependencies

- **Epic 0** (hecho): esquema Prisma, `cpf`/`money`/`legacyDate`/`quirks` y `registrarEvento`.
- **Epic 1 / historia 1.1** (en curso):
  - Kit de UI, componentes de campo, layout y patrón Server Action + zod.
  - Base e2e dedicada.
  - Programas existentes, necesarios para el `Select` y la FK de `codPrograma`.
  - 2.1 no puede empezar la UI sin ese kit.
- **Dentro de E2:**
  - 2.1 crea el beneficiario, del que dependen 2.4, 2.5 y 2.6. También crea la lista con acciones hacia dependentes, descontos y consulta.
  - 2.2 reutiliza la extensión de `cpf.ts` (D4b). 2.3 reutiliza el módulo 11 con su propio mensaje "CPF INVALIDO".
  - La máscara D7 (2.6) sirve también para la lista de 2.1 y el encabezado de 2.4. Conviene que viva en `cpf.ts` desde la primera historia que la necesite.
  - `CpfInput` y `NisInput` se crean una sola vez, en la primera historia que los use (2.1).
- **Con épicas posteriores:**
  - E3 consume `sitBeneficiario`, `nis`, `numDependentes`, `documentosOk`, `codRegiao` y `vlrRendaFamiliar`.
  - E4 usa `numDependentes` y lee `BeneficiarioDesconto` (D14).
  - E4 genera los pagos que muestra el historial de 2.6.
  - La máscara de CPF de RELPGT (E7) es distinta de D7.
