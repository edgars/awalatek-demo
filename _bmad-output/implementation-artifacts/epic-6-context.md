# Epic 6 Context: Conciliación bancaria

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica procesa el archivo de retorno CNAB 240 del Banco do Brasil y lo concilia contra los pagos que generó SIFAP. Equivale al programa legado BATCHCON. Cada registro de detalle del retorno se busca en `Pagamento` por número de documento, CPF y competencia, y se compara el valor. Si el valor difiere, el registro se informa y se audita (`DV`). Si coincide, se actualiza el status del pago según el código de retorno y se audita (`CO`). Es el paso 4 del ciclo mensual de pagos y el único proceso que hoy escribe auditoría. Tiene que reproducir el legado exactamente: posiciones, conversión de valor, umbral de divergencia, mensajes literales y contadores.

## Stories

- Story 6.1: Conciliación de retorno CNAB 240

## Requirements & Constraints

Convenciones: los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes). La tabla RK completa (9 reglas) está en `docs/stories/6-1-conciliación-de-retorno-cnab-240.md`. Abajo va el texto del PRD sin modificar.

**FR-CNB-01 — Lectura del retorno CNAB 240 (Banco do Brasil)**
Entrada: competencia + archivo de retorno. Solo registros de detalle (tipo = '3',
posición 8). Campos: CPF 44–54, valor 120–134 (en centavos, ÷100), fecha de pago
140–147, número de documento 74–83, código de retorno 231–232.
*Reglas (2):* RK-7747831dca9a (BATCHCON:116) · RK-1121c69fbbdb (BATCHCON:132)

**FR-CNB-02 — Correspondencia con el pago**
Por número de documento = número de pago **y** mismo CPF **y** misma
competencia. Si no → "NAO ENCONTRADO: CPF=… DOC=…".
*Reglas (2):* RK-3d6fe48b2bba (BATCHCON:140) · RK-31d94b6dc065 (BATCHCON:146)

**FR-CNB-03 — Divergencia de valor**
|líquido SIFAP − valor banco| > 0,01 → "DIVERGENCIA: CPF=… SIFAP=… BANCO=…" y
auditoría acción `DV` (valor anterior = líquido SIFAP, nuevo = valor banco).
*Reglas (4):* RK-8649d421b7d9 (BATCHCON:155) · RK-25bb549502ed (BATCHCON:156) · RK-46ead0f200b6 (BATCHCON:157) · RK-8c11d37225a3 (BATCHCON:160)

**FR-CNB-04 — Actualización por código de retorno**
Sin divergencia: 00 → status `P` (pago), fecha de pago, banco 1; 01 → `D`
(devuelto); 02 → `E` (estornado); otro → "COD RETORNO DESCONHECIDO: …".
Graba auditoría acción `CO` ("CONCILIADO COD RET=…"), usuario `BATCH`.
Resumen: leídos, conciliados, divergentes, no encontrados, registros de auditoría.
*Reglas (1):* RK-9af86fb5374c (BATCHCON:171)

Otras restricciones:
- La auditoría es inmutable y solo la escribe el sistema. No hay alta, edición ni borrado por la UI. `Pagamento` no tiene CRUD libre: la conciliación es uno de los pocos procesos que lo modifican.
- D15: se usan los dominios de status de pago del **código** (G/P/C/D/E), no los del DDM. Lo mismo vale para la acción de auditoría: `CO` = conciliado (el DDM dice CONSULTA).
- NFR-01: dinero en `Decimal`/centavos y nunca `float`. NFR-04: el CPF va enmascarado en las tablas de la UI y no se registran datos personales en los logs.
- Cada RK lleva un comentario `// RK-… (BATCHCON:línea)` en `src/domain` y al menos un test. Con el MCP de RNC conectado, verificar cada una con `getRule`.

## Technical Decisions

### Extracto exacto de BATCHCON

**Parse** (`SUBSTR` 1-based, `#REG-CNAB (A240)`, leído como ASCII línea por línea):
| Campo | Posición | Largo | Destino legado |
|---|---|---|---|
| Banco | 1 | 3 | `#CNAB-BANCO` (no se usa) |
| Lote | 4 | 4 | `#CNAB-LOTE` (no se usa) |
| Tipo de registro | 8 | 1 | `#CNAB-TIPO-REG`. Si es ≠ `'3'`, `ESCAPE TOP` (RK-7747831dca9a) |
| CPF | 44 | 11 | `#CNAB-CPF (A11)` → `#CPF-NUM (N11)` |
| Nº documento | 74 | 10 | `#CNAB-NUM-DOC (A10)` → `#NUM-PGTO (N10)` |
| Valor | 120 | 15 | `#CNAB-VLR (A15)` → `#VLR-RETORNO (N9.2)`, y luego `/ 100` (RK-1121c69fbbdb) |
| Fecha de pago | 140 | 8 | `#DT-PGTO (N8)`, que se graba **sin conversión** en `DT-PAGAMENTO` |
| Código de retorno | 231 | 2 | `#COD-RET (A2)` |

