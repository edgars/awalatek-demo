# Epic 4 Context: Cálculo de beneficio y pagos

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica entrega el corazón financiero de SIFAP. Equivale a los programas legados CALCBENF (cálculo individual), BATCHPGT (lote mensual) y CALCDSCT (recálculo de descuentos de un pago), más una consulta de pagos de solo lectura. Hay un **único motor de cálculo** de dominio (`src/domain/calculo/motor.ts`) que usan el cálculo individual y el lote. Tiene que reproducir el legado **al centavo**: tablas fijas, truncado mainframe en cada asignación, mensajes literales y los LEGACY-QUIRK D1, D2, D3, D8, D13, D14, D15 y D17. Los pagos generados aquí (`Pagamento`, status `G`) alimentan la corrección retroactiva (E5), la conciliación (E6) y los informes (E7). Ningún pago se crea ni se modifica fuera de estos procesos (ADR-009).

## Stories

- Story 4.1: Motor de cálculo y cálculo individual
- Story 4.2: Lote mensual de pagos
- Story 4.3: Recálculo de descuentos de un pago
- Story 4.4: Consulta de pagos (solo lectura)

## Requirements & Constraints

Convenciones: los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes). "Truncar" significa descartar a partir del 3.er decimal (padrón mainframe `×100 → entero → /100`). "Edad" = año de referencia − año de nacimiento, sin mes ni día. Las tablas RK completas por historia están en `docs/stories/4-*.md` (42 + 45 + 23 reglas). Abajo va el texto del PRD sin modificar.

### FR-CAL — Cálculo individual (CALCBENF) · Story 4.1

**FR-CAL-01 — Competencia**
Entrada: CPF + competencia AAAAMM. Mes fuera de 1–12 → "COMPETENCIA INVALIDA".

**FR-CAL-02 — Precondiciones del cálculo**
Beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO"; status ≠ A →
"BENEFICIARIO NAO ATIVO - STATUS:" + status; programa inexistente → "PROGRAMA NAO ENCONTRADO".

**FR-CAL-03 — Factor regional ⚠ LEGACY-QUIRK D1**
Región 1–25 → tabla fija por UF (AC 1,35 · AM 1,32 · AP 1,30 · PA 1,28 · RO 1,31 ·
MA 1,40 · PI 1,38 · CE 1,35 · BA 1,32 · PE 1,36 · SP 1,10 · RJ 1,12 · MG 1,08 ·
ES 1,05 · (15) 1,00 · PR 1,05 · SC 1,07 · RS 1,03 · MS 1,15 · MT 1,20 · GO 1,18 ·
TO 1,25 · DF 1,10 · RR 1,22 · SE 1,33); otra región → 1,0000.

**FR-CAL-04 — Factor familiar**
0 dep. → 1,00; 1–2 → 1,00 + n × 0,05; 3–4 → 1,10 + (n − 2) × 0,03; ≥ 5 → 1,16 + (n − 4) × 0,02.

**FR-CAL-05 — Factor de renta (tramo) ⚠ LEGACY-QUIRK D1**
Primer tramo con renta ≤ tope: 300,00 → 1,00 · 600,00 → 0,85 · 1.000,00 → 0,70 ·
1.500,00 → 0,55 · 9.999,99 → 0,40. (Renta > 9.999,99: el factor queda sin asignar
en el legado — ver D17).

**FR-CAL-06 — Factor de edad**
Edad = año de la competencia − año de nacimiento. ≥ 65 → 1,15; ≥ 60 → 1,10; < 18 → 1,05; resto 1,00.

**FR-CAL-07 — Valor mensual**
`VLR-BENF = VLR-BASE × F.regional × F.familiar × F.renta × F.edad`;
luego `× (1 + FATOR-REAJ del programa)`; truncar. Tipo de pago `N`.

