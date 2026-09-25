# Epic 3 Context: Elegibilidad

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Esta épica verifica si un beneficiario es elegible para un programa social. Equivale al programa legado VALELEG. Recibe un CPF y un código de programa, aplica las precondiciones y luego acumula **todos** los motivos de rechazo: status del beneficiario, límites del programa, reglas por tipo de programa y código de elegibilidad específico. El resultado es "elegible" o "no elegible" con la lista numerada de motivos. Hay que replicar el legado al pie de la letra (29 RK, mensajes literales), incluido el LEGACY-QUIRK D12: la región 99 es elegible sin ninguna verificación. Es una pantalla de consulta: no graba nada.

## Stories

- Story 3.1: Validación de elegibilidad

## Requirements & Constraints

Los mensajes entre comillas se reproducen **literalmente** (mayúsculas, portugués, sin tildes). El texto de los FR se copia del PRD sin cambios. La tabla RK completa (29 reglas con línea de VALELEG) está en `docs/stories/3-1-validación-de-elegibilidad.md`.

**FR-ELG-01 — Precondiciones**
Entrada: CPF + código de programa. Beneficiario inexistente → "BENEFICIARIO NAO
ENCONTRADO"; programa inexistente → "PROGRAMA NAO ENCONTRADO"; programa con
status ≠ A → "PROGRAMA INATIVO". Edad = año actual − año de nacimiento.

**FR-ELG-02 — Región especial 99  ⚠ LEGACY-QUIRK D12**
Región 99 (internacional/diplomático) → "BENEFICIARIO ELEGIVEL - REGIAO
ESPECIAL", **sin ninguna otra verificación**.

**FR-ELG-03 — Status del beneficiario**
S → "BENEFICIARIO SUSPENSO"; C o D → "BENEFICIARIO CANCELADO/DESLIGADO";
I → "BENEFICIARIO INATIVO". Todas vuelven no elegible.

**FR-ELG-04 — Límites del programa**
Si el límite > 0: edad < mín. → "IDADE INFERIOR AO MINIMO DO PROGRAMA"; edad >
máx. → "IDADE SUPERIOR AO MAXIMO DO PROGRAMA"; renta > renta máx. → "RENDA
FAMILIAR ACIMA DO TETO DO PROGRAMA".

**FR-ELG-05 — Reglas por tipo de programa**
- A (asistencial): renta > 600,00 y sin dependientes → "PROG ASSISTENCIAL: RENDA
  > 600 SEM DEPENDENTES"; documentos ≠ S → "DOCUMENTACAO INCOMPLETA".
- P (previsional): edad < 60 → "PROG PREVIDENCIARIO: IDADE < 60".
- T (trabajo): edad < 16 o > 65 → "PROG TRABALHO: IDADE FORA DA FAIXA 16-65".
- Otro → "TIPO PROGRAMA DESCONHECIDO".

