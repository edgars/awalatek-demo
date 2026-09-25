# Epic 7 Context: Informes y auditoría

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica entrega los tres informes de solo lectura de SIFAP. Equivalen a los programas legados RELPGT (informe analítico de pagos por período, con corte de control por programa), BATCHREL (consolidado mensual por región, status y totales generales) y RELAUDIT (trilla de auditoría con filtros). Son la etapa final del ciclo mensual: el gestor revisa lo que generaron el lote (E4), la corrección (E5) y la conciliación (E6), y el auditor consulta la trilla inmutable. Los informes no modifican datos. Tienen que reproducir el legado en filtros, cortes, descripciones truncadas, máscara de CPF y totales, incluidos los LEGACY-QUIRK D10 (agrupación de regiones) y D11 (el consolidado redondea, el cálculo trunca). La salida impresa de 66 líneas por página se traduce a paginación en pantalla más una versión imprimible equivalente.

## Stories

- Story 7.1: Informe analítico de pagos
- Story 7.2: Informe consolidado mensual
- Story 7.3: Informe de auditoría

## Requirements & Constraints

Convenciones: las etiquetas y descripciones entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes, con el truncado del legado, p. ej. `CANCELAD`). Las tablas RK completas por historia están en `docs/stories/7-*.md` (7 + 9 + 16 reglas). Abajo va el texto del PRD sin modificar.

### FR-REL — Informes de pagos · Stories 7.1 y 7.2

**FR-REL-01 — Informe analítico de pagos (RELPGT): filtros**
Competencia inicial y final; programa (0 = todos).

**FR-REL-02 — Subtotales por programa**
Corte de control por programa con subtotal de bruto, líquido y cantidad; total general al final.

**FR-REL-03 — Descripciones y máscara**
Tipo: N=NORMAL, D=DECIMO, T=TERCEIRO. Status: G=GERADO, P=PAGO, C=CANCELAD,
D=DEVOLVID, E=ESTORNAD. CPF enmascarado `***.XXX.XXX-XX`; nombre (30 car.) y UF del beneficiario.

**FR-REL-04 — Paginación**
66 líneas por página con cabecera (versión web: paginado equivalente + exportación imprimible).

**FR-REL-05 — Informe consolidado mensual (BATCHREL)**
Entrada: competencia. Totales por región, por status y generales.

**FR-REL-06 — Agrupación por región ⚠ LEGACY-QUIRK D10**
Código región 1–5 NORTE · 6–10 NORDESTE · 11–15 SUDESTE · 16–20 SUL · resto CENTRO-OESTE.

**FR-REL-07 — Redondeo del bruto ⚠ LEGACY-QUIRK D11**
En este informe el bruto se **redondea** (+0,005 y trunca) antes de sumar, a
diferencia del cálculo, que trunca.

**FR-REL-08 — Totales por status**
G=GERADO, P=PAGO, C=CANCELADO, D=DEVOLVIDO, E=ESTORNADO; otro cuenta como GERADO.

### FR-AUD — Informe de auditoría (RELAUDIT) · Story 7.3

**FR-AUD-01 — Informe de auditoría (RELAUDIT): valores por defecto**
Salida vacía → T (pantalla). Fecha inicial vacía → 19970101. Fecha final vacía → hoy.

**FR-AUD-02 — Rango de fechas**
Solo eventos con fecha entre inicial y final.

**FR-AUD-03 — Exclusiones ocultas**
Eventos de acción `EX` **nunca** se muestran (cuentan como filtrados).

**FR-AUD-04 — Filtros opcionales**
Acción, usuario y tabla: si informados, filtran por igualdad.

**FR-AUD-05 — Conteo por acción**
IN=INCLUSAO, AL=ALTERACAO, CO=CONCILIACAO, CN=CONSULTA, DV=DIVERGENCIA, otro=OUTRA.
Resumen: total, exhibidos, filtrados y conteo por acción.

**FR-AUD-06 — Salida pantalla / impresión**
Pantalla (T): fecha, hora HH:MM:SS, usuario, acción, tabla, clave. Impresión (I):
además la descripción. Paginación de 66 líneas.