**FR-CAL-08 — 13.º y abono natalino (diciembre) ⚠ LEGACY-QUIRK D3**
Si mes = 12: tipo `D`; `VLR-13 = VLR-BASE × F.regional × F.edad` (truncar);
bruto = VLR-BENF + VLR-13. Programa tipo A: abono = VLR-BENF × 0,15 (truncar),
se suma al bruto; otros tipos: abono 0. Se muestran VLR-13 y abono.

**FR-CAL-09 — Descuento simplificado ⚠ LEGACY-QUIRK D13**
Bruto > 500,00 → descuento = bruto × 0,03 (truncar); si no, 0.

**FR-CAL-10 — Valor líquido y grabación**
Líquido = bruto − descuento; si < 0 → 0; truncar. Graba el pago (CPF, programa,
competencia, bruto, descuento, líquido, fecha de generación = hoy, status `G`,
tipo, abono) y muestra "CALCULO REALIZADO COM SUCESSO" con el resumen.

### FR-DSC — Recálculo de descuentos (CALCDSCT) · Story 4.3

**FR-DSC-01 — Recálculo de descuentos de un pago (CALCDSCT)**
Entrada: CPF + número de pago. Pago inexistente o de otro CPF → "PAGAMENTO NAO
ENCONTRADO"; beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO".

**FR-DSC-02 — Contribución social progresiva (obligatoria)**
Primer tramo con bruto ≤ tope: 500,00 → 3 % · 1.000,00 → 5 % · 2.000,00 → 7 % · 9.999,99 → 9 %.

**FR-DSC-03 — Tope de 30 % del bruto ⚠ LEGACY-QUIRK D2**
Tope = bruto × 0,30 (truncar). Después de procesar **cada** descuento no judicial, si
el total acumulado > tope → total = tope. Los judiciales no se limitan, pero un
no judicial posterior puede recortar el total, incluido lo judicial ya sumado.

**FR-DSC-04 — Vigencia del descuento**
Se ignora si la fecha fin ≠ 0 y < hoy, o si la fecha inicio > hoy.

**FR-DSC-05 — Tipos de descuento ⚠ LEGACY-QUIRK D14/D15**
Fuente: descuentos registrados del beneficiario. J (judicial), P (pensión
alimenticia) y A (administrativo): valor fijo si > 0; si no, bruto × pct/100.
I (impuesto retenido): bruto × pct/100. S (sindical): bruto × 1 %. Otro tipo: se ignora.

**FR-DSC-06 — Total y actualización del pago ⚠ LEGACY-QUIRK D13**
El total truncado se graba en el descuento del pago ("DESCONTOS CALCULADOS": bruto,
descuento, tope 30 %). El legado **no recalcula el líquido**.

### FR-LOT — Lote mensual (BATCHPGT) · Story 4.2

**FR-LOT-01 — Lote mensual de pagos (BATCHPGT): competencia**
Competencia = año/mes de la fecha de ejecución. Pensado para el 1.er día hábil.
Numeración: `NUM-PAGTO` secuencial a partir del mayor existente.

**FR-LOT-02 — Selección de beneficiarios**
Recorre los beneficiarios **en orden de CPF** (los sistemas posteriores dependen de este
orden). Ignora: CPF repetido, status ≠ A, pago ya generado en la competencia y
programa inactivo. Programa inexistente → error registrado
"ERRO: PROG NAO ENCONTRADO CPF=… PROG=…" y el lote sigue.

**FR-LOT-03 — Cálculo idéntico al individual**
Aplica FR-CAL-03…FR-CAL-10 (motor compartido), con la edad calculada sobre el año
de la competencia.

**FR-LOT-04 — Progreso y resumen**
Cada 1.000 pagos generados registra el progreso ("PROCESSADOS: n ULTIMO CPF: …").
Al final: competencia, procesados, generados, ignorados, errores y totales de
bruto, descuento, líquido y abono.

### Story 4.4 — Consulta de pagos
Requisito técnico, sin reglas legadas. `/pagamentos` muestra una lista paginada con filtros por CPF, competencia, programa y status. `/pagamentos/[num]` muestra el detalle, con los descuentos aplicados, la corrección y la conciliación. **No hay** endpoints ni UI para crear, editar o borrar pagos, y un e2e comprueba que los de escritura no existen.

