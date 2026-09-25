# Epic 1 Context: Programas sociales

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Dar de alta y consultar programas sociales (equivalente al programa legado CADPROG), incluidos sus grupos hijos: tramos de cálculo y parámetros regionales. El programa es la entidad raíz de la que dependen beneficiarios (E2), elegibilidad (E3) y cálculo (E4). Además, esta es la **primera épica con UI**. Aquí se fijan el layout, los componentes de campo y los patrones de interacción que reutilizarán las demás épicas.

## Stories

- Story 1.1: Inclusión y consulta de programa social

## Requirements & Constraints

Los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes, como en el legado). "Truncar" significa descartar desde el 3.er decimal (`×100 → entero → /100`).

**FR-PRG-01 — Operaciones de programa: inclusión (I) y consulta (C)**
- Operación distinta de I/C → "OPERACAO INVALIDA".
- Consulta por código: muestra código, nombre, tipo, valor base, código de elegibilidad y status. Inexistente → "PROGRAMA NAO ENCONTRADO".
- El legado **no altera ni excluye** programas. Mantener y eliminar por la UI queda fuera del alcance de equivalencia (ver D1 para los grupos hijos).
- Reglas: RK-d20a15a018e6 (CADPROG:51) · RK-a1d8765eea49 (CADPROG:56) · RK-7ca3bec5e5f6 (CADPROG:117)

**FR-PRG-02 — Unicidad del código de programa**
Inclusión con código existente → "PROGRAMA JA CADASTRADO".
- Regla: RK-1559882bffe4 (CADPROG:81)

**FR-PRG-03 — Valor base ajustado por FATOR-K ⚠ LEGACY-QUIRK D8**
Al incluir: `FATOR-K = 1.00 + FATOR-REAJ × 0.347215`; se graba `VLR-BASE = VLR-BASE informado × FATOR-K`. Status inicial `A`. Mensaje: "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO:" + valor.
Campos de entrada: nombre, tipo (A=asistencial, P=previsional, T=trabajo), valor base, código de elegibilidad (A5), fecha inicio, fecha fin (0 = indeterminado), renta máxima, edad mín., edad máx., factor de reajuste.
- Reglas: RK-275e4a632e83 (CADPROG:87) `COMPUTE #FATOR-K = 1.00 + (#FATOR-REAJ * 0.347215)` · RK-bd6a7e52a48b (CADPROG:88) `COMPUTE #VLR-CALC = #VLR-BASE * #FATOR-K`

**FR-PRG-04 — Tramos de cálculo y parámetros regionales (grupos del programa)**
El DDM define dentro del programa `GRP-FAIXA-CALCULO` (máx. 5 tramos: renta inicio/fin, factor multiplicador, valor adicional, acumulativo S/N) y `GRP-PARAM-REGIONAL` (máx. 6: código región, factor regional, complemento, activo S/N). Se editan **dentro** de la pantalla del programa. Según D1, en fase 1 el cálculo usa las tablas fijas del legado; estos grupos se persisten y se muestran. No hay reglas RK (es estructura de datos).

**Decisiones LEGACY-QUIRK (se replican tal cual, con `// LEGACY-QUIRK(Dn): …`)**

| ID | Comportamiento legado | Decisión fase 1 | FR |
|---|---|---|---|
| D1 | Tablas de factor regional y tramos de renta **fijas en el código**, aunque el DDM tiene `GRP-PARAM-REGIONAL` / `GRP-FAIXA-CALCULO` | Replicar tablas fijas; los grupos se persisten y editan pero el cálculo no los usa | FR-CAL-03, FR-CAL-05, FR-PRG-04 |
| D8 | VLR-BASE grabado × FATOR-K y luego × (1 + FATOR-REAJ) en el cálculo | Replicar | FR-PRG-03, FR-CAL-07 |