**FR-AUD-07 — Auditoría inmutable**
La auditoría solo la escribe el sistema (hoy: conciliación, acciones CO/DV). No
hay alta, edición ni borrado por la UI.

### LEGACY-QUIRK de la épica (decisión: replicar y marcar `// LEGACY-QUIRK(Dn)`)

- **D10 — La agrupación de regiones del informe difiere del DDM (FR-REL-06).** El DDM describe `COD-REGIAO` como `01-05 OU 99` (5 macrorregiones), pero BATCHREL agrupa códigos 1–25 de a 5 (como la tabla por UF de CALCBENF). Se replica el código: 1–5, 6–10, 11–15, 16–20 y **todo lo demás** (21–25, 99, 0, beneficiario inexistente) → CENTRO-OESTE.
- **D11 — El informe redondea y el cálculo trunca (FR-REL-07).** El bruto de cada pago se pasa por `money.redondear()` (+0,005 y truncar a 2) **antes** de sumarse a los totales por región y al total general. Descuento y líquido se suman sin redondeo. Nota: como `vlrBruto` ya tiene 2 decimales (centavos enteros), el redondeo no cambia el valor en la práctica. Igual hay que implementarlo y testearlo tal cual, con el comentario.

### No funcionales aplicables

- CPF siempre enmascarado en informes (LGPD). Los datos personales nunca van a logs.
- Dinero en `Decimal`/centavos, nunca `float`. Mensajes y etiquetas del legado literales.
- La auditoría es append-only: no hay pantalla ni API de alta, edición ni borrado (FR-AUD-07, ADR-009).
- Cada regla `RK-…` vive en `src/domain` con `// RK-… (PROG:línea)` y tiene al menos un test. Con el MCP de RNC conectado, verificar con `getRule` antes de cerrar la historia.

## Technical Decisions

### Extractos exactos del fuente legado

**RELPGT** (informe analítico; `#MAX-LINHAS = 66`, `#LINHA` arranca en 99 para forzar la cabecera en el primer detalle):
```natural
READ PAGAMENTO-V BY COMPETENCIA = #COMP-INI            /* orden por competencia (descriptor) */
  IF COMPETENCIA > #COMP-FIM  ESCAPE BOTTOM            /* RELPGT:83 */
  IF #COD-PROG-FILTRO NE 0 AND COD-PROGRAMA NE #COD-PROG-FILTRO  ESCAPE TOP   /* :87 */
  IF COD-PROGRAMA NE #PROG-ANT AND #PROG-ANT NE 0      /* :93 corte de control */
    PERFORM IMPRIME-SUBTOTAL ; zera #SUB-BRUTO, #SUB-LIQ, #QTD-SUB
  MOVE COD-PROGRAMA TO #PROG-ANT
  FIND BENEFICIARIO-V WITH CPF = CPF-BENEF → SUBSTR(NOME,1,30), UF   /* no encontrado → blancos */
  #CPF-MASK = '***.' + CPF(4,3) + '.' + CPF(7,3) + '-' + CPF(10,2)    /* CPF como A11 con ceros */
  TIPO-PGTO   N NORMAL · D DECIMO · T TERCEIRO · otro OUTRO                     /* :116 */
  STATUS-PGTO G GERADO · P PAGO · C CANCELAD · D DEVOLVID · E ESTORNAD · otro OUTRO   /* :128 */
  IF #LINHA >= (#MAX-LINHAS - 5)  PERFORM IMPRIME-CABECALHO                      /* :144 */
  detalle: COMPETENCIA · CPF-MASK · NOME(30) · UF · BRUTO · DESCONTO · LIQUIDO · STS · TIPO ; ADD 1 TO #LINHA
  total: bruto, desc, liq, ABONO, qtd ; subtotal: bruto, liq, qtd (sin descuento)
IF #PROG-ANT NE 0  PERFORM IMPRIME-SUBTOTAL                                      /* :173 */
'TOTAL GERAL   QTD:' · '   BRUTO:' · '   DESC:' · '   LIQ:'  y  'TOTAL ABONO:'
IMPRIME-CABECALHO: 'SIFAP - RELATORIO ANALITICO DE PAGAMENTOS' 'PAG:' n / 'PERIODO:' ini 'A' fim 'DATA:' hoy ; #LINHA = 6
IMPRIME-SUBTOTAL: '  SUBTOTAL PROGRAMA:' prog '  QTD:' '  BRUTO:' '  LIQ:' ; ADD 3 TO #LINHA
```
- Paginación: nueva página cuando `linha >= 61`. La cabecera deja `linha = 6`, así que caben 55 líneas de detalle por página, menos 3 por cada subtotal impreso. Sin registros no se imprime cabecera, pero sí el total general en cero.
- El corte es por **cambio de programa entre registros consecutivos** en el orden de lectura, no por un agrupamiento global. Si el orden es competencia → programa, el mismo programa puede tener varios subtotales (uno por cada tramo contiguo) y el último programa de una competencia se funde con el primero de la siguiente si coinciden. `codPrograma` es `String(4)` en el schema. "0/vacío = todos" en el filtro, y el `#PROG-ANT NE 0` del legado equivale a "hay un programa anterior". El orden secundario dentro de la competencia no está definido en el legado (orden físico). La historia pide competencia/programa: usar `anoMesRef, codPrograma, numPagamento` y marcar `TODO(review)`.
- La máscara de RELPGT **no** es la de D7 (CONSBENF). Vive en `src/domain/cpf.ts` (hoy solo tiene módulo 11). Usa el CPF de 11 dígitos con ceros a la izquierda.