### Decisiones LEGACY-QUIRK aplicables (replicar y marcar `// LEGACY-QUIRK(Dn)`)

| ID | Comportamiento legado | Decisión |
|---|---|---|
| D1 | Tablas de factor regional y tramos de renta **fijas en el código**, aunque el DDM tiene `GRP-PARAM-REGIONAL` / `GRP-FAIXA-CALCULO` | Replicar las tablas fijas (`tabelas.ts`). Los grupos del programa se persisten y editan, pero el motor **no** los usa |
| D2 | Tope de 30 % aplicado dentro del loop sobre el total acumulado; puede recortar lo judicial | Replicar |
| D3 | El comentario del 13.º dice "× meses activos/12"; el código no lo hace | Replicar el código (`VLR-BASE × F.reg × F.edad`) |
| D8 | VLR-BASE grabado × FATOR-K (en CADPROG) y luego × (1 + FATOR-REAJ) en el cálculo | Replicar: `vlrBaseIndividual` ya viene ajustado; el motor vuelve a aplicar `(1 + fatorReajuste)` |
| D13 | Dos algoritmos de descuento (3 % plano en cálculo/lote vs. progresivo en CALCDSCT); CALCDSCT no recalcula el líquido | Replicar ambos; `/descontos` no toca `vlrLiquido` |
| D14 | CALCDSCT lee los descuentos del beneficiario; el DDM los ubica en el pago | Registrados → `BeneficiarioDesconto` (origen); aplicados → `PagamentoDesconto` (una fila por descuento procesado) |
| D15 | Dominios divergentes entre código y DDM | Usar los del **código**: tipo de descuento C/I/J/S/P/A (el DDM dice IR/JD/CS/…); status de pago G/P/C/D/E; tipo de pago N/D/T |
| D17 | Renta > 9.999,99 no encaja en ningún tramo y el factor de renta no se asigna | Individual → factor 0 (beneficio mensual 0). Lote → **arrastra el factor del beneficiario anterior** (`fatorRendaAnterior`) con `TODO(review)` |

### No funcionales

- **NFR-01 Dinero:** `Decimal` en todo el stack; truncado a 2 decimales con una utilidad única; `float` prohibido para valores.
- **NFR-03 Regresión de cálculo:** suite de casos derivados del fuente (factores, 13.º, abono, descuentos, tope) que valida resultados al centavo (`tests/regression/`). Casos mínimos: cada factor; diciembre con programa A y no A; descuento > 500 y ≤ 500; líquido negativo → 0. En descuentos: solo contribución; judicial + no judicial que dispara el tope; descuento fuera de vigencia; tipo desconocido ignorado. Lote re-ejecutado en la misma competencia no duplica.
- Cada regla tiene un comentario `// RK-… (PROG:línea)` en `src/domain` y al menos un test. Con el MCP de RNC conectado, verificar cada RK con `getRule`.

## Technical Decisions

### Semántica de truncado de Natural (crítico para la equivalencia al centavo)

Un `COMPUTE` o `MOVE` de Natural sin `ROUNDED` **trunca al asignar** según la precisión del campo destino. Los intermedios de la expresión se calculan con precisión amplia. En TS: calcular exacto con `Decimal` y **truncar en cada asignación**, no solo al final.
- Destino **N9.2** (todos los `#VLR-*`, `#VLR-DSCT-ITEM`, `#VLR-MAX-DSCT`) → truncar a 2 decimales (`money.truncar`).
- Destino **N3.4** (`#FATOR-*`) → truncar a 4 decimales. Los valores de las tablas y de FR-CAL-04 ya son exactos con 4 decimales.
- Destino **N11** (`#VLR-TEMP`) → entero. El par `×100 / 100` que sigue a cada cálculo es el truncado explícito y equivale a truncar a 2.
- Consecuencia: `VLR-BENF` se trunca **dos veces**, primero tras el producto de los 4 factores (línea 225, destino N9.2) y otra vez tras `× (1 + FATOR-REAJ)` (línea 229). Cada ítem de descuento de CALCDSCT se trunca al asignarse a `#VLR-DSCT-ITEM` **antes** de acumularse, y el total se vuelve a truncar al final.
- Enteros: `#ANO = #COMPETENCIA / 100` y `#ANO-NASC = DT-NASCIMENTO / 10000` truncan (N4). Usar `anoDe()` / `idadePorAno()`.
- Hoy `money.truncar` solo trunca a 2 decimales. Si hace falta truncar a 4 o a 6, agregar la función **dentro de `money.ts`**, porque `decimal.js` no se importa fuera de ese módulo.