- `#QTD-LIDOS` se incrementa **antes** del filtro de tipo, así que cuenta todas las líneas, incluidos header y trailer.
- El valor viene en centavos, así que `÷100` da exactamente 2 decimales. En TS: `deCentavos(parseInt(valor))`, o trabajar directo en centavos. No usar `float`.
- La fecha se graba tal cual viene en el archivo. El legado no valida ni reordena, aunque el campo del BB puede venir como DDMMAAAA. Replicar y dejar `TODO(review)`.

**Correspondencia y conciliación** (BATCHCON:138-202):
```natural
FIND PAGAMENTO-V WITH NUM-PAGTO = #NUM-PGTO
  IF CPF-BENEF = #CPF-NUM AND COMPETENCIA = #COMPETENCIA  → #FOUND   /* comparación numérica */
IF NOT #FOUND → ADD 1 NAO-ENCONTRADOS; COMPRESS 'NAO ENCONTRADO: CPF=' #CNAB-CPF ' DOC=' #CNAB-NUM-DOC; ESCAPE TOP
COMPUTE #DIFF = VLR-LIQUIDO - #VLR-RETORNO ; IF #DIFF < 0 → #DIFF * -1
IF #DIFF > 0.01                                 /* estricto: 0,01 exacto concilia */
  ADD 1 DIVERGENTES; COMPRESS 'DIVERGENCIA: CPF=' #CNAB-CPF ' SIFAP=' VLR-LIQUIDO ' BANCO=' #VLR-RETORNO
  PERFORM GRAVA-AUDITORIA-DIVERG                /* el pago NO se actualiza */
ELSE
  ADD 1 CONCILIADOS                             /* también con código desconocido */
  DECIDE ON FIRST VALUE OF #COD-RET
    '00': STATUS-PGTO='P', DT-PAGAMENTO=#DT-PGTO, COD-BANCO=1, COD-RETORNO=#COD-RET
    '01': STATUS-PGTO='D', COD-RETORNO=#COD-RET    /* sin fecha ni banco */
    '02': STATUS-PGTO='E', COD-RETORNO=#COD-RET
    NONE: COMPRESS 'COD RETORNO DESCONHECIDO:' #COD-RET ' CPF=' #CNAB-CPF   /* sin update */
  PERFORM GRAVA-AUDITORIA-CONC                  /* se graba también con código desconocido */
```
- Comparar el CPF normalizado a 11 dígitos con ceros a la izquierda (`Pagamento.numCpf` es String(11)). Comparar la competencia como `Int` AAAAMM contra `anoMesRef`. El nº de documento se compara como entero contra `numPagamento`.
- En el modelo: `sitPagamento`, `dtPagamento`, `codBanco` (`"1"`) y `codRetornoBanco`. El legado **no** toca `dtConciliacao`, `sitConciliacao` ni `vlrConciliado`, así que no se inventan.
- Los mensajes van por `COMPRESS`, que separa cada operando con un blanco y quita los ceros a la izquierda de los numéricos. El formato de números en SIFAP=/BANCO= y la separación exacta quedan con `TODO(review)`. Los prefijos literales no se tocan.

**Auditoría** (subrutinas BATCHCON:238-270). Un evento por registro conciliado o divergente, con `ADD 1 TO #QTD-AUDIT`:
| Campo | CO (conciliado) | DV (divergente) |
|---|---|---|
| numAuditoria | máx.+1 (lo resuelve `registrarEvento`) | igual |
| dtEvento / hrEvento | `*DATN` / `*TIMN` tomados **una sola vez al inicio** de la ejecución | igual |
| usrEvento | `BATCH` | `BATCH` |
| codAcao | `CO` | `DV` |
| tipoEntidade | `PAGAMENTO` | `PAGAMENTO` |
| idEntidade | `#NUM-PGTO` (N10 → A20) | igual |
| desAcao | `CONCILIADO COD RET=` + código (COMPRESS) | `DIVERGENCIA VALOR SIFAP X BANCO` |
| valorAnterior / valorPosterior | no se asignan | líquido SIFAP / valor banco (N9.2 → A60) |

- Legado: en CO, los campos VLR-ANTERIOR/VLR-NOVO de la vista no se limpian y podrían arrastrar los valores del DV anterior. No replicar: grabar `null` con `TODO(review)`. El formato textual N→A de la clave y de los valores también queda con `TODO(review)`, porque ni el PRD ni la arquitectura lo fijan.
- Un registro no encontrado o de otro tipo no genera auditoría.

**Resumen final**, con etiquetas literales: `'REGISTROS LIDOS........:'`, `'CONCILIADOS............:'`, `'DIVERGENTES............:'`, `'NAO ENCONTRADOS........:'`, `'REGISTROS AUDITORIA....:'`. Encabezado: `'BATCHCON - RESUMO CONCILIACAO'`. El bloque comentado del Banco Real (banco 356) está descontinuado y **no** se porta.