**Criterios transversales**
- Cada regla `RK-…` se implementa en `src/domain` con el comentario `// RK-… (PROG:línea)` y tiene al menos un test. Si el MCP de RNC está conectado, verificar cada una con `getRule` antes de cerrar la historia.
- Dinero: nunca `float`, y los intermedios se truncan a centavos. `vlrBaseIndividual` se trunca a centavos.
- LGPD: nunca datos personales en logs.
- Toda inclusión deja evento de auditoría (auditoría append-only, escrita solo por el sistema).
- DoD: `npm run lint && npm test` en verde. Los `NEEDS REVIEW` se marcan con `// TODO(review): …`.

## Technical Decisions

**Capas (ADR-003) — obligatorio**
- `src/domain/`: TypeScript puro, sin Prisma ni Next. Aquí viven todas las reglas RK, el cálculo de FATOR-K y los límites de ocurrencias (5/6). 100 % testeado con Vitest.
- `src/server/programas.ts`: caso de uso que orquesta dominio + Prisma + auditoría. **No contiene lógica de negocio.**
- `src/app/`: rutas, páginas y Server Actions/Route Handlers de Next.js (App Router).
- **zod en cada Route Handler y Server Action** (validación en el borde). Los mensajes de error del legado salen del dominio de forma literal.

**Utilidades de Epic 0 ya disponibles (reutilizar, no duplicar)**
- `src/domain/money.ts`: `dec`, `truncar` (ROUND_DOWN a 2 decimales), `redondear` (solo D11/E7), `aCentavos`, `deCentavos`, `fator` (string N3.4/N5.6 → Decimal). `decimal.js` solo se importa aquí. `dec` rechaza `number` no enteros.
- `src/domain/legacyDate.ts`: `dataParaInt` (ISO → AAAAMMDD, 0 si vacío), `intParaData`, `competenciaParaInt`, `intParaCompetencia`, `idadePorAno`, `hoje()` (devuelve `{data, hora}` según TZ; útil para `dtInclusao`).
- `src/domain/cpf.ts`: módulo 11 (sin uso en E1).
- `src/domain/quirks.ts`: `lerQuirks()` (flags LEGACY-QUIRK).
- `src/server/auditoria.ts`: `registrarEvento({acao, tabela, chave, descricao, …}, tx?)`. Acepta el cliente de una transacción en curso para grabar la auditoría en la misma transacción. El usuario por defecto es `SIFAP_USER`. Acciones: IN/AL/CO/CN/DV/EX.
- `src/server/db.ts`: `prisma`, cliente singleton (adapter better-sqlite3).

**Representación de datos**
- Dinero en `Int` centavos. Fechas en `Int` AAAAMMDD (0 = vacío/indeterminado). Factores en `String` decimal (`fatorReajuste` N3.4, `fatorK` N5.6).

**Modelo (ya existe en `prisma/schema.prisma`)**
- `ProgramaSocial`: campos clave `codPrograma` (String(4), **único**), `nomePrograma`(60), `siglaPrograma`?, `tipoPrograma` A/P/T, `dtCriacao` (DT-INICIO), `dtEncerramento` (0 = vigente), `sitPrograma` (A/I/E; inclusión = `A`), `vlrBaseIndividual` (centavos, **grabado ya × FATOR-K**, D8), `fatorReajuste` ➕ (N3.4; E4 lo usa como `(1 + f)`), `fatorK` (N5.6, calculado en la inclusión), `codElegibilidade` ➕ (String(5): pos.1 R = exige NIS, pos.2 D = exige dependientes; lo consume E3), `rendaMaxPercap`/`idadeMin`/`idadeMax` (0 = sin límite), `dtInclusao`/`usrInclusao`. Los demás campos (familiar, teto, piso, indExige*, etc.) no tienen lógica en fase 1.
- `ProgramaFaixaCalculo` (PE, máx. 5): `programaId` FK (cascade), `occurrence` 1..5 (único por programa), `rendaInicio`, `rendaFim`, `vlrAdicional` (centavos), `fatorMultiplicador` (N3.4), `indAcumulativo` S/N.
- `ProgramaParamRegional` (PE, máx. 6): `programaId` FK (cascade), `occurrence` 1..6, `codRegiao` (Int, 01–05 o 99), `fatorRegional` (N3.4), `vlrComplementoReg` (centavos), `indAtivoRegiao` S/N.
- ADR-008: los grupos periódicos son tablas hijas con `occurrence`, y **el límite se valida en el dominio**. D1: `Beneficiario.codRegiao` no es FK a los parámetros regionales.