### Extractos exactos del fuente legado

**Tabla de factores regionales** (CALCBENF:91-117, idéntica en BATCHPGT:124-150). `#TAB-REG (N3.4/27)`. Comentario del legado: "REGIOES: 01-05=NORTE 06-10=NORDESTE 11-15=SUDESTE 16-20=SUL 21-25=C.OESTE 99=ESPEC".

| Reg | UF | Factor | Reg | UF | Factor | Reg | UF | Factor |
|---|---|---|---|---|---|---|---|---|
| 1 | AC | 1.3500 | 10 | PE | 1.3600 | 19 | MS | 1.1500 |
| 2 | AM | 1.3200 | 11 | SP | 1.1000 | 20 | MT | 1.2000 |
| 3 | AP | 1.3000 | 12 | RJ | 1.1200 | 21 | GO | 1.1800 |
| 4 | PA | 1.2800 | 13 | MG | 1.0800 | 22 | TO | 1.2500 |
| 5 | RO | 1.3100 | 14 | ES | 1.0500 | 23 | DF | 1.1000 |
| 6 | MA | 1.4000 | 15 | REF | 1.0000 | 24 | RR | 1.2200 |
| 7 | PI | 1.3800 | 16 | PR | 1.0500 | 25 | SE | 1.3300 |
| 8 | CE | 1.3500 | 17 | SC | 1.0700 | 26–27 | RESERVA | 1.0000 (no se usan) |
| 9 | BA | 1.3200 | 18 | RS | 1.0300 | | | |

```natural
IF #COD-REG >= 1 AND #COD-REG <= 25        /* CALCBENF:180 */
  MOVE #TAB-REG(#COD-REG) TO #FATOR-REG
ELSE
  MOVE 1.0000 TO #FATOR-REG                 /* incluye región 99 y 0 */
```

**Tramos de renta** (CALCBENF:120-129; `#FAIXA-RENDA (N9.2/5)`, `#FATOR-FAIXA (N3.4/5)`): 300.00→1.0000 · 600.00→0.8500 · 1000.00→0.7000 · 1500.00→0.5500 · 9999.99→0.4000.

```natural
DEFINE SUBROUTINE DET-FAIXA-RENDA            /* CALCBENF:303-311 */
  FOR #J = 1 TO 5
    IF #RENDA <= #FAIXA-RENDA(#J)
      MOVE #FATOR-FAIXA(#J) TO #FATOR-RND
      ESCAPE BOTTOM
    END-IF
  END-FOR                                    /* renta > 9999.99: #FATOR-RND no se toca (D17) */
```

**Factor familiar y edad** (CALCBENF:187-219):
```natural
IF #NUM-DEP = 0  MOVE 1.0000 TO #FATOR-FAM
ELSE IF #NUM-DEP <= 2  COMPUTE #FATOR-FAM = 1.0000 + (#NUM-DEP * 0.0500)
ELSE IF #NUM-DEP <= 4  COMPUTE #FATOR-FAM = 1.1000 + ((#NUM-DEP - 2) * 0.0300)
ELSE                   COMPUTE #FATOR-FAM = 1.1600 + ((#NUM-DEP - 4) * 0.0200)
COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000
COMPUTE #IDADE = #ANO - #ANO-NASC           /* #ANO = año de la competencia */
>= 65 → 1.1500 ; >= 60 → 1.1000 ; < 18 → 1.0500 ; resto 1.0000
```