**BATCHREL** (consolidado; una sola cabecera, sin control de paginación):
```natural
READ PAGAMENTO-V BY COMPETENCIA = #COMPETENCIA
  IF COMPETENCIA NE #COMPETENCIA  ESCAPE BOTTOM                  /* BATCHREL:106 */
  #COD-REG = 0 ; FIND BENEFICIARIO-V WITH CPF → COD-REGIAO
  1–5 → 1 · 6–10 → 2 · 11–15 → 3 · 16–20 → 4 · resto → 5        /* :117/120/123/126 — D10 */
  #VLR-ARR = VLR-BRUTO + 0.005 ; #VLR-TEMP(N15) = #VLR-ARR*100 ; #VLR-ARR = #VLR-TEMP/100   /* :137-139 — D11 */
  región: += #VLR-ARR (bruto), DESCONTO, LIQUIDO, qtd
  DECIDE STATUS-PGTO G→1 P→2 C→3 D→4 E→5 NONE→1                 /* :146 */
  status: += VLR-BRUTO (¡sin redondear!), qtd
  general: += #VLR-ARR, DESCONTO, LIQUIDO, qtd
```
- Nombres: regiones `NORTE`, `NORDESTE`, `SUDESTE`, `SUL`, `CENTRO-OESTE`. Status `GERADO`, `PAGO`, `CANCELADO`, `DEVOLVIDO`, `ESTORNADO` (completos, a diferencia de RELPGT).
- Salida: 'SIFAP - RELATORIO CONSOLIDADO MENSAL' 'PAG:' / 'COMPETENCIA:' 'DATA:'. Luego 'RESUMO POR REGIAO' (las 5 filas siempre, `QTD/BRUTO/DESC/LIQ`), 'RESUMO POR STATUS' (5 filas, `QTD/BRUTO`) y 'TOTAL GERAL  QTD:' '  BRUTO:' '  DESC:' '  LIQ:'.
- El bruto por status usa el valor **crudo**. El de región y el general usan el redondeado. Mantener esa asimetría.