**Rutas**

| Ruta | Pantalla legado | Épica |
|---|---|---|
| `/programas`, `/programas/novo`, `/programas/[cod]` | CADASTRO PROGRAMAS SOCIAIS / DADOS DO PROGRAMA | E1 |

**Estado del repositorio relevante:** hay `src/app/{layout,page}.tsx` y `globals.css`, pero Tailwind y shadcn/ui **no están instalados todavía**, y no existe `src/components/`. Esta épica debe incorporarlos junto con el layout de barra lateral. El e2e de Playwright aún no tiene base dedicada; está registrado en deferred-work como pendiente antes del primer e2e que lea datos de E1.

## UX & Interaction Patterns

**Principios**
- **Interfaz en portugués (pt-BR).** Los mensajes del legado se muestran tal cual (mayúsculas) en el panel de resultado. Las ayudas nuevas van en tono normal. La documentación del proyecto sigue en español.
- **Equivalencia antes que rediseño:** cada pantalla web equivale a una pantalla 3270 con los mismos campos de entrada. Se mejora la usabilidad (máscaras, selectores, tablas), no el comportamiento.
- **Densidad de back-office:** tablas compactas, formularios en 2 columnas en desktop y 1 en móvil.

**Sistema visual**
- Tailwind CSS + shadcn/ui. Tema claro por defecto, oscuro opcional. Sans del sistema, con cifras tabulares para R$, CPF y competencia.
- Colores semánticos: `success`, `destructive`, `warning` (suspenso / LEGACY-QUIRK visible), `muted`.
- Layout: barra lateral con los grupos **Cadastro**, **Validação**, **Cálculo e Pagamentos**, **Processos**, **Relatórios**. El encabezado muestra el usuario operativo (`SIFAP_USER`). Programas va en **Cadastro**.

**Componentes de campo (compartidos por todas las épicas)**

| Componente | Uso | Entrada → valor enviado |
|---|---|---|
| `CpfInput` | CPF, CPF titular, CPF dependente | máscara `000.000.000-00` → `String(11)` con ceros a la izquierda |
| `NisInput` | NIS | 11 dígitos → `String(11)` |
| `DataLegada` | fechas | selector de fecha → `Int` AAAAMMDD (0 si vacío cuando el campo lo admite) |
| `Competencia` | competencias | selector mes/año → `Int` AAAAMM |
| `Moeda` | valores | `R$ 0.000,00` → `Int` centavos |
| `Fator` | factores y porcentajes | decimal con 4 (factor) o 2 (%) casas → `String` |
| `Codigo` | código de programa, región | numérico con longitud fija (4 / 2) |
| `Select` | dominios cerrados | valores del código legado (D15) con etiqueta |
| `ResultadoLegado` | panel de resultado | título (`V`/`I`, elegível/não) + lista numerada de mensajes literales |
| `ResumoProcesso` | fin de procesos | tarjeta de contadores y totales |
| `TabelaPaginada` | listas e informes | orden, búsqueda, paginación; CPF siempre enmascarado |

**Pantalla 4.1 — Lista `/programas`**
Columnas: Código · Nome · Sigla · Tipo · Situação · Valor base (R$). Búsqueda por código/nombre, con paginación. Botón **Novo programa**. Sin registros: mensaje + acción principal.

**Pantalla 4.2 — Inclusión `/programas/novo`** (legado: CADASTRO PROGRAMAS SOCIAIS + DADOS DO PROGRAMA)