**Cálculo principal, 13.º, abono, descuento y líquido** (CALCBENF:225-273; BATCHPGT:280-320 es idéntico):
```natural
COMPUTE #VLR-BENF = #VLR-BASE * #FATOR-REG * #FATOR-FAM
                     * #FATOR-RND * #FATOR-IDADE        /* trunca N9.2 */
COMPUTE #VLR-BENF = #VLR-BENF * (1 + #FATOR-REAJ)       /* trunca N9.2 */
COMPUTE #VLR-TEMP = #VLR-BENF * 100                     /* N11 */
COMPUTE #VLR-BENF = #VLR-TEMP / 100
MOVE #VLR-BENF TO #VLR-BRUTO
MOVE 'N' TO #TIPO-PGTO
IF #MES = 12
  MOVE 'D' TO #TIPO-PGTO
  COMPUTE #VLR-13 = #VLR-BASE * #FATOR-REG * #FATOR-IDADE   /* D3: sin meses/12 */
  (truncar ×100/100)
  COMPUTE #VLR-BRUTO = #VLR-BENF + #VLR-13
  IF #TIPO-PROG = 'A'
    COMPUTE #VLR-ABONO = #VLR-BENF * 0.15                    /* base = VLR-BENF, no el bruto */
    (truncar ×100/100)
    COMPUTE #VLR-BRUTO = #VLR-BRUTO + #VLR-ABONO
  ELSE
    MOVE 0 TO #VLR-ABONO
* descuento simplificado (subrutina CALC-DESCONTOS, CALCBENF:315-323)
MOVE 0 TO #VLR-DESC
IF #VLR-BRUTO > 500.00
  COMPUTE #VLR-DESC = #VLR-BRUTO * 0.03   (truncar)
COMPUTE #VLR-LIQ = #VLR-BRUTO - #VLR-DESC
IF #VLR-LIQ < 0  MOVE 0 TO #VLR-LIQ
(truncar ×100/100)
```
Nota: el descuento del 3 % se aplica sobre el bruto **con** 13.º y abono. En diciembre con renta > 9.999,99 (factor 0) el bruto = VLR-13, porque el 13.º no depende del factor de renta.

**Tabla de contribución social** (CALCDSCT:58-65; `#FAIXA-CONTRIB (N9.2/4)`, `#ALIQ-CONTRIB (N3.2/4)`): 500.00→0.03 · 1000.00→0.05 · 2000.00→0.07 · 9999.99→0.09. Bruto > 9.999,99 no encaja en ningún tramo y queda **sin contribución**.

**Loop de CALCDSCT** (CALCDSCT:96-176):
```natural
MOVE 0 TO #VLR-TOTAL-DSCT
PERFORM CALC-CONTRIB-SOCIAL      /* #VLR-DSCT-ITEM = BRUTO * ALIQ (trunca N9.2); ADD al total */
COMPUTE #VLR-MAX-DSCT = #VLR-BRUTO * 0.30   (truncar)
FOR #IDX = 1 TO C*DESCONTOS                  /* PE del beneficiario, en orden de occurrence */
  IF DT-FIM-DSCT(#IDX) NE 0 AND DT-FIM-DSCT(#IDX) < #DT-HOJE  ESCAPE TOP
  IF DT-INICIO-DSCT(#IDX) > #DT-HOJE                           ESCAPE TOP
  DECIDE ON FIRST VALUE OF #TIPO-DSCT
    'J','P','A': IF VLR-DSCT > 0 → VLR-DSCT  ELSE  #VLR-BRUTO * (PCT-DSCT / 100)
    'I':          #VLR-BRUTO * (PCT-DSCT / 100)
    'S':          #VLR-BRUTO * 0.01
    NONE:         IGNORE                     /* incluye 'C' registrado: no suma */
  (cada ítem → #VLR-DSCT-ITEM N9.2, trunca; ADD al total)
  IF #TIPO-DSCT NE 'J'                       /* D2: corre también tras un tipo ignorado */
    IF #VLR-TOTAL-DSCT > #VLR-MAX-DSCT  MOVE #VLR-MAX-DSCT TO #VLR-TOTAL-DSCT
END-FOR
(truncar total) → PAGAMENTO.VLR-DESCONTO ; UPDATE   /* VLR-LIQUIDO sin cambios (D13) */
```
Detalles: la verificación del tope **no** corre para los descuentos saltados por vigencia (el `ESCAPE TOP` va antes), pero **sí** corre tras un tipo desconocido. "Hoy" = `hoje().data`. CALCDSCT no verifica el status del beneficiario.

