# Epic 5 Context: Corrección retroactiva

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica reproduce el programa legado CALCCORR: la corrección retroactiva por IPCA de los pagos de un beneficiario (CPF) en un período de competencias. Cada pago del período que todavía no se corrigió se multiplica por el índice IPCA del mes de su competencia, se trunca a centavos y, solo si sube de valor, se marca como corregido con el valor y la fecha de corrección. El resultado tiene que coincidir **al centavo** con el legado, incluida la tabla IPCA fija de 2010–2012 (LEGACY-QUIRK D9), y re-ejecutar el proceso no puede volver a corregir un pago. Trabaja sobre los `Pagamento` generados por el motor de E4 y es uno de los pocos procesos autorizados a modificar un pago.

## Stories

- Story 5.1: Corrección retroactiva por IPCA

## Requirements & Constraints

Los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes). "Truncar" = descartar a partir del 3.er decimal (padrón mainframe `×100 → entero → /100`). Texto de los requisitos (sin modificar):

**FR-COR-01 — Período**
Entrada: CPF + competencia inicial + final. Inicial > final → "PERIODO INVALIDO -
COMP INICIAL > FINAL". Procesa los pagos del CPF dentro del período.

**FR-COR-02 — No recorregir**
Pago con indicador de corregido = S se ignora.

**FR-COR-03 — Índice IPCA ⚠ LEGACY-QUIRK D9**
Índice = 1 × (1 + IPCA del mes de la competencia) según tabla fija 2010–2012.
Competencias fuera de esa tabla → índice 1 (sin corrección).

**FR-COR-04 — Aplicación**
Corregido = bruto × índice (truncar); diferencia = corregido − bruto. Solo si
diferencia > 0: graba valor de corrección, fecha de corrección = hoy, indicador S.
Resumen: "CORRECAO RETROATIVA FINALIZADA", registros corregidos y valor total.

**LEGACY-QUIRK D9:** la tabla IPCA solo tiene 2010–2012. Se replica la tabla y los demás años quedan sin corrección. Hay que marcarlo con `// LEGACY-QUIRK(D9)`.

**Tabla IPCA (legado, valores mensuales exactos):**

| Año | Ene | Feb | Mar | Abr | May | Jun | Jul | Ago | Sep | Oct | Nov | Dic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2010 | 0.0075 | 0.0078 | 0.0052 | 0.0057 | 0.0043 | 0.0000 | 0.0001 | 0.0004 | 0.0045 | 0.0075 | 0.0083 | 0.0063 |
| 2011 | 0.0083 | 0.0080 | 0.0079 | 0.0077 | 0.0047 | 0.0015 | 0.0016 | 0.0037 | 0.0053 | 0.0043 | 0.0052 | 0.0050 |
| 2012 | 0.0056 | 0.0045 | 0.0021 | 0.0064 | 0.0036 | 0.0008 | 0.0043 | 0.0041 | 0.0054 | 0.0059 | 0.0060 | 0.0079 |

**Secuencia exacta del cómputo (por pago, CALCCORR):**
1. Validar período (:119). Luego recorrer los pagos del CPF (:129) y saltar los que tienen competencia < inicial (:133). Una competencia > final termina el recorrido (:136). El legado lee en orden de CPF, así que hay que ordenar por `anoMesRef` ascendente para que la parada sea equivalente.
2. `indCorrigido = 'S'` → se salta (:140).
3. Índice: parte de 1.000000 (N5.6). Año = competencia / 100 (división entera, :180), mes = competencia − año×100 (:181). Si el año está en la tabla (:184), índice = índice × (1 + IPCA[año][mes]) (:185). Si no, queda 1.
4. `corr = bruto × índice` (:152). **Truncar:** `temp = entero(corr × 100)` (:154) y `corr = temp / 100` (:155). `diff = corr − bruto` (:156).
5. Solo si `diff > 0` (:158): `vlrCorrecao = corr` (el **valor corregido completo**, no la diferencia), `dtCorrecao = hoy` (AAAAMMDD) e `indCorrigido = 'S'`. Se graba por pago (transacción propia). Luego total += **diff** y registros += 1.
6. Resumen: "CORRECAO RETROATIVA FINALIZADA", con registros corregidos y valor total (suma de las diferencias).