### Procesos y estructura

- `src/domain/cnab240.ts` es puro. Parsea una línea y devuelve `null` si no es tipo 3. También contiene la decisión de conciliación: no encontrado, divergente o conciliado con su acción por código, los textos de los mensajes y el cálculo de la diferencia. Las RK viven ahí.
- `src/server/conciliacao.ts` orquesta. **Una transacción por registro**: update del pago + `registrarEvento(evento, tx)` juntos. El legado hacía dos `END TRANSACTION` separados; se sigue la arquitectura. Los contadores y las listas de divergencias y no encontrados se acumulan para la respuesta.
- La ruta `/conciliacao` recibe competencia + upload (texto, líneas de 240 posiciones). La entrada se valida con zod. El upload reemplaza la ruta de archivo `#ARQ-RETORNO` del legado.

### Código reutilizable existente

- `src/server/auditoria.ts`: `registrarEvento(evento, cliente?)`. Es append-only, acepta un `TransactionClient`, valida la acción (`CO`/`DV` incluidas), usa `usuario` o `SIFAP_USER` (acá hay que pasar `'BATCH'`) y **trunca como un MOVE de Natural** a las longitudes del DDM: usrEvento 8, tipoEntidade 15, idEntidade 20, desAcao 80.
- `src/domain/money.ts`: `dec`, `truncar`, `truncarCasas`, `aCentavos`, `deCentavos`, `formatarReais`. `decimal.js` solo se importa dentro de este módulo.
- `src/domain/legacyDate.ts`: `competenciaParaInt`/`intParaCompetencia`, `hoje()` (TZ America/Sao_Paulo, inyectable), `dataParaInt`/`intParaData`.
- `src/server/db.ts`: `prisma` y `createPrismaClient(url)` para tests con una base temporal.
- Kit de UI de la historia 1.1: shadcn/ui en `src/components/ui/*` (alert, badge, button, card, input, label, select, table) y los campos de `src/components/campos/*` (`Competencia`, `CpfInput`, `ResultadoLegado`, `ResumoProcesso`, `TabelaPaginada`…). Si falta alguno, se crea ahí mismo.

### Trabajo diferido que afecta a esta épica

- **Momento de auditoría provisto por el llamador:** hoy `registrarEvento` llama a `hoje()` en cada evento. BATCHCON toma `*DATN`/`*TIMN` una sola vez y graba todos los CO/DV con esa fecha y hora. Hay que extender `registrarEvento` con un momento opcional `{ data, hora }` y pasar el de inicio de la ejecución.
- **Concurrencia multi-proceso:** `numAuditoria` = máx.+1 falla (SQLITE_BUSY/P2002) con escritores en procesos o clientes distintos, por ejemplo la app y el lote por CLI. Hay que serializar o reintentar, y no permitir dos conciliaciones en paralelo.

## UX & Interaction Patterns

- **Pantalla `/conciliacao`** (legado CONCILIACAO BANCARIA): la entrada es Competência + Arquivo de retorno (upload `.ret`/`.txt`, CNAB 240), que reemplaza el campo "ARQUIVO RETORNO" (ruta) del legado. El resultado muestra `ResumoProcesso` con lidos, conciliados, divergentes, não encontrados y registros de auditoria, más dos tablas: **Divergências** (CPF enmascarado, SIFAP, banco) y **Não encontrados** (CPF, documento).
- Patrón de formulario de proceso: entrada arriba → acción → resultado debajo, sin salir de la página. El resultado se mantiene hasta la próxima ejecución. Como es un proceso masivo, pide **confirmación previa**, muestra el progreso y no se puede lanzar dos veces en paralelo.
- Si el archivo no tiene registros tipo 3, se muestra el resumen con 0 conciliados y el aviso "arquivo sem registros de detalhe". Un error inesperado se muestra como toast genérico, sin datos personales en el log.
- **Flujo F5 — paso 4:** llega el retorno del banco → `/conciliacao` → upload → revisar divergencias y no encontrados. Después vienen los informes de la competencia (E7).
- En la barra lateral va en el grupo "Processos", como Conciliação bancária.
- Accesibilidad: `<label>` en todos los campos y Enter envía el formulario. Los estados no dependen solo del color.

## Cross-Story Dependencies

- **Necesita:** pagos `Pagamento` con status `G` generados por E4 (`numPagamento`, `numCpf`, `anoMesRef`, `vlrLiquido`), o sembrados en los tests. El kit de UI y el layout vienen de la historia 1.1. El escritor de auditoría es de la historia 0.2 y hay que extenderlo con el momento del llamador.
- **Consumidores:** el detalle `/pagamentos/[num]` (4.4) muestra la conciliación (fecha de pago, código de retorno). El informe de auditoría (E7, RELAUDIT) lista los eventos CO/DV. Los informes de pagos reflejan los status P/D/E.