**BATCHPGT**, lo específico del lote (BATCHPGT:105-110, 171-230, 323-347):
```natural
COMPUTE #ANO = #DT-HOJE / 10000
COMPUTE #MES = (#DT-HOJE - (#ANO * 10000)) / 100
COMPUTE #COMPETENCIA = (#ANO * 100) + #MES
READ PAGAMENTO-V BY NUM-PAGTO DESCENDING → #SEQ-PGTO (mayor existente); ADD 1 por pago grabado
READ BENEFICIARIO-V BY CPF
  ADD 1 TO #QTD-PROCESSADOS
  CPF = #CPF-ANT → ignorado ; STATUS NE 'A' → ignorado
  existe pago del CPF con COMPETENCIA = #COMPETENCIA → ignorado
  programa no encontrado → WRITE 'ERRO: PROG NAO ENCONTRADO CPF=' cpf 'PROG=' cod ; ADD 1 TO #QTD-ERROS
  STATUS-PROG NE 'A' → ignorado
  ... cálculo idéntico ... ; MOVE 0 TO #VLR-ABONO, #VLR-13 por iteración
  STORE ; END TRANSACTION  (STATUS-PGTO 'G', DT-GERACAO = hoy)
  ADD totales ; IF #QTD-GERADOS MOD 1000 = 0 → WRITE 'PROCESSADOS:' n 'ULTIMO CPF:' cpf
```
- D17 en el lote: `#FATOR-RND` **no** se reinicia por beneficiario. Solo se asigna en los que llegan al cálculo, porque los ignorados escapan antes. El valor arrastrado es el del último beneficiario **calculado**, y se encadena si varios seguidos superan 9.999,99. El primero del lote arrastra 0. El motor tiene que devolver el factor de renta efectivo para que el lote lo pase como `fatorRendaAnterior` al siguiente.
- El formato del resumen final es literal: 'COMPETENCIA......:', 'TOTAL PROCESSADOS:', 'PAGTOS GERADOS...:', 'IGNORADOS........:', 'ERROS............:', 'VLR TOTAL BRUTO..:', 'VLR TOTAL DESC...:', 'VLR TOTAL LIQUIDO:', 'VLR TOTAL ABONO..:'.
- El resumen de CALCBENF (literal): 'CALCULO REALIZADO COM SUCESSO', 'CPF............:', 'COMPETENCIA....:', 'VLR BRUTO......:', 'VLR DESCONTO...:', 'VLR LIQUIDO....:', 'TIPO PGTO......:'. En diciembre se agregan 'VLR 13O SALARIO:' y 'VLR ABONO......:'.
- Diferencias entre individual y lote que el fuente muestra y el PRD no menciona: CALCBENF **no** verifica el status del programa ni si ya hay un pago de la competencia, y **no** asigna NUM-PAGTO (la historia decide máx.+1). BATCHPGT no escribe auditoría, aunque la cabecera diga "INC AUDITORIA". No inventar comportamiento: si hace falta decidir, dejar `TODO(review)`.

### Procesos (casos de uso) y estructura