Consecuencia: un pago con índice 1 (fuera de la tabla, o jun/2010 = 0.0000), o con una diferencia truncada a 0, **no** queda marcado y se volverá a evaluar en la próxima ejecución. Así se comporta el legado.

Otras restricciones:
- 14 reglas RK de la historia (CALCCORR:119, 129, 133, 136, 140, 152, 154, 155, 156, 158, 180, 181, 184, 185). Cada una va en `src/domain` con `// RK-… (CALCCORR:línea)` y al menos un test. Hay que verificarlas con `getRule` cuando el MCP de RNC esté conectado.
- La suite de regresión debe incluir casos de corrección al centavo (NFR-03). También un test de que la re-ejecución no corrige de nuevo.
- Dinero siempre en `Decimal`, nunca `float` (NFR-01). CPF enmascarado donde se muestre (NFR-04) y datos personales nunca en logs.
- El bloque comentado del legado (Plano Verão 1989–1991, que marca `'V'`) queda **fuera de alcance**. No se implementa.
- El legado no escribe auditoría en CALCCORR, y la auditoría la escribe hoy solo la conciliación. Esta épica no añade eventos de auditoría.

## Technical Decisions

- **Ubicación:** la lógica pura va en `src/domain/calculo/correcao.ts` (FR-COR). La tabla IPCA va en `src/domain/calculo/tabelas.ts` (compartido con E4: D1, contribución, IPCA). El caso de uso va en `src/server/correcao.ts` y solo orquesta (Prisma + dominio), sin lógica de negocio. La ruta es `/correcao`, con validación zod en el borde.
- **Modelo `Pagamento`:** la corrección usa `numCpf`, `anoMesRef` (Int AAAAMM, indexado junto con `numCpf`) y `vlrBruto` (Int, centavos). Escribe `vlrCorrecao` (Int? centavos), `dtCorrecao` (Int? AAAAMMDD) e `indCorrigido` (String(1)? `'S'`). No hay CRUD libre de pagos: solo cambian por procesos.
- **Transacción:** una por pago corregido (equivale a `END TRANSACTION` dentro del bucle).
- **Código reutilizable:**
  - `src/domain/money.ts`: `dec`, `truncar` (padrón mainframe), `deCentavos`/`aCentavos`, `fator`, `formatarReais`.
  - `src/domain/legacyDate.ts`: `hoje()` (TZ America/Sao_Paulo, AAAAMMDD), `competenciaParaInt`/`intParaCompetencia`.
  - `src/server/db.ts`: `prisma`.
  - `src/server/auditoria.ts`: existe (`registrarEvento`), pero esta épica no lo usa.
  - Kit de UI de la story 1.1: `src/components/ui/` (alert, badge, button, card, input, label, select, table).
  - El dominio de cálculo `src/domain/calculo/` lo está construyendo E4. `tabelas.ts` puede existir ya: hay que extenderlo, no duplicarlo.

## UX & Interaction Patterns

- **Pantalla 4.16 "Correção retroativa" `/correcao`** (legado: CORRECAO RETROATIVA). La UI está en pt-BR. Entrada: CPF do beneficiário · Competência inicial · Competência final. El operador nunca teclea AAAAMM crudo ni centavos, porque la UI convierte. Resultado: "CORRECAO RETROATIVA FINALIZADA" con registros corregidos y valor total, más una tabla de pagos corregidos (competência, original, corrigido, diferença).
- **Patrón formulario de proceso:** la entrada va arriba, luego el botón de acción y el panel de resultado debajo, sin salir de la página. El resultado permanece hasta la próxima ejecución. Los errores (p. ej. el período inválido) aparecen como mensaje literal en el panel.
- **Flujo F6:** `/correcao` → CPF + período → resumen → detalle del pago en `/pagamentos/[num]`. El detalle (solo lectura, E4) ya muestra la corrección: valor, fecha y corregido S/N.
- En el menú, la pantalla está en el grupo "Processos".

## Cross-Story Dependencies

- Depende de **E4**:
  - modelo `Pagamento` y pagos generados (4.1/4.2);
  - `src/domain/calculo/tabelas.ts` (4.1);
  - detalle de pago `/pagamentos/[num]` (4.4), destino del flujo F6.
- Depende de **E0/E1**: esquema Prisma con los campos de corrección, utilidades de dinero y fecha, y el kit de UI.