**RELAUDIT** (auditoría):
```natural
IF #TIPO-SAIDA = ' ' → 'T' ; IF #DT-INI = 0 → 19970101 ; IF #DT-FIM = 0 → #DT-HOJE      /* :80/84/87 */
READ AUDITORIA-V BY DT-EVENTO
  IF DT-EVENTO < #DT-INI  ESCAPE TOP ; IF DT-EVENTO > #DT-FIM  ESCAPE BOTTOM           /* :93/96 */
  ADD 1 TO #QTD-TOTAL                                    /* total = eventos dentro del rango */
  IF ACAO = 'EX' → filtrados+1, ESCAPE TOP               /* :105 — antes que cualquier filtro */
  IF #ACAO-FILTRO NE ' ' AND ACAO NE filtro → filtrados+1   /* :111-112 */
  IF #USUARIO-FILTRO NE ' ' AND USUARIO NE filtro → filtrados+1   /* :119-120 */
  IF #TABELA-FILTRO NE ' ' AND TABELA-REF NE filtro → filtrados+1 /* :127-128 */
  ADD 1 TO #QTD-EXIBIDOS
  DECIDE ACAO IN INCLUSAO · AL ALTERACAO · CO CONCILIACAO · CN CONSULTA · DV DIVERGENCIA · NONE OUTRA   /* :137 */
  #HR-FORMAT = HR(1,2) ':' HR(3,2) ':' HR(5,2)           /* HR-EVENTO N6 → A6 con ceros: hrEvento Int → padStart(6,'0') */
  IF #LINHA >= (#MAX-LINHAS - 5)  PERFORM IMPRIME-CAB-AUDIT                            /* :164 */
  T: DT-EVENTO HR USUARIO ACAO-DESC TABELA-REF CHAVE-REF ; I: + DESCRICAO             /* :169 */
IMPRIME-CAB-AUDIT: 'SIFAP - TRILHA DE AUDITORIA' 'PAG:' / 'PERIODO:' ini 'A' fim 'DATA:' ; #LINHA = 7   /* :210 */
```
- Resumen literal: 'RESUMO AUDITORIA', 'TOTAL REGISTROS....:', 'EXIBIDOS...........:', 'FILTRADOS..........:', 'POR TIPO ACAO:', '  INCLUSOES........:', '  ALTERACOES.......:', '  CONSULTAS........:', '  CONCILIACOES.....:', '  DIVERGENCIAS.....:', '  OUTRAS...........:'.
- Paginación: cabecera con `linha = 7`, así que caben 54 detalles por página. Cabecera T de 100 guiones y columnas `DATA HORA USUARIO ACAO TABELA CHAVE`. Cabecera I de 120 guiones, con `DESCRICAO`.
- Columnas en el schema: `dtEvento`, `hrEvento`, `usrEvento`, `codAcao`, `tipoEntidade` (TABELA-REF), `idEntidade` (CHAVE-REF) y `desAcao` (DESCRICAO). Índice por `dtEvento`. Orden secundario (hora/`numAuditoria`): no definido en el legado, dejar `TODO(review)`. Igualdad de filtros alfanuméricos: comparar sin espacios finales (semántica de campo A de Natural).

### Estructura y datos

- Dominio puro: `src/domain/relatorios/` (o equivalente) con funciones que reciben filas ya leídas y devuelven líneas, subtotales, totales y páginas. Ahí viven los mapas de descripción, la agrupación D10, el redondeo D11, los contadores y la paginación. `src/server/relatorios.ts` solo consulta con Prisma (`Pagamento` + `Beneficiario` por `numCpf`, `Auditoria`) y delega.
- `Pagamento`: `anoMesRef` (AAAAMM), `codPrograma`, `numCpf`, `vlrBruto`/`vlrDescontoTotal`/`vlrLiquido`/`vlrAbono` en centavos `Int`, `tipoPgto` N/D/T, `sitPagamento` G/P/C/D/E. Solo existe el índice `(numCpf, anoMesRef)`. `Beneficiario.codRegiao` es `Int` (1–25 o 99), `nomeCompleto`, `uf`.
- Fechas `Int` AAAAMMDD/AAAAMM: "hoy" = `hoje().data` (inyectable en tests). La UI convierte con `DataLegada`/`Competencia`.
- Entradas validadas con zod en Route Handlers y Server Actions. Informes solo por GET/consulta, sin mutaciones.

### Código reutilizable existente