| Proceso | Disparo | Transacción |
|---|---|---|
| Cálculo individual (FR-CAL) | UI `/calculo` | 1 transacción: lee beneficiario + programa, graba el pago |
| Lote mensual (FR-LOT) | UI `/lote` (botón con confirmación) **y** CLI `npm run lote:pagamentos` (`scripts/lote-pagamentos.ts`; en Docker `docker compose run --rm app npm run lote:pagamentos`) | Una por beneficiario (como el `END TRANSACTION` del legado); resumen al final; nunca se regeneran pagos de la misma competencia |
| Recálculo de descuentos (FR-DSC) | UI `/descontos` | 1 transacción por pago |

- Dominio puro (sin Prisma ni Next): `src/domain/calculo/tabelas.ts` (factores D1 y contribución), `motor.ts` (FR-CAL-03..10 con la firma de la historia 4.1) y `descontos.ts` (FR-DSC con D2). Orquestación y persistencia en `src/server/calculo.ts`, `lotePagamentos.ts` y `descontos.ts`, sin lógica de negocio.
- Datos: el dinero va en `Int` centavos (convertir con `deCentavos`/`aCentavos`). Los factores y porcentajes van como `String` (`fator()`): `ProgramaSocial.fatorReajuste` (N3.4) y `BeneficiarioDesconto.pctDesconto` (N3.2). Las fechas y competencias son `Int` AAAAMMDD/AAAAMM (ADR-005).
- `Pagamento`: `numPagamento` único = máx.+1; `anoMesRef`; `vlrBruto`/`vlrLiquido`/`vlrDescontoTotal`/`vlrAbono`; `tipoPgto` N/D/T; `sitPagamento` = `G`; `dtGeracao`/`hrGeracao` = `hoje()`; `usrInclusao` = `BATCH` en el lote y `SIFAP_USER` en el individual. Índice (numCpf, anoMesRef). `vlr13` no tiene columna propia: se refleja en el bruto y se muestra en el resultado.
- `PagamentoDesconto` (máx. 8, cascada desde Pagamento): una fila por descuento procesado en FR-DSC-06.
- Entradas validadas con zod en Route Handlers y Server Actions. Mensajes del legado literales.

### Código reutilizable existente

- `src/domain/money.ts`: `dec`, `truncar` (2 dec., ROUND_DOWN), `aCentavos`, `deCentavos`, `fator`, tipo `Dinheiro`. `redondear` es solo para E7 (D11) y **no** se usa aquí.
- `src/domain/legacyDate.ts`: `competenciaParaInt`/`intParaCompetencia`, `anoDe`, `idadePorAno`, `hoje()` (TZ America/Sao_Paulo, inyectable para tests), `dataParaInt`/`intParaData`.
- `src/domain/cpf.ts`: validación módulo 11. `src/domain/quirks.ts`: flags LEGACY-QUIRK (`lerQuirks`).
- `src/server/db.ts`: `prisma`, `createPrismaClient(url)` (tests con base temporal). `src/server/auditoria.ts`: `registrarEvento(evento, cliente?)`, append-only, acepta un `TransactionClient`.
- Kit de UI de la historia 1.1 (en curso): shadcn/ui en `src/components/ui/*` y campos en `src/components/campos/*` (`Moeda`, `Fator`, `DataLegada`, `Codigo`, `ResultadoLegado`, `TabelaPaginada`), layout con barra lateral (grupo "Cálculo e Pagamentos") y base SQLite dedicada para e2e. `Competencia`, `CpfInput` y `ResumoProcesso` (DESIGN §3) se crean ahí mismo si todavía no existen.

### Trabajo diferido relevante

- `numAuditoria` y `numPagamento` usan máx.+1, que falla (SQLITE_BUSY/P2002) con escritores concurrentes en procesos distintos. Aplica al lote por CLI mientras la app graba. Serializar o reintentar, e impedir dos lotes en paralelo.
- `registrarEvento` no acepta un momento (dt/hr) del llamador. Solo importa si el lote audita con una hora única.
- Faltan tests de constraints: unique de `numPagamento`, cascada Pagamento→descontos y RESTRICT Pagamento→Beneficiario.