**FR-ELG-06 — Código de elegibilidad específico**
Si el código (A5) no está vacío: posición 1 = R exige NIS ≠ 0 ("NIS NAO
CADASTRADO"); posición 2 = D exige dependientes ("PROGRAMA REQUER DEPENDENTES").

**FR-ELG-07 — Resultado con todos los motivos**
Acumula todos los motivos (máx. 10). Elegible → "BENEFICIARIO ELEGIVEL PARA O
PROGRAMA"; si no, "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:" + lista numerada.

**LEGACY-QUIRK D12.** "Región 99 elegible sin verificaciones". Decisión: **replicar** y marcar el código con `// LEGACY-QUIRK(D12)`. Un beneficiario de la región 99 con status S, sin documentos o fuera de la franja de edad sigue siendo elegible. No hay que "corregirlo".

**Lógica del fuente legado (VALELEG.NSN, extractos)**
```natural
COMPUTE #ANO-ATUAL = *DATN / 10000                       /* :59 */
COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000 /* :72 */
COMPUTE #IDADE = #ANO-ATUAL - #ANO-NASC                  /* :73 */
IF NOT #FOUND-B  WRITE 'BENEFICIARIO NAO ENCONTRADO' ESCAPE ROUTINE
IF NOT #FOUND-P  WRITE 'PROGRAMA NAO ENCONTRADO'     ESCAPE ROUTINE
IF PROGRAMA-V.STATUS-PROG NE 'A'  WRITE 'PROGRAMA INATIVO' ESCAPE ROUTINE
IF #COD-REG = 99                                          /* :107 D12 */
  WRITE 'BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL'  ESCAPE ROUTINE
IF #STATUS-BENEF NE 'A'   /* S / C|D / I -> motivo; otro valor: sin motivo */
IF PROGRAMA-V.IDADE-MIN > 0  IF #IDADE < IDADE-MIN ...  /* idem IDADE-MAX (>), RENDA-MAX (>) */
DECIDE ON FIRST VALUE OF #TIPO-PROG
  VALUE 'A'  IF #RENDA > 600.00  IF #NUM-DEP < 1 ...    /* anidado: renta Y sin dep. */
             IF #DOCS-OK NE 'S' ...                      /* independiente de la renta */
  VALUE 'P'  IF #IDADE < 60 ...
  VALUE 'T'  IF #IDADE < 16 OR #IDADE > 65 ...
  NONE       'TIPO PROGRAMA DESCONHECIDO'
IF #COD-ELEG NE ' '  PERFORM VERIF-ELEG-ESPECIFICA
  /* SUBSTR(#COD-ELEG,1,1)='R' AND BENEFICIARIO-V.NIS = 0 -> 'NIS NAO CADASTRADO'   */
  /* SUBSTR(#COD-ELEG,2,1)='D' AND #NUM-DEP = 0          -> 'PROGRAMA REQUER DEPENDENTES' */
IF #ELEGIVEL 'BENEFICIARIO ELEGIVEL PARA O PROGRAMA'
ELSE 'BENEFICIARIO NAO ELEGIVEL - MOTIVOS:'  FOR #I: WRITE #I '-' #MOTIVO(#I)
```
El orden de acumulación importa y debe conservarse: status → edad mín. → edad máx. → renta máx. → tipo → código específico. El array `#MOTIVO` tiene 10 posiciones (A60/10). Hoy el máximo alcanzable es 7, así que no hay que inventar un comportamiento de desborde. Un status fuera de A/S/C/D/I no genera motivo.

**Criterios transversales**
- El servicio de dominio `avaliarElegibilidade(benef, programa, anoAtual)` es puro, se inyecta el año y tiene un test por rama.
- Cada regla lleva el comentario `// RK-… (VALELEG:línea)` y al menos un test.
- Si el MCP de RNC está conectado, hay que verificar cada RK con `getRule` (procedimiento en `bmad-context.md`).
- `npm run lint && npm test` en verde.

## Technical Decisions

**Capas.**
- Regla pura en `src/domain/elegibilidade.ts`, sin Prisma ni Next.
- Orquestación en `src/server/elegibilidade.ts`: lee Beneficiario por `numCpf` y ProgramaSocial por `codPrograma`, y llama al dominio. Sin lógica de negocio.
- Ruta `/elegibilidade` en `src/app/`.
- Es solo lectura: no escribe auditoría salvo que el patrón de consulta de E1/E2 diga lo contrario.

**Mapeo de campos legados al modelo (ya existe en `prisma/schema.prisma`)**
- `STATUS-PROG` → `ProgramaSocial.sitPrograma` (A/I/E). Todo lo que no sea `A` es "PROGRAMA INATIVO".
- `TIPO` → `tipoPrograma`.
- `IDADE-MIN/MAX` → `idadeMin`/`idadeMax` (0 = sin límite).
- `RENDA-MAX` → `rendaMaxPercap` en centavos (0 = sin límite). Se compara con `Beneficiario.vlrRendaFamiliar` (centavos). El umbral de 600,00 de A equivale a `60000` centavos, o usa `money.ts`. Nunca `float`.
- `COD-ELEGIBILIDADE` → `codElegibilidade` String(5)? Tratar `null`, `""` y solo espacios como vacío. La posición 1 es `[0]` y la 2 es `[1]`.
- `DT-NASCIMENTO` → `dtNascimento` Int AAAAMMDD. La edad es por año con `idadePorAno(dtNasc, anoAtual)`, y el año actual sale de `hoje()`.
- `COD-REGIAO` → `codRegiao`.
- `STATUS` → `sitBeneficiario` (A/S/C/I/D).
- `NUM-DEPENDENTES` → `numDependentes` (contador que mantiene E2).
- `DOCUMENTOS-OK` → `documentosOk` (S/N).
- `NIS` → `nis` String?. "NIS = 0" equivale a null o vacío (y a "00000000000" si llegara a existir).

**Código existente reutilizable (no duplicar)**
- `src/domain/legacyDate.ts`: `anoDe`, `idadePorAno`, `hoje()`.
- `src/domain/money.ts`: `dec`, `aCentavos`, `deCentavos` para comparar renta.
- `src/domain/cpf.ts`: normalización y validación del CPF de entrada. Con E2 incluye también las máscaras D7, útiles si se muestra el CPF.
- `src/domain/quirks.ts`: registro de quirks. D12 no tiene flag: se replica siempre.
- `src/server/db.ts`: `prisma`, cliente singleton.
- **De la historia 1.1 (en progreso; comprobar que existe antes de usarlo):**
  - Kit shadcn en `src/components/ui` (button, input, label, select, badge, alert, card).
  - `src/components/campos`: `ResultadoLegado` y `Codigo`.
  - Patrón de Server Actions (`actions.ts`) con esquema zod.
  - `src/server/programas.ts`, que alimenta el `Select` de programas.
- **De E2 (ready-for-dev):** `CpfInput` en `src/components/campos` y la lectura de beneficiario por CPF en `src/server/beneficiarios.ts`. Si no existen, E3 los crea en esos mismos lugares, no en otros.

## UX & Interaction Patterns

- **Pantalla `/elegibilidade`** (legado: VALIDACAO ELEGIBILIDADE).
  - Entrada: CPF del beneficiario y programa (`Select`).
  - Resultado: badge **ELEGÍVEL** / **NÃO ELEGÍVEL** con los motivos numerados en su texto literal.
  - Región 99: muestra "BENEFICIARIO ELEGIVEL - REGIAO ESPECIAL".
  - Precondiciones fallidas: se muestra solo ese mensaje literal, sin badge de motivos.
- **Flujo F4.** `/elegibilidade` → CPF + programa → ELEGÍVEL / NÃO ELEGÍVEL con motivos. Si falta documentación ("DOCUMENTACAO INCOMPLETA"), se ofrece un enlace a `/validacao/documentos`.
- **Punto de entrada.** Desde `/consulta` (F3) hay un atajo a Elegibilidade. Conviene aceptar el CPF prellenado por query string si el atajo lo pasa.
- UI en pt-BR. Los mensajes del dominio se muestran tal cual, sin traducir ni poner tildes.

## Cross-Story Dependencies

- **E1 (Story 1.1, en progreso):** necesita ProgramaSocial con `sitPrograma`, `tipoPrograma`, límites y `codElegibilidade`, además del kit UI y el patrón de Server Actions + zod.
- **E2 (Stories 2.1, 2.4, 2.6):** proporcionan los beneficiarios con `codRegiao`, `sitBeneficiario`, `documentosOk` y `nis`, y el contador `numDependentes`. Los datos de seed/e2e deben cubrir la región 99, cada status, los tipos A/P/T/otro y los códigos `R`/`D`.
- **Consumidores:** el atajo de `/consulta` (2.6) enlaza a esta pantalla. Ningún otro epic consume el resultado de elegibilidad en la fase 1.