- `src/domain/money.ts`: `redondear` (**D11**, +0,005 y truncar, solo para el consolidado), `truncar`, `dec`, `deCentavos`/`aCentavos`, `formatarReais` (centavos → `R$ 1.234,56`), tipo `Dinheiro`. `decimal.js` no se importa fuera de este módulo.
- `src/domain/legacyDate.ts`: `competenciaParaInt`/`intParaCompetencia`, `dataParaInt`/`intParaData`, `hoje()` (TZ America/Sao_Paulo; devuelve `{data, hora}`).
- `src/server/db.ts`: `prisma`, `createPrismaClient(url)` (tests con base temporal).
- `src/server/auditoria.ts`: `ACOES_AUDITORIA` (IN/AL/CO/CN/DV/EX) y `registrarEvento` (append-only). Es el único escritor. El informe solo lee: usar `registrarEvento` para sembrar eventos en los tests.
- Kit de UI de la historia 1.1: shadcn/ui en `src/components/ui/*` (alert, badge, button, card, input, label, select, table) y campos en `src/components/campos/*` (`Moeda`, `Fator`, `DataLegada`, `Codigo`, `ResultadoLegado`, **`TabelaPaginada`**: orden, búsqueda, paginación, CPF siempre enmascarado). `Competencia` y `ResumoProcesso` se crean ahí si todavía no existen. Layout con barra lateral: grupo **Relatórios**.

## UX & Interaction Patterns

La UI está en pt-BR y las etiquetas y descripciones del legado se muestran literales. Las pantallas son de solo lectura: filtros arriba, resultado debajo, sin salir de la página. El operador nunca teclea AAAAMMDD.

- **4.18 Relatório de pagamentos `/relatorios/pagamentos`:** filtros Competência inicial · Competência final · Programa (0/vacío = todos). Tabla con corte por programa: Competência · CPF (`***.XXX.XXX-XX`) · Nome (30) · UF · Bruto · Desconto · Líquido · Tipo · Situação. Subtotal por programa y total general. Botón **Versão para impressão** (66 linhas/página).
- **4.19 Relatório consolidado `/relatorios/consolidado`:** filtro Competência. Tres bloques: **Por região** (Norte, Nordeste, Sudeste, Sul, Centro-Oeste: qtd, bruto, desconto, líquido), **Por situação** (Gerado, Pago, Cancelado, Devolvido, Estornado: qtd, bruto) y **Totais gerais**.
- **4.20 Relatório de auditoria `/relatorios/auditoria`:** filtros Data inicial (default 01/01/1997) · Data final (default hoje) · Ação (`Select` IN/AL/CO/CN/DV, vacío = todas) · Usuário (8) · Tabela (15) · Saída (T = tela, I = impressão). Tabla: Data · Hora (HH:MM:SS) · Usuário · Ação · Tabela · Chave (+ Descrição en salida I). Resumen por acción al pie.
- **Flujo F7 — Auditoría:** `/relatorios/auditoria` → filtros → tabla + resumen por acción → versión para impresión.
- **F5, paso 5:** tras la conciliación, `/relatorios/consolidado` y `/relatorios/pagamentos` de la competencia.
- Solo lectura explícita: sin botones de edición en auditoría ni en pagos. Lista vacía → mensaje de estado vacío. Error inesperado → toast genérico, sin datos personales en el log.
- Accesibilidad: `<label>` en cada filtro, Enter envía, contraste AA, badges con texto.

## Cross-Story Dependencies

- **Dentro de la épica:** las tres historias son independientes. Comparten la paginación de 66 líneas (una utilidad de dominio para 7.1 y 7.3, con distinta línea inicial tras la cabecera: 6 y 7), las descripciones de status (truncadas en 7.1, completas en 7.2) y `TabelaPaginada`.
- **De otras épicas:** los pagos vienen de E4 (cálculo/lote, status `G`, `tipoPgto`, `vlrAbono`), E5 (corrección) y E6 (conciliación: status P/D/E y auditoría CO/DV, hoy el único escritor real de `Auditoria`). `Beneficiario` (E2) aporta nombre, UF y `codRegiao`. El kit de UI y el layout vienen de la historia 1.1. En los tests, sembrar pagos y eventos directamente si esas épicas todavía no están hechas.