| Campo | Componente | Legado | Validación |
|---|---|---|---|
| Código do programa | `Codigo(4)` | COD PROGRAMA (N4) | obligatorio, único |
| Nome | texto (60) | NOME | |
| Tipo | `Select` A=Assistencial · P=Previdenciário · T=Trabalho | TIPO (A1) | |
| Valor base | `Moeda` | VLR BASE (N9.2) | nota: "será gravado ajustado pelo fator K" |
| Código de elegibilidade | texto (5) | COD ELEGIBIL | ayuda: pos.1 R = exige NIS; pos.2 D = exige dependentes |
| Data início | `DataLegada` | DT INICIO | |
| Data fim | `DataLegada` (vacío = indeterminado → 0) | DT FIM | |
| Renda máxima | `Moeda` (0 = sem limite) | RENDA MAXIMA | |
| Idade mínima / máxima | numérico (3) (0 = sem limite) | IDADE MINIMA/MAXIMA | |
| Fator de reajuste | `Fator(4)` | FATOR REAJUSTE (N3.4) | |

Tras grabar se muestra `ResultadoLegado` con "PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO: R$ …".

**Pantalla 4.3 — Consulta `/programas/[cod]`**
Ficha con código, nombre, tipo, valor base, elegibilidad y situación (FR-PRG-01). Código inexistente → "PROGRAMA NAO ENCONTRADO" en el panel. Tiene dos secciones editables en línea:
- **Faixas de cálculo** (máx. 5): Renda início · Renda fim · Fator multiplicador · Valor adicional · Acumulativo (S/N).
- **Parâmetros regionais** (máx. 6): Código região · Fator regional · Complemento · Ativo (S/N).
- Aviso fijo (badge `warning`): "Parâmetros informativos — o cálculo usa as tabelas legadas (D1)".
- No hay botones de alterar ni excluir el programa.

**Patrones de interacción**
- **Formulario de proceso:** entrada arriba → botón de acción → panel de resultado debajo, sin salir de la página. El resultado permanece hasta la próxima ejecución.
- **Errores de validación del legado:** el mensaje literal aparece junto al campo y en el panel.
- **Validaciones acumulativas** (VALBENEF, VALDOCS, VALELEG): lista numerada completa (E2/E3).
- **Procesos masivos:** confirmación previa, progreso visible, resumen final y sin ejecuciones paralelas (E4/E6).
- **Solo lectura explícita:** pagos y auditoría no muestran botones de edición.
- **Avisos LEGACY-QUIRK visibles** donde el operador podría sorprenderse (D1, D5, D13): badge `warning` con texto corto.
- **Máscaras y conversión:** el operador nunca teclea AAAAMMDD ni centavos; la UI hace la conversión.
- Error inesperado del servidor: toast genérico, con el detalle solo en el log del servidor (sin datos personales).
- Accesibilidad: todos los campos con `<label>`, errores vinculados con `aria-describedby`, navegación completa por teclado (Enter envía el formulario), contraste AA y estados que no dependen solo del color.

**Flujo F1 — Alta de programa**
`/programas` → **Novo programa** → formulario → Gravar → mensaje de éxito con valor ajustado → ficha `/programas/[cod]` → (opcional) cargar faixas y parâmetros regionais.

## Cross-Story Dependencies

- Depende de Epic 0: esquema Prisma, utilidades de dominio y `registrarEvento` (ya en el repo).
- El layout, la barra lateral y los componentes de campo creados aquí serán reutilizados por E2–E7. Conviene diseñarlos genéricos (`CpfInput`, `NisInput` y `Competencia` no se usan en E1, pero pertenecen al mismo kit).
- E2 elige el programa del beneficiario desde un `Select` de programas. E3 consume `codElegibilidade`, `rendaMaxPercap`, `idadeMin/Max` y `tipoPrograma`. E4 aplica `vlrBaseIndividual × (1 + fatorReajuste)` (D8) y **no** usa faixas ni parámetros regionales (D1).