## UX & Interaction Patterns

La UI está en pt-BR y los mensajes del legado se muestran literales en el panel de resultado. El patrón de "formulario de proceso" es: entrada arriba → acción → resultado debajo, sin salir de la página. El operador nunca teclea AAAAMMDD ni centavos.

- **4.12 Cálculo de benefício `/calculo`:** entrada CPF do beneficiário + Competência. Resultado (`ResumoProcesso`): CPF, competência, bruto, desconto, líquido, tipo de pagamento; en diciembre también 13º y abono. Enlace al pago generado.
- **4.13 Lote mensual `/lote`:** muestra la competencia a procesar (mes actual) y cuántos pagos ya existen en ella. Botón **Executar lote** con confirmación ("Gerar pagamentos da competência AAAAMM para todos os beneficiários ativos?"). Durante la ejecución muestra el progreso (procesados / último CPF). Al final, `ResumoProcesso` con processados, gerados, ignorados, erros, totales bruto/desconto/líquido/abono y la lista de errores. No se puede lanzar dos veces en paralelo. Si el lote ya corrió en la competencia, el resumen muestra todos como ignorados, con un aviso informativo.
- **4.14 Cálculo de descontos `/descontos`:** entrada CPF + Nº do pagamento. Resultado "DESCONTOS CALCULADOS": bruto, desconto total, teto 30 % y tabla de descuentos aplicados. Aviso `warning`: "O valor líquido não é recalculado (regra legada D13)".
- **4.15 Pagamentos `/pagamentos`, `/pagamentos/[num]` (solo lectura):** lista con Nº · CPF · Programa · Competência · Bruto · Desconto · Líquido · Situação · Tipo; filtros por CPF, competência, programa y situação. El detalle muestra valores, descuentos aplicados, corrección (valor, fecha, corregido S/N) y conciliación (fecha de pago, código de retorno). Sin botones de edición. CPF siempre enmascarado en las tablas (NFR-04).
- **Flujo F5 — Ciclo mensual de pagos:**
  1. El 1.er día hábil: `/lote` → confirmar → resumen (o el job `npm run lote:pagamentos`).
  2. Revisar los errores (programa no encontrado) → corregir el cadastro → re-ejecutar (no duplica).
  3. Descuentos puntuales en `/descontos`, por pago.
  4. Conciliación (E6).
  5. Informes (E7).
- La página inicial `/` muestra el último lote ejecutado (competência, gerados, erros) y accesos rápidos a Cálculo y Lote.
- Beneficiario, programa o pago no encontrado → mensaje literal en el panel. Error inesperado → toast genérico, sin datos personales en el log.

## Cross-Story Dependencies

- **Dentro de la épica:** 4.2 depende del `motor.calcular()` de 4.1, que debe exponer el factor de renta efectivo para D17. 4.3 y 4.4 necesitan pagos generados por 4.1/4.2 (o sembrados en los tests). 4.4 muestra la corrección y la conciliación, que se llenan en E5/E6.
- **De otras épicas:** `ProgramaSocial` con `vlrBaseIndividual` ya ajustado por FATOR-K (D8), `fatorReajuste`, `tipoPrograma` y `sitPrograma` (E1, historia 1.1, que también aporta el kit de UI). `Beneficiario` con `numDependentes`, `codRegiao`, `vlrRendaFamiliar`, `dtNascimento` y `sitBeneficiario` (E2, 2.1/2.4). `BeneficiarioDesconto` (2.5) es la fuente de FR-DSC-05. La consulta de beneficiario (2.6) lista los últimos 12 pagos.
- **Consumidores:** E5 (corrección IPCA sobre los pagos), E6 (conciliación CNAB 240 que actualiza status y fecha de pago) y E7 (informes analítico y consolidado; el consolidado redondea mientras el cálculo trunca, D11).
