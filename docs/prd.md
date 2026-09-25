# Documento de Requisitos de Producto (PRD) — SIFAP

> Fuente: workspace RNC `603f473c-d0aa-4d1a-bdb1-6e365371c787` (módulo
> `4cf7ed9e-…`), 15 programas Natural + 4 DDMs Adabas, **289 reglas**.
> Cada requisito cita sus reglas como `RK-<clave>` (`PROGRAMA:línea`).
> Cobertura: 289/289 reglas trazadas (Anexo A).
> Versión 2 — corrección de rumbo del 2026-09-24 (reemplaza la versión "8 CRUDs").

## 1. Visión general

SIFAP (Sistema de Fiscalização e Administração de Pagamentos) gestiona el ciclo
completo de programas sociales de transferencia de renta:

```
Programas sociales ─┐
                    ├─► Elegibilidad ─► Cálculo mensual ─► Descuentos ─► Pago ─► Conciliación bancaria
Beneficiarios ──────┘        (VALELEG)     (CALCBENF/BATCHPGT) (CALCDSCT)          (BATCHCON, CNAB 240)
 + dependientes                                   │
 + validaciones                                   └─► Corrección retroactiva IPCA (CALCCORR)
                                                  └─► Informes: pagos, consolidado, auditoría
```

La aplicación moderna reemplaza las pantallas 3270 y los jobs batch por una
aplicación web Next.js con procesos disparables por el operador (y, en el caso
del lote mensual, también programables).

## 2. Objetivos y no-objetivos

**Objetivos**
- Equivalencia funcional con el legado: mismos cálculos, mismos mensajes, mismas
  validaciones, al centavo.
- Trazabilidad total: cada regla legada (`RK-…`) mapeada a un requisito y a una historia.
- Rarezas del legado registradas como decisiones explícitas (§5), no "corregidas" en silencio.

**No-objetivos (fase 1)**
- Migración de datos del Adabas.
- Integración SIAFI real y envío de remesa al banco (solo se procesa el **retorno** CNAB 240).
- Código comentado del legado (integración Banco Real, corrección Plano Verão).
- Funcionalidades nuevas no presentes en el legado.

## 3. Actores

| Actor | Usa |
|---|---|
| Operador de cadastro | Programas, beneficiarios, dependientes, consulta |
| Analista de beneficios | Validaciones, elegibilidad, cálculo individual, descuentos, corrección |
| Gestor financiero | Lote mensual, conciliación bancaria, informes de pagos |
| Auditor | Informe de auditoría |
| Sistema (job) | Lote mensual de pagos, conciliación; escribe auditoría como usuario `BATCH` |

## 4. Requisitos funcionales

Convenciones: mensajes entre comillas se reproducen **literalmente** (en
mayúsculas, portugués, como en el legado). "Truncar" = descartar a partir del 3.er
decimal (padrón mainframe `×100 → entero → /100`). "Edad" = año de referencia −
año de nacimiento (sin mes/día) salvo que se diga otra cosa.

### E1 — Programas sociales (CADPROG)

#### FR-PRG-01 — Operaciones de programa: inclusión (I) y consulta (C)
- Operación distinta de I/C → "OPERACAO INVALIDA".
- Consulta por código: muestra código, nombre, tipo, valor base, código de
  elegibilidad y status. Inexistente → "PROGRAMA NAO ENCONTRADO".
- El legado **no altera ni excluye** programas. Mantener y eliminar por la UI
  queda fuera del alcance de equivalencia (ver §5 D1 para los grupos hijos).
- **Nota (extensión fuera del legado, story 1.2, pedido del usuario 2026-09-25):**
  se agregan **alteración** (`/programas/[cod]/editar`) y **desactivar / reactivar**
  (situación A → I / I → A, en el detalle, con confirmación en la página). Nunca se
  excluye un programa. El código es inmutable; las validaciones y mensajes son los de
  la inclusión. Valor base "igual que la inclusión" (D8): si el operador informa el
  valor base, se recalcula FATOR-K y se graba el valor ajustado; si no lo informa y el
  fator no cambia, el valor gravado queda intacto (sin doble FATOR-K); cambiar el
  fator exige informar el valor base. Programa encerrado (E) no se reactiva desde la
  UI. Concurrencia optimista con `numVersao` ("Programa alterado por outro usuário.
  Recarregue a página."). A diferencia de CADPROG, estas operaciones registran
  auditoría `AL` (tabla `PROGRAMA`, clave = código; "ALTERACAO PROGRAMA",
  "PROGRAMA DESATIVADO", "PROGRAMA REATIVADO") en la misma transacción.
  Programa encerrado (E) **no se altera** ("PROGRAMA ENCERRADO NAO PODE SER ALTERADO"):
  la UI no ofrece Editar y el servidor lo rechaza; un programa inactivo (I) sí se altera
  y sigue I. Grabar sin cambios responde "Nenhuma alteração a gravar." sin nueva versión
  ni auditoría. Las fechas (inicio/fin) **no cambian la situación**: no hay cambio
  automático a E por `dtEncerramento` (fuera de alcance). Por qué cambiar el fator exige
  informar de nuevo el valor base: solo se guarda el valor ya ajustado (× FATOR-K, D8), y
  recuperar el valor informado dividiendo por FATOR-K no es exacto (truncamiento a
  centavos); guardar el valor sin ajustar exigiría un cambio de esquema, descartado aquí.
*Reglas (3):* RK-d20a15a018e6 (CADPROG:51) · RK-a1d8765eea49 (CADPROG:56) · RK-7ca3bec5e5f6 (CADPROG:117)

#### FR-PRG-02 — Unicidad del código de programa
Inclusión con código existente → "PROGRAMA JA CADASTRADO".
*Reglas (1):* RK-1559882bffe4 (CADPROG:81)

#### FR-PRG-03 — Valor base ajustado por FATOR-K  ⚠ LEGACY-QUIRK D8
Al incluir: `FATOR-K = 1.00 + FATOR-REAJ × 0.347215`; se graba
`VLR-BASE = VLR-BASE informado × FATOR-K`. Status inicial `A`. Mensaje:
"PROGRAMA INCLUIDO COM SUCESSO - VLR AJUSTADO:" + valor.
Campos de entrada: nombre, tipo (A=asistencial, P=previsional, T=trabajo),
valor base, código de elegibilidad (A5), fecha inicio, fecha fin (0 =
indeterminado), renta máxima, edad mín., edad máx., factor de reajuste.
*Reglas (2):* RK-275e4a632e83 (CADPROG:87) · RK-bd6a7e52a48b (CADPROG:88)

#### FR-PRG-04 — Tramos de cálculo y parámetros regionales (grupos del programa)
El DDM define dentro del programa `GRP-FAIXA-CALCULO` (máx. 5 tramos: renta
inicio/fin, factor multiplicador, valor adicional, acumulativo S/N) y
`GRP-PARAM-REGIONAL` (máx. 6: código región, factor regional, complemento, activo S/N).
Se editan **dentro** de la pantalla del programa. Ver §5 D1: en fase 1 el cálculo
usa las tablas fijas del legado; estos grupos se persisten y se muestran.
*Reglas:* ninguna (estructura de datos, DDM `PROGRAMA-SOCIAL`).

### E2 — Beneficiarios

#### FR-BEN-01 — Inclusión (I) y alteración (A) de beneficiario (CADBENEF)
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

#### FR-BEN-02 — Campos obligatorios del cadastro
CPF ≠ 0 ("CPF OBRIGATORIO"); nombre no vacío ("NOME OBRIGATORIO"); fecha de
nacimiento ≠ 0 ("DATA NASCIMENTO OBRIGATORIA"); sexo ∈ {M, F} ("SEXO INVALIDO").
*Reglas (4):* RK-40623cadda7c (CADBENEF:105) · RK-e1aba7261a6b (CADBENEF:119) · RK-a14601290959 (CADBENEF:125) · RK-e17b444be69b (CADBENEF:131)

#### FR-BEN-03 — CPF válido por módulo 11 (utilidad compartida)
DV1: Σ(dígitos 1–9 × pesos 10..2); resto = Σ mod 11; DV = 0 si resto < 2, si no
11 − resto; debe igualar el dígito 10. DV2: igual sobre dígitos 1–10 con pesos
11..2; debe igualar el dígito 11. Falla → "CPF INVALIDO - DIGITO VERIFICADOR INCORRETO".
Implementar **una sola vez** (E0) y reutilizar en FR-VAL-02 y FR-DOC-01.
*Reglas (11):* RK-bc7d67f3dad4 (CADBENEF:113) · RK-99ffed6e1d57 (CADBENEF:237) · RK-ab368e4ef3e2 (CADBENEF:240) · RK-a04fb0c62d98 (CADBENEF:241) · RK-02b5279daf63 (CADBENEF:244) · RK-476620ed64ce (CADBENEF:247) · RK-98472f98558e (CADBENEF:256) · RK-d05375bd9555 (CADBENEF:259) · RK-8178f6bfb367 (CADBENEF:260) · RK-a4491331af7d (CADBENEF:263) · RK-9e739b6b003d (CADBENEF:266)

#### FR-BEN-04 — Status inicial
Inclusión → status `A` (Ativo).
*Reglas (1):* RK-e4b2970fefe6 (CADBENEF:162)

#### FR-BEN-05 — Suspensión automática por edad > 75  ⚠ LEGACY-QUIRK D5
Edad = año actual − año de nacimiento. Si > 75 → status `S`, **en inclusión y en alteración**.
*Reglas (2):* RK-46154d4f44a9 (CADBENEF:159) · RK-9ffc13028ce4 (CADBENEF:167)

#### FR-VAL-01 — Validación cadastral consolidada (VALBENEF)
Rutina que se ejecuta antes de grabar y **acumula todos los errores** (máx. 10)
en lugar de cortar en el primero. Resultado `V` (válido) o `I` (inválido) + lista:
"CPF INVALIDO - DIGITO VERIFICADOR", "DATA NASCIMENTO INVALIDA",
"NOME INVALIDO - DEVE TER NOME E SOBRENOME", "UF INVALIDA", "STATUS INVALIDO".
Status válidos: A, S, C, I, D.
*Reglas (5):* RK-4e7cf0ea0beb (VALBENEF:110) · RK-d92621a0cc50 (VALBENEF:116) · RK-b776e6f05132 (VALBENEF:126) · RK-39e9b653aa4d (VALBENEF:136) · RK-3414a3783a2e (VALBENEF:164)

#### FR-VAL-02 — CPF completo (con dígitos repetidos)  ⚠ LEGACY-QUIRK D4b
Además del módulo 11: si los 11 dígitos son iguales → inválido, **excepto** si
empieza por `000` (se considera válido: "teste governo").
*Reglas (13):* RK-b48d9743345d (VALBENEF:190) · RK-605e59b1fe7d (VALBENEF:195) · RK-e67e790f872a (VALBENEF:197) · RK-2dd4cb3c18cd (VALBENEF:209) · RK-9f7df44b6ca1 (VALBENEF:212) · RK-ccc5388150f7 (VALBENEF:213) · RK-9985fab5aca5 (VALBENEF:216) · RK-f19b73dfd406 (VALBENEF:218) · RK-cb78ba074b4e (VALBENEF:227) · RK-23cb286f5641 (VALBENEF:230) · RK-6381e8b050e1 (VALBENEF:231) · RK-03e29441143e (VALBENEF:234) · RK-07ded10a38a1 (VALBENEF:236)

#### FR-VAL-03 — Fecha de nacimiento válida (AAAAMMDD)  ⚠ LEGACY-QUIRK D16
Año entre 1900 y el año actual; mes 1–12; día 1..días del mes, con febrero
**siempre 29** (no verifica año bisiesto).
*Reglas (6):* RK-dec345b9d4e4 (VALBENEF:244) · RK-1f589b644cd7 (VALBENEF:245) · RK-a34852e9ec02 (VALBENEF:246) · RK-39c31733e515 (VALBENEF:248) · RK-f60066fede08 (VALBENEF:252) · RK-db3b53eeb364 (VALBENEF:256)

#### FR-VAL-04 — Nombre con nombre y apellido
No vacío y con un espacio después de la 1.ª posición.
*Reglas (3):* RK-9c6ba0322e06 (VALBENEF:264) · RK-9eb88e2bb408 (VALBENEF:271) · RK-6e161797bb9a (VALBENEF:274)

#### FR-VAL-05 — UF válida
Si informada, debe pertenecer a las 27 UFs brasileñas.
*Reglas (3):* RK-ac7976dff12d (VALBENEF:145) · RK-20056adb605d (VALBENEF:149) · RK-bb74de6a3c53 (VALBENEF:154)

#### FR-DOC-01 — Validación de documentos: CPF (VALDOCS)
Entrada: CPF, RG, título de elector, CTPS. CPF = 0 o módulo 11 inválido → "CPF INVALIDO".
Resultado `V`/`I` con lista de errores (máx. 5).
*Reglas (12):* RK-82c01a2ea13d (VALDOCS:69) · RK-55a63d755481 (VALDOCS:102) · RK-4187fc1c9b8e (VALDOCS:114) · RK-9d67b2c9881b (VALDOCS:117) · RK-1a2b8aca3fed (VALDOCS:118) · RK-533f71e705bc (VALDOCS:121) · RK-ca3109301dbc (VALDOCS:123) · RK-4cd00622ae5a (VALDOCS:131) · RK-bb14087b5111 (VALDOCS:134) · RK-e3ad9c603136 (VALDOCS:135) · RK-06b627574a45 (VALDOCS:138) · RK-08b9ede5ec74 (VALDOCS:140)

#### FR-DOC-02 — RG con al menos 5 caracteres
RG vacío o con menos de 5 caracteres → "RG INVALIDO OU FORMATO INCORRETO".
*Reglas (4):* RK-b0821b60ecb6 (VALDOCS:79) · RK-2b0e2875eb48 (VALDOCS:148) · RK-f018750c00d0 (VALDOCS:155) · RK-cf4926ddfa8b (VALDOCS:160)

#### FR-DOC-03 — Documento especial por prefijo de CPF  ⚠ LEGACY-QUIRK D4 (seguridad)
Si el CPF empieza por 000, 001, 002, 010, 011, 099, 100 o 999 → documento
especial: se **anulan todos los errores** (incluido el RG), resultado `V` y
aviso "** DOCUMENTO ESPECIAL VALIDADO **". Solo con el flag `LEGACY_DOC_ESPECIAL_ENABLED=true` (por defecto desactivado: el prefijo no tiene efecto). Ver §5 D4.
*Reglas (2):* RK-5549fc642f21 (VALDOCS:95) · RK-4aa29d42f19a (VALDOCS:174)

#### FR-DEP-01 — Dependientes: titular válido (CADDEPEND)
Se identifica al titular por CPF. Inexistente → "BENEFICIARIO NAO ENCONTRADO".
Titular con status C o D → "BENEFICIARIO CANCELADO/DESLIGADO - NAO PERMITE INCLUSAO".
*Reglas (2):* RK-6badeec05527 (CADDEPEND:51) · RK-7f25da1eeff3 (CADDEPEND:56)

#### FR-DEP-02 — Límite de dependientes  ⚠ LEGACY-QUIRK D6
Antes de cada inclusión: si n.º de dependientes > 5 → "LIMITE DE DEPENDENTES
ATINGIDO" (permite llegar a 6; el DDM admite 10).
*Reglas (1):* RK-728f8d2bc779 (CADDEPEND:63)

#### FR-DEP-03 — Datos del dependiente
Nombre obligatorio ("NOME DO DEPENDENTE OBRIGATORIO"); parentesco ∈ {FI, CO, IR, OU}
("PARENTESCO INVALIDO"). Con error, se vuelve a pedir el dependiente.
Campos: nombre, fecha de nacimiento, parentesco, CPF, documento, sexo.
*Reglas (4):* RK-cf0d5200aad9 (CADDEPEND:79) · RK-bba959226637 (CADDEPEND:84) · RK-4dfeeb238cf7 (CADDEPEND:90) · RK-f8707d9be137 (CADDEPEND:105)

#### FR-DEP-04 — CPF de dependiente no duplicado
Si CPF ≠ 0 y ya existe entre los dependientes del titular → "DEPENDENTE JA
CADASTRADO (CPF DUPLICADO)".
*Reglas (1):* RK-d08414712f34 (CADDEPEND:97)

#### FR-DEP-05 — Inclusión en serie
Tras cada inclusión: incrementa el contador del titular, muestra "DEPENDENTE
INCLUIDO - TOTAL:" n y pregunta "INCLUIR OUTRO DEPENDENTE? (S/N)"; distinto de S termina.
*Reglas (1):* RK-db6fc93c9e4c (CADDEPEND:126)

#### FR-CON-01 — Consulta de beneficiario por CPF o NIS (CONSBENF)
Tipo de búsqueda C (CPF, por defecto si vacío) o N (NIS); otro → "TIPO BUSCA
INVALIDO". Inexistente → "BENEFICIARIO NAO ENCONTRADO". Muestra datos
cadastrales (CPF enmascarado, nombre, nacimiento, sexo, dirección, municipio/UF,
CEP, status, programa, renta, dependientes, región, NIS, fecha de cadastro).
*Reglas (4):* RK-9d9bab8eef93 (CONSBENF:72) · RK-98c65e845b23 (CONSBENF:80) · RK-7ede98209218 (CONSBENF:86) · RK-7b5ef292a4dd (CONSBENF:100)

#### FR-CON-02 — Descripción de status
A=ATIVO, S=SUSPENSO, C=CANCELADO, I=INATIVO, D=DESLIGADO, otro=DESCONHECIDO.
*Reglas (1):* RK-bbda5babb7d9 (CONSBENF:110)

#### FR-CON-03 — Historial de los últimos 12 pagos
Lista competencia, bruto, líquido, status y tipo de hasta 12 pagos del CPF.
Sin pagos → "NENHUM PAGAMENTO ENCONTRADO".
*Reglas (3):* RK-e17f09d66201 (CONSBENF:152) · RK-0550647253b2 (CONSBENF:156) · RK-95a55083feb2 (CONSBENF:166)

#### FR-CON-04 — Máscara de CPF  ⚠ LEGACY-QUIRK D7
CPF ≥ 10000000000 → `***.***.XXX-XX` (muestra dígitos 7–11). CPF menor
(ceros a la izquierda) → muestra los **3 primeros** dígitos: `XXX.***.***-**`.
"NAO CORRIGIR SEM APROVACAO DA AUDITORIA".
*Reglas (1):* RK-cfd080c8d910 (CONSBENF:177)

### E3 — Elegibilidad (VALELEG)

#### FR-ELG-01 — Precondiciones
Entrada: CPF + código de programa. Beneficiario inexistente → "BENEFICIARIO NAO
ENCONTRADO"; programa inexistente → "PROGRAMA NAO ENCONTRADO"; programa con
status ≠ A → "PROGRAMA INATIVO". Edad = año actual − año de nacimiento.
*Reglas (6):* RK-ba073668b27b (VALELEG:59) · RK-80016581d919 (VALELEG:72) · RK-8c8b79c28087 (VALELEG:73) · RK-d1fd785bcf1c (VALELEG:81) · RK-994493fceb7b (VALELEG:94) · RK-74d42c778166 (VALELEG:99)

#### FR-ELG-02 — Región especial 99  ⚠ LEGACY-QUIRK D12
Región 99 (internacional/diplomático) → "BENEFICIARIO ELEGIVEL - REGIAO
ESPECIAL", **sin ninguna otra verificación**.
*Reglas (1):* RK-86ee7c50f9f4 (VALELEG:107)

#### FR-ELG-03 — Status del beneficiario
S → "BENEFICIARIO SUSPENSO"; C o D → "BENEFICIARIO CANCELADO/DESLIGADO";
I → "BENEFICIARIO INATIVO". Todas vuelven no elegible.
*Reglas (4):* RK-9a4651f7dd24 (VALELEG:116) · RK-7c608b834e79 (VALELEG:117) · RK-fc541e8adcfc (VALELEG:122) · RK-4ff3d6cc6794 (VALELEG:127)

#### FR-ELG-04 — Límites del programa
Si el límite > 0: edad < mín. → "IDADE INFERIOR AO MINIMO DO PROGRAMA"; edad >
máx. → "IDADE SUPERIOR AO MAXIMO DO PROGRAMA"; renta > renta máx. → "RENDA
FAMILIAR ACIMA DO TETO DO PROGRAMA".
*Reglas (6):* RK-06883f7fa2f7 (VALELEG:139) · RK-2cb07a956769 (VALELEG:140) · RK-dd82bfe9d500 (VALELEG:146) · RK-50e8ebafa202 (VALELEG:147) · RK-5f1dcae4ccb7 (VALELEG:157) · RK-4c6d057f4ecb (VALELEG:158)

#### FR-ELG-05 — Reglas por tipo de programa
- A (asistencial): renta > 600,00 y sin dependientes → "PROG ASSISTENCIAL: RENDA
  > 600 SEM DEPENDENTES"; documentos ≠ S → "DOCUMENTACAO INCOMPLETA".
- P (previsional): edad < 60 → "PROG PREVIDENCIARIO: IDADE < 60".
- T (trabajo): edad < 16 o > 65 → "PROG TRABALHO: IDADE FORA DA FAIXA 16-65".
- Otro → "TIPO PROGRAMA DESCONHECIDO".
*Reglas (6):* RK-d9a36a3c8a42 (VALELEG:168) · RK-e5d581584c6d (VALELEG:171) · RK-b63f2863cdab (VALELEG:172) · RK-aa4425811246 (VALELEG:178) · RK-093a02fbe84e (VALELEG:185) · RK-7aeaee84c79d (VALELEG:192)

#### FR-ELG-06 — Código de elegibilidad específico
Si el código (A5) no está vacío: posición 1 = R exige NIS ≠ 0 ("NIS NAO
CADASTRADO"); posición 2 = D exige dependientes ("PROGRAMA REQUER DEPENDENTES").
*Reglas (5):* RK-0cfdfa24b877 (VALELEG:206) · RK-3e570ba9c17c (VALELEG:226) · RK-d7bb85d92636 (VALELEG:228) · RK-af932d091e75 (VALELEG:234) · RK-5f5731566730 (VALELEG:236)

#### FR-ELG-07 — Resultado con todos los motivos
Acumula todos los motivos (máx. 10). Elegible → "BENEFICIARIO ELEGIVEL PARA O
PROGRAMA"; si no, "BENEFICIARIO NAO ELEGIVEL - MOTIVOS:" + lista numerada.
*Reglas (1):* RK-bd27c2ba8977 (VALELEG:213)

### E4 — Cálculo de beneficio y pagos

El cálculo individual (CALCBENF) y el lote mensual (BATCHPGT) usan **la misma
fórmula**: implementar un único motor de cálculo (servicio de dominio) invocado
por ambos. Resultado grabado en `Pagamento` con status `G` (gerado).

#### FR-CAL-01 — Competencia
Entrada: CPF + competencia AAAAMM. Mes fuera de 1–12 → "COMPETENCIA INVALIDA".
*Reglas (3):* RK-7116b6a5174c (CALCBENF:138) · RK-140d297f9d0c (CALCBENF:139) · RK-886f1116333c (CALCBENF:141)

#### FR-CAL-02 — Precondiciones del cálculo
Beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO"; status ≠ A →
"BENEFICIARIO NAO ATIVO - STATUS:" + status; programa inexistente → "PROGRAMA NAO ENCONTRADO".
*Reglas (3):* RK-a88a2f157187 (CALCBENF:155) · RK-a116de8e94cf (CALCBENF:160) · RK-b030809a3f7c (CALCBENF:174)

#### FR-CAL-03 — Factor regional  ⚠ LEGACY-QUIRK D1
Región 1–25 → tabla fija por UF (AC 1,35 · AM 1,32 · AP 1,30 · PA 1,28 · RO 1,31 ·
MA 1,40 · PI 1,38 · CE 1,35 · BA 1,32 · PE 1,36 · SP 1,10 · RJ 1,12 · MG 1,08 ·
ES 1,05 · (15) 1,00 · PR 1,05 · SC 1,07 · RS 1,03 · MS 1,15 · MT 1,20 · GO 1,18 ·
TO 1,25 · DF 1,10 · RR 1,22 · SE 1,33); otra región → 1,0000.
*Reglas (1):* RK-f8d9475ad104 (CALCBENF:180)

#### FR-CAL-04 — Factor familiar
0 dep. → 1,00; 1–2 → 1,00 + n × 0,05; 3–4 → 1,10 + (n − 2) × 0,03; ≥ 5 → 1,16 + (n − 4) × 0,02.
*Reglas (6):* RK-2cced191e62e (CALCBENF:187) · RK-c0d4163cc4d1 (CALCBENF:190) · RK-3461de4d19c8 (CALCBENF:191) · RK-b13aff8bf789 (CALCBENF:193) · RK-5aae34cd08cf (CALCBENF:194) · RK-7e690c7a89ec (CALCBENF:196)

#### FR-CAL-05 — Factor de renta (tramo)  ⚠ LEGACY-QUIRK D1
Primer tramo con renta ≤ tope: 300,00 → 1,00 · 600,00 → 0,85 · 1.000,00 → 0,70 ·
1.500,00 → 0,55 · 9.999,99 → 0,40. (Renta > 9.999,99: factor queda sin asignar
en el legado — ver D17.)
*Reglas (1):* RK-f69f8dc0b6c9 (CALCBENF:306)

#### FR-CAL-06 — Factor de edad
Edad = año de la competencia − año de nacimiento. ≥ 65 → 1,15; ≥ 60 → 1,10; < 18 → 1,05; resto 1,00.
*Reglas (5):* RK-999fc6833a38 (CALCBENF:205) · RK-7b2181c12f19 (CALCBENF:206) · RK-2f190186d76b (CALCBENF:207) · RK-511b65011b73 (CALCBENF:210) · RK-f036e04b0398 (CALCBENF:213)

#### FR-CAL-07 — Valor mensual
`VLR-BENF = VLR-BASE × F.regional × F.familiar × F.renta × F.edad`;
luego `× (1 + FATOR-REAJ del programa)`; truncar. Tipo de pago `N`.
*Reglas (4):* RK-92d4dfd5101f (CALCBENF:225) · RK-4bef7758397d (CALCBENF:229) · RK-bb591a41dbf3 (CALCBENF:232) · RK-9ca5d0466ba9 (CALCBENF:233)

#### FR-CAL-08 — 13.º y abono natalino (diciembre)  ⚠ LEGACY-QUIRK D3
Si mes = 12: tipo `D`; `VLR-13 = VLR-BASE × F.regional × F.edad` (truncar);
bruto = VLR-BENF + VLR-13. Programa tipo A: abono = VLR-BENF × 0,15 (truncar),
se suma al bruto; otros tipos: abono 0. Se muestran VLR-13 y abono.
*Reglas (11):* RK-be875b52514d (CALCBENF:242) · RK-3ac3d33b1b42 (CALCBENF:244) · RK-0f5eb2af85a0 (CALCBENF:246) · RK-f53c75ffb923 (CALCBENF:247) · RK-5add7ccbf625 (CALCBENF:248) · RK-f81e5c8b9a62 (CALCBENF:251) · RK-602168305a78 (CALCBENF:252) · RK-2aeddfcfa687 (CALCBENF:254) · RK-66a219e18a6a (CALCBENF:255) · RK-e8d3c677f5bc (CALCBENF:256) · RK-46191b29bce5 (CALCBENF:297)

#### FR-CAL-09 — Descuento simplificado  ⚠ LEGACY-QUIRK D13
Bruto > 500,00 → descuento = bruto × 0,03 (truncar); si no, 0.
*Reglas (4):* RK-4bee01aa2d9d (CALCBENF:318) · RK-d190c0ee61bb (CALCBENF:319) · RK-f673b82833b9 (CALCBENF:320) · RK-65e0ed4d5b18 (CALCBENF:321)

#### FR-CAL-10 — Valor líquido y grabación
Líquido = bruto − descuento; si < 0 → 0; truncar. Graba pago (CPF, programa,
competencia, bruto, descuento, líquido, fecha de generación = hoy, status `G`,
tipo, abono) y muestra "CALCULO REALIZADO COM SUCESSO" con el resumen.
*Reglas (4):* RK-8d025b23228f (CALCBENF:266) · RK-45fca1f354da (CALCBENF:267) · RK-d8033ba178e5 (CALCBENF:272) · RK-c28ec6795433 (CALCBENF:273)

#### FR-DSC-01 — Recálculo de descuentos de un pago (CALCDSCT)
Entrada: CPF + número de pago. Pago inexistente o de otro CPF → "PAGAMENTO NAO
ENCONTRADO"; beneficiario inexistente → "BENEFICIARIO NAO ENCONTRADO".
*Reglas (3):* RK-314dbfb4a26e (CALCDSCT:75) · RK-8b1376b9c23d (CALCDSCT:82) · RK-0a477ffc9ddc (CALCDSCT:91)

#### FR-DSC-02 — Contribución social progresiva (obligatoria)
Primer tramo con bruto ≤ tope: 500,00 → 3 % · 1.000,00 → 5 % · 2.000,00 → 7 % · 9.999,99 → 9 %.
*Reglas (2):* RK-83b28551c287 (CALCDSCT:195) · RK-70cdacb35c1a (CALCDSCT:196)

#### FR-DSC-03 — Tope de 30 % del bruto  ⚠ LEGACY-QUIRK D2
Tope = bruto × 0,30 (truncar). Tras procesar **cada** descuento no judicial, si
el total acumulado > tope → total = tope. Los judiciales no se limitan (pero un
no judicial posterior puede recortar el total, incluido lo judicial ya sumado).
*Reglas (5):* RK-746a7b5738cf (CALCDSCT:102) · RK-3cde6c2d52e2 (CALCDSCT:104) · RK-636a3924f593 (CALCDSCT:105) · RK-07b224be3337 (CALCDSCT:165) · RK-f27df0e84c50 (CALCDSCT:166)

#### FR-DSC-04 — Vigencia del descuento
Se ignora si fecha fin ≠ 0 y < hoy, o si fecha inicio > hoy.
*Reglas (2):* RK-e3256815c49a (CALCDSCT:112) · RK-873a78f8fdfb (CALCDSCT:116)

#### FR-DSC-05 — Tipos de descuento  ⚠ LEGACY-QUIRK D14/D15
Fuente: descuentos registrados del beneficiario. J (judicial), P (pensión
alimenticia), A (administrativo): valor fijo si > 0, si no bruto × pct/100.
I (impuesto retenido): bruto × pct/100. S (sindical): bruto × 1 %. Otro: ignora.
*Reglas (9):* RK-5d6c495417bb (CALCDSCT:122) · RK-5ebca43330fa (CALCDSCT:125) · RK-7ae0930278f4 (CALCDSCT:128) · RK-813b10f0a6b2 (CALCDSCT:135) · RK-eb8f0ba106d7 (CALCDSCT:138) · RK-88bafd73a684 (CALCDSCT:144) · RK-a6687439e293 (CALCDSCT:149) · RK-43bd100339a0 (CALCDSCT:153) · RK-62ff9a96f5f9 (CALCDSCT:156)

#### FR-DSC-06 — Total y actualización del pago  ⚠ LEGACY-QUIRK D13
Total truncado se graba en el descuento del pago ("DESCONTOS CALCULADOS": bruto,
descuento, tope 30 %). El legado **no recalcula el líquido**.
*Reglas (2):* RK-ed72fdc907a3 (CALCDSCT:175) · RK-462a16645319 (CALCDSCT:176)

#### FR-LOT-01 — Lote mensual de pagos (BATCHPGT): competencia
Competencia = año/mes de la fecha de ejecución. Pensado para el 1.er día hábil.
Numeración: `NUM-PAGTO` secuencial a partir del mayor existente.
*Reglas (3):* RK-275ebe83e773 (BATCHPGT:108) · RK-af5872bb5b6c (BATCHPGT:109) · RK-8b46847de08b (BATCHPGT:110)

#### FR-LOT-02 — Selección de beneficiarios
Recorre beneficiarios **en orden de CPF** (sistemas posteriores dependen de esta
orden). Ignora: CPF repetido, status ≠ A, pago ya generado en la competencia,
programa inactivo. Programa inexistente → error registrado
"ERRO: PROG NAO ENCONTRADO CPF=… PROG=…" y sigue.
*Reglas (6):* RK-7d3e373f4754 (BATCHPGT:188) · RK-bf3826b5e614 (BATCHPGT:195) · RK-644073d95848 (BATCHPGT:203) · RK-684b2581729a (BATCHPGT:207) · RK-7f911d03a299 (BATCHPGT:220) · RK-4f462c2048b7 (BATCHPGT:227)

#### FR-LOT-03 — Cálculo idéntico al individual
Aplica FR-CAL-03…FR-CAL-10 (motor compartido), con edad calculada sobre el año
de la competencia.
*Reglas (35):* RK-714fd6ddfb82 (BATCHPGT:236) · RK-540fc024b18c (BATCHPGT:237) · RK-0dd27e7579c4 (BATCHPGT:240) · RK-5ea515fab8f3 (BATCHPGT:247) · RK-f5d5302be54b (BATCHPGT:250) · RK-c22371bd5232 (BATCHPGT:251) · RK-214450c0f73f (BATCHPGT:253) · RK-c4f50dc3ca8a (BATCHPGT:254) · RK-536175a6629f (BATCHPGT:256) · RK-809cefb3e473 (BATCHPGT:265) · RK-b9c96b4d502e (BATCHPGT:268) · RK-783a0059ec74 (BATCHPGT:271) · RK-82624e7a43c9 (BATCHPGT:280) · RK-a807625f63e9 (BATCHPGT:282) · RK-4cab47bee5b1 (BATCHPGT:284) · RK-00a9411b5321 (BATCHPGT:285) · RK-d4c02c7ef1e7 (BATCHPGT:292) · RK-1838f13fae05 (BATCHPGT:294) · RK-7d6f8bc734b4 (BATCHPGT:295) · RK-7b2fc1482b07 (BATCHPGT:296) · RK-a049d00d5cfc (BATCHPGT:297) · RK-76c532772e71 (BATCHPGT:298) · RK-a202ec1224da (BATCHPGT:299) · RK-9ff58ea7fd88 (BATCHPGT:300) · RK-76a575ac73c7 (BATCHPGT:301) · RK-6f5f5f139ddf (BATCHPGT:302) · RK-75ff56906ba0 (BATCHPGT:308) · RK-1d328e485c60 (BATCHPGT:309) · RK-2dd8a96d00d2 (BATCHPGT:310) · RK-f56fad9e4ff6 (BATCHPGT:311) · RK-61c33b29d6a8 (BATCHPGT:315) · RK-b5749db3ea0e (BATCHPGT:316) · RK-8cbfbd730fa5 (BATCHPGT:319) · RK-273a402e3fcf (BATCHPGT:320) · RK-bf29157d9a87 (BATCHPGT:370)

#### FR-LOT-04 — Progreso y resumen
Cada 1.000 pagos generados registra progreso ("PROCESSADOS: n ULTIMO CPF: …").
Al final: competencia, procesados, generados, ignorados, errores y totales de
bruto, descuento, líquido y abono.
*Reglas (1):* RK-69bb52067a2a (BATCHPGT:345)

### E5 — Corrección retroactiva (CALCCORR)

#### FR-COR-01 — Período
Entrada: CPF + competencia inicial + final. Inicial > final → "PERIODO INVALIDO -
COMP INICIAL > FINAL". Procesa los pagos del CPF dentro del período.
*Reglas (4):* RK-5416be5ab4a9 (CALCCORR:119) · RK-fadeb6de594c (CALCCORR:129) · RK-21f4cc982e48 (CALCCORR:133) · RK-fa50ce8fa3e7 (CALCCORR:136)

#### FR-COR-02 — No recorregir
Pago con indicador de corregido = S se ignora.
*Reglas (1):* RK-d24d71f27db8 (CALCCORR:140)

#### FR-COR-03 — Índice IPCA  ⚠ LEGACY-QUIRK D9
Índice = 1 × (1 + IPCA del mes de la competencia) según tabla fija 2010–2012.
Competencias fuera de esa tabla → índice 1 (sin corrección).
*Reglas (4):* RK-d87bc4bc2bc4 (CALCCORR:180) · RK-d7af59c5343d (CALCCORR:181) · RK-012f5e03ef37 (CALCCORR:184) · RK-2a52231a524c (CALCCORR:185)

#### FR-COR-04 — Aplicación
Corregido = bruto × índice (truncar); diferencia = corregido − bruto. Solo si
diferencia > 0: graba valor de corrección, fecha de corrección = hoy, indicador S.
Resumen: "CORRECAO RETROATIVA FINALIZADA", registros corregidos y valor total.
*Reglas (5):* RK-7ac41f6abbe2 (CALCCORR:152) · RK-26314a2e669a (CALCCORR:154) · RK-ef8db09fc095 (CALCCORR:155) · RK-146fee57d2a4 (CALCCORR:156) · RK-b5eb9d994cd9 (CALCCORR:158)

### E6 — Conciliación bancaria (BATCHCON)

#### FR-CNB-01 — Lectura del retorno CNAB 240 (Banco do Brasil)
Entrada: competencia + archivo de retorno. Solo registros de detalle (tipo = '3',
posición 8). Campos: CPF 44–54, valor 120–134 (en centavos, ÷100), fecha de pago
140–147, número de documento 74–83, código de retorno 231–232.
*Reglas (2):* RK-7747831dca9a (BATCHCON:116) · RK-1121c69fbbdb (BATCHCON:132)

#### FR-CNB-02 — Correspondencia con el pago
Por número de documento = número de pago **y** mismo CPF **y** misma
competencia. Si no → "NAO ENCONTRADO: CPF=… DOC=…".
*Reglas (2):* RK-3d6fe48b2bba (BATCHCON:140) · RK-31d94b6dc065 (BATCHCON:146)

#### FR-CNB-03 — Divergencia de valor
|líquido SIFAP − valor banco| > 0,01 → "DIVERGENCIA: CPF=… SIFAP=… BANCO=…" y
auditoría acción `DV` (valor anterior = líquido SIFAP, nuevo = valor banco).
*Reglas (4):* RK-8649d421b7d9 (BATCHCON:155) · RK-25bb549502ed (BATCHCON:156) · RK-46ead0f200b6 (BATCHCON:157) · RK-8c11d37225a3 (BATCHCON:160)

#### FR-CNB-04 — Actualización por código de retorno
Sin divergencia: 00 → status `P` (pago), fecha de pago, banco 1; 01 → `D`
(devuelto); 02 → `E` (estornado); otro → "COD RETORNO DESCONHECIDO: …".
Graba auditoría acción `CO` ("CONCILIADO COD RET=…"), usuario `BATCH`.
Resumen: leídos, conciliados, divergentes, no encontrados, registros de auditoría.
*Reglas (1):* RK-9af86fb5374c (BATCHCON:171)

### E7 — Informes y auditoría

#### FR-REL-01 — Informe analítico de pagos (RELPGT): filtros
Competencia inicial y final; programa (0 = todos).
*Reglas (2):* RK-c1a8ff5dbe7b (RELPGT:83) · RK-5a5f1426d63d (RELPGT:87)

#### FR-REL-02 — Subtotales por programa
Corte de control por programa con subtotal de bruto, líquido y cantidad; total general al final.
*Reglas (2):* RK-7c5773e59cfe (RELPGT:93) · RK-65a445d0bcfe (RELPGT:173)

#### FR-REL-03 — Descripciones y máscara
Tipo: N=NORMAL, D=DECIMO, T=TERCEIRO. Status: G=GERADO, P=PAGO, C=CANCELAD,
D=DEVOLVID, E=ESTORNAD. CPF enmascarado `***.XXX.XXX-XX`; nombre (30 car.) y UF del beneficiario.
*Reglas (2):* RK-b0f53e1b01b3 (RELPGT:116) · RK-4fcb39638b68 (RELPGT:128)

#### FR-REL-04 — Paginación
66 líneas por página con cabecera (versión web: paginado equivalente + exportación imprimible).
*Reglas (1):* RK-e6e70b3b6737 (RELPGT:144)

#### FR-REL-05 — Informe consolidado mensual (BATCHREL)
Entrada: competencia. Totales por región, por status y generales.
*Reglas (1):* RK-4aadc8392e9b (BATCHREL:106)

#### FR-REL-06 — Agrupación por región  ⚠ LEGACY-QUIRK D10
Código región 1–5 NORTE · 6–10 NORDESTE · 11–15 SUDESTE · 16–20 SUL · resto CENTRO-OESTE.
*Reglas (4):* RK-d8b1ac2e14eb (BATCHREL:117) · RK-0cdc90e2bd81 (BATCHREL:120) · RK-8b828d08f033 (BATCHREL:123) · RK-893670f64c20 (BATCHREL:126)

#### FR-REL-07 — Redondeo del bruto  ⚠ LEGACY-QUIRK D11
En este informe el bruto se **redondea** (+0,005 y trunca) antes de sumar, a
diferencia del cálculo, que trunca.
*Reglas (3):* RK-35bd4d675058 (BATCHREL:137) · RK-aeeeeeec3fcd (BATCHREL:138) · RK-1a7fe69dd6d1 (BATCHREL:139)

#### FR-REL-08 — Totales por status
G=GERADO, P=PAGO, C=CANCELADO, D=DEVOLVIDO, E=ESTORNADO; otro cuenta como GERADO.
*Reglas (1):* RK-95081b4796b9 (BATCHREL:146)

#### FR-AUD-01 — Informe de auditoría (RELAUDIT): valores por defecto
Salida vacía → T (pantalla). Fecha inicial vacía → 19970101. Fecha final vacía → hoy.
*Reglas (3):* RK-b4fe11eb2c22 (RELAUDIT:80) · RK-d99bee200be3 (RELAUDIT:84) · RK-819d962f567a (RELAUDIT:87)

#### FR-AUD-02 — Rango de fechas
Solo eventos con fecha entre inicial y final.
*Reglas (2):* RK-713713b19064 (RELAUDIT:93) · RK-aae01121639f (RELAUDIT:96)

#### FR-AUD-03 — Exclusiones ocultas
Eventos de acción `EX` **nunca** se muestran (cuentan como filtrados).
*Reglas (1):* RK-2e5c9f06f325 (RELAUDIT:105)

#### FR-AUD-04 — Filtros opcionales
Acción, usuario y tabla: si informados, filtran por igualdad.
*Reglas (6):* RK-b3ac1f6f4ede (RELAUDIT:111) · RK-be935d51d847 (RELAUDIT:112) · RK-78771795cd8b (RELAUDIT:119) · RK-bea2ff075a6c (RELAUDIT:120) · RK-60326023cab9 (RELAUDIT:127) · RK-7f232f1dd913 (RELAUDIT:128)

#### FR-AUD-05 — Conteo por acción
IN=INCLUSAO, AL=ALTERACAO, CO=CONCILIACAO, CN=CONSULTA, DV=DIVERGENCIA, otro=OUTRA.
Resumen: total, exhibidos, filtrados y conteo por acción.
*Reglas (1):* RK-6a74a1f56dab (RELAUDIT:137)

#### FR-AUD-06 — Salida pantalla / impresión
Pantalla (T): fecha, hora HH:MM:SS, usuario, acción, tabla, clave. Impresión (I):
además la descripción. Paginación de 66 líneas.
*Reglas (3):* RK-9ec291e3f4e5 (RELAUDIT:164) · RK-4e229cab081e (RELAUDIT:169) · RK-7083ebf609a1 (RELAUDIT:210)

#### FR-AUD-07 — Auditoría inmutable
La auditoría solo la escribe el sistema (hoy: conciliación, acciones CO/DV). No
hay alta, edición ni borrado por la UI.
*Reglas:* ninguna adicional (derivado de BATCHCON/RELAUDIT y del DDM `AUDITORIA`).

## 5. Decisiones LEGACY-QUIRK

Criterio aprobado (2026-09-24): **replicar el comportamiento legado** y marcarlo
en el código con `// LEGACY-QUIRK(Dn)`. D4 queda detrás de un flag desactivado por defecto.

| ID | Comportamiento legado | Decisión fase 1 | FR |
|---|---|---|---|
| D1 | Tablas de factor regional y tramos de renta **fijas en el código**, aunque el DDM tiene `GRP-PARAM-REGIONAL` / `GRP-FAIXA-CALCULO` | Replicar tablas fijas; los grupos se persisten y editan pero el cálculo no los usa | FR-CAL-03, FR-CAL-05, FR-PRG-04 |
| D2 | Tope 30 % aplicado dentro del loop sobre el total acumulado; puede recortar lo judicial | Replicar | FR-DSC-03 |
| D3 | Comentario del 13.º dice "× meses activos/12"; el código no lo hace | Replicar el código | FR-CAL-08 |
| D4 | CPF con prefijos especiales anula todos los errores de documentos | Replicar detrás del flag `LEGACY_DOC_ESPECIAL_ENABLED` (**desactivado por defecto**); activar solo con aprobación de negocio/seguridad | FR-DOC-03 |
| D4b | CPF con 11 dígitos iguales empezando por 000 es válido | Replicar | FR-VAL-02 |
| D5 | Edad > 75 → status S también en alteración | Replicar | FR-BEN-05 |
| D6 | Límite de dependientes corta en > 5 (permite 6); DDM admite 10 | Replicar | FR-DEP-02 |
| D7 | Máscara de CPF inconsistente con ceros a la izquierda | Replicar (requiere aprobación de auditoría para cambiar) | FR-CON-04 |
| D8 | VLR-BASE grabado × FATOR-K y luego × (1 + FATOR-REAJ) en el cálculo | Replicar | FR-PRG-03, FR-CAL-07 |
| D9 | Tabla IPCA solo 2010–2012 | Replicar tabla; otros años sin corrección | FR-COR-03 |
| D10 | Agrupación de regiones del informe difiere del DDM | Replicar | FR-REL-06 |
| D11 | Informe redondea, cálculo trunca | Replicar | FR-REL-07 |
| D12 | Región 99 elegible sin verificaciones | Replicar | FR-ELG-02 |
| D13 | Dos algoritmos de descuento (3 % plano en cálculo/lote vs progresivo en CALCDSCT); CALCDSCT no recalcula el líquido | Replicar ambos | FR-CAL-09, FR-DSC-06 |
| D14 | CALCDSCT lee descuentos del beneficiario; el DDM los ubica en el pago | Descuentos registrados → hijo de Beneficiario; descuentos aplicados → hijo de Pagamento | FR-DSC-05 |
| D15 | Dominios divergentes código × DDM (status de pago, parentesco, tipo de descuento) | Usar dominios del **código** (comportamiento); documentar los del DDM | FR-DEP-03, FR-DSC-05, FR-CNB-04 |
| D16 | Febrero siempre con 29 días | Replicar | FR-VAL-03 |
| D17 | Renta > 9.999,99 no encaja en ningún tramo: el factor de renta no se asigna. Cálculo individual → factor 0 (beneficio 0); lote → **arrastra el factor del beneficiario anterior** | Replicar individual (0); en lote replicar con `TODO(review)` — probable bug a confirmar con negocio | FR-CAL-05, FR-LOT-03 |

### 5.1 Correcciones configurables (2026-09-25)

Decisión del usuario: **corrección con flag**. Cada quirk conserva la réplica del
legado como comportamiento por defecto (paridad con el mainframe) y tiene su
comportamiento corregido implementado, activable por configuración:

- `SIFAP_QUIRKS_CORRIGIDOS`: lista separada por comas de los quirks a corregir
  (p. ej. `D17,D21,D23`) o `ALL`. **`ALL` no incluye D7** (cambiar la máscara de CPF
  exige aprobación de auditoría): se activa explícitamente con `ALL,D7`.
- `LEGACY_DOC_ESPECIAL_ENABLED` (D4) y `LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED` (D18):
  funcionan al revés — el default ya es el comportamiento corregido y el flag
  activa la réplica del legado.
- Configuración inválida → la solicitud responde con el mensaje genérico y el log
  nombra la variable (sin datos personales); la CLI del lote termina con código 2.
- En el código: `// LEGACY-QUIRK(Dn)` marca la rama legado y `// CORRECAO(Dn)` la corregida.

| ID | Corregido (`Dn` activo) |
|---|---|
| D4 | (default) sin bypass por prefijo de CPF; `LEGACY_DOC_ESPECIAL_ENABLED=true` lo reactiva |
| D4b | Todo CPF con 11 dígitos iguales es inválido |
| D5 | Edad > 75 → S solo en la inclusión |
| D6 | Máximo 5 dependientes |
| D7 | Máscara de consulta siempre `***.***.XXX-XX` (requiere aprobación de auditoría) |
| D8 | El motor no reaplica (1 + FATOR-REAJ) sobre la base ya × FATOR-K |
| D9 | Año sin IPCA → pago no procesado, aviso `SEM INDICE IPCA` |
| D10 | Consolidado: regiones 0/99/>25/sin beneficiario → fila `NAO CLASSIFICADA` |
| D11 | Consolidado suma el bruto sin redondeo (sin efecto sobre centavos enteros) |
| D12 | Región 99 pasa por todas las verificaciones de elegibilidad |
| D13 | CALCDSCT recalcula y graba el líquido (solo pagos en status G; si no, aviso) sobre el bruto original |
| D16 | Febrero según año bisiesto real |
| D17 | El lote no arrastra el factor de renta (igual al individual); beneficios cero avisados en el resumen |
| D18 | (default) status editable (PRD FR-BEN-01); `LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED=true` graba en blanco |
| D19 | Nombre con al menos dos palabras |
| D20 | Largo del RG sin contar espacios |
| D21 | Consulta muestra los últimos 12 pagos, del más reciente al más antiguo |
| D22 | Corrección IPCA sin parada temprana (orden por competencia dentro del período) |
| D23 | Fecha de pago CNAB convertida a AAAAMMDD; inválida → 0 + aviso |

D1–D3 no son configurables (fuera de alcance); D14/D15 son decisiones de modelo.
Nota operativa: cambiar un flag no reescribe datos ya grabados (p. ej. fechas de pago
en DDMMAAAA grabadas en modo legado D23, o líquidos no recalculados en modo D13).

## 6. Requisitos no funcionales

- **NFR-01 Dinero:** `Decimal` en todo el stack; truncado a 2 decimales por
  utilidad única; prohibido `float` para valores.
- **NFR-02 Fechas legadas:** AAAAMMDD / AAAAMM según la decisión de `architecture.md`;
  toda aritmética de edad es por año.
- **NFR-03 Regresión de cálculo:** suite de casos derivados del fuente (factores,
  13.º, abono, descuentos, tope, corrección) que valida resultados al centavo.
- **NFR-04 LGPD:** CPF enmascarado en consultas e informes; datos personales
  nunca en logs.
- **NFR-05 Auditoría inmutable:** solo escritura por el sistema (FR-AUD-07).
- **NFR-06 Validación en el borde:** zod en cada API; mensajes del legado literales.
- **NFR-07 Trazabilidad:** cada historia cita sus `RK-`; código de reglas con
  comentario `// RK-…`.

## 7. Fuera de alcance

- Migración de datos del Adabas.
- Integración con Banco Real (código comentado, banco extinto en 2007).
- Corrección Plano Verão 1989–1991 (código comentado).
- Remesa bancaria, integración SIAFI y biometría (campos existen en el DDM,
  sin lógica en los programas).

## Anexo A — Trazabilidad de reglas (289)

| RK | Programa:línea | Tipo | FR | Extracto |
|---|---|---|---|---|
| RK-7747831dca9a | BATCHCON:116 | FIELD_VALIDATION | FR-CNB-01 | `IF #CNAB-TIPO-REG NE '3' THEN ESCAPE TOP` |
| RK-1121c69fbbdb | BATCHCON:132 | COMPUTATION | FR-CNB-01 | `COMPUTE #VLR-RETORNO = #VLR-RETORNO / 100` |
| RK-3d6fe48b2bba | BATCHCON:140 | FIELD_VALIDATION | FR-CNB-02 | `IF PAGAMENTO-V.CPF-BENEF = #CPF-NUM THEN AND PAGAMENTO-V.COMPETENCIA = #COMPETENCIA / MOVE` |
| RK-31d94b6dc065 | BATCHCON:146 | FIELD_VALIDATION | FR-CNB-02 | `IF NOT #FOUND THEN ADD 1 TO #QTD-NAO-ENCONTRADOS / COMPRESS 'NAO ENCONTRADO: CPF=' #CNAB-C` |
| RK-8649d421b7d9 | BATCHCON:155 | COMPUTATION | FR-CNB-03 | `COMPUTE #DIFF = PAGAMENTO-V.VLR-LIQUIDO - #VLR-RETORNO` |
| RK-25bb549502ed | BATCHCON:156 | FIELD_VALIDATION | FR-CNB-03 | `IF #DIFF < 0 THEN COMPUTE #DIFF = #DIFF * -1` |
| RK-46ead0f200b6 | BATCHCON:157 | COMPUTATION | FR-CNB-03 | `COMPUTE #DIFF = #DIFF * -1` |
| RK-8c11d37225a3 | BATCHCON:160 | FIELD_VALIDATION | FR-CNB-03 | `IF #DIFF > 0.01 THEN ADD 1 TO #QTD-DIVERGENTES / COMPRESS 'DIVERGENCIA: CPF=' #CNAB-CPF / ` |
| RK-9af86fb5374c | BATCHCON:171 | — | FR-CNB-04 | `DECIDE ON FIRST VALUE OF #COD-RET` |
| RK-275ebe83e773 | BATCHPGT:108 | COMPUTATION | FR-LOT-01 | `COMPUTE #ANO = #DT-HOJE / 10000` |
| RK-af5872bb5b6c | BATCHPGT:109 | COMPUTATION | FR-LOT-01 | `COMPUTE #MES = (#DT-HOJE - (#ANO * 10000)) / 100` |
| RK-8b46847de08b | BATCHPGT:110 | COMPUTATION | FR-LOT-01 | `COMPUTE #COMPETENCIA = (#ANO * 100) + #MES` |
| RK-7d3e373f4754 | BATCHPGT:188 | FIELD_VALIDATION | FR-LOT-02 | `IF BENEFICIARIO-V.CPF = #CPF-ANT THEN ADD 1 TO #QTD-IGNORADOS / ESCAPE TOP` |
| RK-bf3826b5e614 | BATCHPGT:195 | FIELD_VALIDATION | FR-LOT-02 | `IF BENEFICIARIO-V.STATUS NE 'A' THEN ADD 1 TO #QTD-IGNORADOS / ESCAPE TOP` |
| RK-644073d95848 | BATCHPGT:203 | FIELD_VALIDATION | FR-LOT-02 | `IF PAGAMENTO-V.COMPETENCIA = #COMPETENCIA THEN MOVE TRUE TO #JA-GERADO` |
| RK-684b2581729a | BATCHPGT:207 | FIELD_VALIDATION | FR-LOT-02 | `IF #JA-GERADO THEN ADD 1 TO #QTD-IGNORADOS / ESCAPE TOP` |
| RK-7f911d03a299 | BATCHPGT:220 | FIELD_VALIDATION | FR-LOT-02 | `IF NOT #FOUND-P THEN COMPRESS 'ERRO: PROG NAO ENCONTRADO CPF=' BENEFICIARIO-V.CPF / 'PROG=` |
| RK-4f462c2048b7 | BATCHPGT:227 | FIELD_VALIDATION | FR-LOT-02 | `IF PROGRAMA-V.STATUS-PROG NE 'A' THEN ADD 1 TO #QTD-IGNORADOS / ESCAPE TOP` |
| RK-714fd6ddfb82 | BATCHPGT:236 | COMPUTATION | FR-LOT-03 | `COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000` |
| RK-540fc024b18c | BATCHPGT:237 | COMPUTATION | FR-LOT-03 | `COMPUTE #IDADE = #ANO - #ANO-NASC` |
| RK-0dd27e7579c4 | BATCHPGT:240 | FIELD_VALIDATION | FR-LOT-03 | `IF #COD-REG >= 1 AND #COD-REG <= 25 THEN MOVE #TAB-REG(#COD-REG) TO #FATOR-REG` |
| RK-5ea515fab8f3 | BATCHPGT:247 | FIELD_VALIDATION | FR-LOT-03 | `IF #NUM-DEP = 0 THEN MOVE 1.0000 TO #FATOR-FAM` |
| RK-f5d5302be54b | BATCHPGT:250 | FIELD_VALIDATION | FR-LOT-03 | `IF #NUM-DEP <= 2 THEN COMPUTE #FATOR-FAM = 1.0000 + (#NUM-DEP * 0.0500)` |
| RK-c22371bd5232 | BATCHPGT:251 | COMPUTATION | FR-LOT-03 | `COMPUTE #FATOR-FAM = 1.0000 + (#NUM-DEP * 0.0500)` |
| RK-214450c0f73f | BATCHPGT:253 | FIELD_VALIDATION | FR-LOT-03 | `IF #NUM-DEP <= 4 THEN COMPUTE #FATOR-FAM = 1.1000 + ((#NUM-DEP - 2) * 0.0300)` |
| RK-c4f50dc3ca8a | BATCHPGT:254 | COMPUTATION | FR-LOT-03 | `COMPUTE #FATOR-FAM = 1.1000 + ((#NUM-DEP - 2) * 0.0300)` |
| RK-536175a6629f | BATCHPGT:256 | COMPUTATION | FR-LOT-03 | `COMPUTE #FATOR-FAM = 1.1600 + ((#NUM-DEP - 4) * 0.0200)` |
| RK-809cefb3e473 | BATCHPGT:265 | FIELD_VALIDATION | FR-LOT-03 | `IF #IDADE >= 65 THEN MOVE 1.1500 TO #FATOR-IDADE` |
| RK-b9c96b4d502e | BATCHPGT:268 | FIELD_VALIDATION | FR-LOT-03 | `IF #IDADE >= 60 THEN MOVE 1.1000 TO #FATOR-IDADE` |
| RK-783a0059ec74 | BATCHPGT:271 | FIELD_VALIDATION | FR-LOT-03 | `IF #IDADE < 18 THEN MOVE 1.0500 TO #FATOR-IDADE` |
| RK-82624e7a43c9 | BATCHPGT:280 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-BENF = #VLR-BASE * #FATOR-REG * #FATOR-FAM` |
| RK-a807625f63e9 | BATCHPGT:282 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-BENF = #VLR-BENF * (1 + #FATOR-REAJ)` |
| RK-4cab47bee5b1 | BATCHPGT:284 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-TEMP = #VLR-BENF * 100` |
| RK-00a9411b5321 | BATCHPGT:285 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-BENF = #VLR-TEMP / 100` |
| RK-d4c02c7ef1e7 | BATCHPGT:292 | FIELD_VALIDATION | FR-LOT-03 | `IF #MES = 12 THEN MOVE 'D' TO #TIPO-PGTO / COMPUTE #VLR-13 = #VLR-BASE * #FATOR-REG * #FAT` |
| RK-1838f13fae05 | BATCHPGT:294 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-13 = #VLR-BASE * #FATOR-REG * #FATOR-IDADE` |
| RK-7d6f8bc734b4 | BATCHPGT:295 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-TEMP = #VLR-13 * 100` |
| RK-7b2fc1482b07 | BATCHPGT:296 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-13 = #VLR-TEMP / 100` |
| RK-a049d00d5cfc | BATCHPGT:297 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-BRUTO = #VLR-BENF + #VLR-13` |
| RK-76c532772e71 | BATCHPGT:298 | FIELD_VALIDATION | FR-LOT-03 | `IF #TIPO-PROG = 'A' THEN COMPUTE #VLR-ABONO = #VLR-BENF * 0.15 / COMPUTE #VLR-TEMP = #VLR-` |
| RK-a202ec1224da | BATCHPGT:299 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-ABONO = #VLR-BENF * 0.15` |
| RK-9ff58ea7fd88 | BATCHPGT:300 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-TEMP = #VLR-ABONO * 100` |
| RK-76a575ac73c7 | BATCHPGT:301 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-ABONO = #VLR-TEMP / 100` |
| RK-6f5f5f139ddf | BATCHPGT:302 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-BRUTO = #VLR-BRUTO + #VLR-ABONO` |
| RK-75ff56906ba0 | BATCHPGT:308 | FIELD_VALIDATION | FR-LOT-03 | `IF #VLR-BRUTO > 500.00 THEN COMPUTE #VLR-DESC = #VLR-BRUTO * 0.03 / COMPUTE #VLR-TEMP = #V` |
| RK-1d328e485c60 | BATCHPGT:309 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-DESC = #VLR-BRUTO * 0.03` |
| RK-2dd8a96d00d2 | BATCHPGT:310 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-TEMP = #VLR-DESC * 100` |
| RK-f56fad9e4ff6 | BATCHPGT:311 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-DESC = #VLR-TEMP / 100` |
| RK-61c33b29d6a8 | BATCHPGT:315 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-LIQ = #VLR-BRUTO - #VLR-DESC` |
| RK-b5749db3ea0e | BATCHPGT:316 | FIELD_VALIDATION | FR-LOT-03 | `IF #VLR-LIQ < 0 THEN MOVE 0 TO #VLR-LIQ` |
| RK-8cbfbd730fa5 | BATCHPGT:319 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-TEMP = #VLR-LIQ * 100` |
| RK-273a402e3fcf | BATCHPGT:320 | COMPUTATION | FR-LOT-03 | `COMPUTE #VLR-LIQ = #VLR-TEMP / 100` |
| RK-69bb52067a2a | BATCHPGT:345 | FIELD_VALIDATION | FR-LOT-04 | `IF #QTD-GERADOS MOD 1000 = 0 THEN WRITE 'PROCESSADOS:' #QTD-GERADOS 'ULTIMO CPF:' BENEFICI` |
| RK-bf29157d9a87 | BATCHPGT:370 | FIELD_VALIDATION | FR-LOT-03 | `IF #RENDA <= #FAIXA-RENDA(#J) THEN MOVE #FATOR-FAIXA(#J) TO #FATOR-RND / ESCAPE BOTTOM` |
| RK-4aadc8392e9b | BATCHREL:106 | FIELD_VALIDATION | FR-REL-05 | `IF PAGAMENTO-V.COMPETENCIA NE #COMPETENCIA THEN ESCAPE BOTTOM` |
| RK-d8b1ac2e14eb | BATCHREL:117 | FIELD_VALIDATION | FR-REL-06 | `IF #COD-REG >= 1 AND #COD-REG <= 5 THEN MOVE 1 TO #IDX-REG` |
| RK-0cdc90e2bd81 | BATCHREL:120 | FIELD_VALIDATION | FR-REL-06 | `IF #COD-REG >= 6 AND #COD-REG <= 10 THEN MOVE 2 TO #IDX-REG` |
| RK-8b828d08f033 | BATCHREL:123 | FIELD_VALIDATION | FR-REL-06 | `IF #COD-REG >= 11 AND #COD-REG <= 15 THEN MOVE 3 TO #IDX-REG` |
| RK-893670f64c20 | BATCHREL:126 | FIELD_VALIDATION | FR-REL-06 | `IF #COD-REG >= 16 AND #COD-REG <= 20 THEN MOVE 4 TO #IDX-REG` |
| RK-35bd4d675058 | BATCHREL:137 | COMPUTATION | FR-REL-07 | `COMPUTE #VLR-ARR = PAGAMENTO-V.VLR-BRUTO + 0.005` |
| RK-aeeeeeec3fcd | BATCHREL:138 | COMPUTATION | FR-REL-07 | `COMPUTE #VLR-TEMP = #VLR-ARR * 100` |
| RK-1a7fe69dd6d1 | BATCHREL:139 | COMPUTATION | FR-REL-07 | `COMPUTE #VLR-ARR = #VLR-TEMP / 100` |
| RK-95081b4796b9 | BATCHREL:146 | — | FR-REL-08 | `DECIDE ON FIRST VALUE OF PAGAMENTO-V.STATUS-PGTO` |
| RK-c83257ae5f85 | CADBENEF:99 | FIELD_VALIDATION | FR-BEN-01 | `IF #OPER NE 'I' AND #OPER NE 'A' THEN MOVE 'OPERACAO INVALIDA - INFORME I OU A' TO #MSG / ` |
| RK-40623cadda7c | CADBENEF:105 | FIELD_VALIDATION | FR-BEN-02 | `IF #CPF = 0 THEN MOVE 'CPF OBRIGATORIO' TO #MSG / MOVE TRUE TO #ERRO / ESCAPE BOTTOM` |
| RK-bc7d67f3dad4 | CADBENEF:113 | FIELD_VALIDATION | FR-BEN-03 | `IF NOT #CPF-VALIDO THEN MOVE 'CPF INVALIDO - DIGITO VERIFICADOR INCORRETO' TO #MSG / MOVE ` |
| RK-e1aba7261a6b | CADBENEF:119 | FIELD_VALIDATION | FR-BEN-02 | `IF #NOME = ' ' THEN MOVE 'NOME OBRIGATORIO' TO #MSG / MOVE TRUE TO #ERRO / ESCAPE BOTTOM` |
| RK-a14601290959 | CADBENEF:125 | FIELD_VALIDATION | FR-BEN-02 | `IF #DT-NASC = 0 THEN MOVE 'DATA NASCIMENTO OBRIGATORIA' TO #MSG / MOVE TRUE TO #ERRO / ESC` |
| RK-e17b444be69b | CADBENEF:131 | FIELD_VALIDATION | FR-BEN-02 | `IF #SEXO NE 'M' AND #SEXO NE 'F' THEN MOVE 'SEXO INVALIDO' TO #MSG / MOVE TRUE TO #ERRO / ` |
| RK-7d4387e99f5a | CADBENEF:143 | FIELD_VALIDATION | FR-BEN-01 | `IF #OPER = 'I' AND #FOUND THEN MOVE 'BENEFICIARIO JA CADASTRADO' TO #MSG / MOVE TRUE TO #E` |
| RK-2f8766f52e1b | CADBENEF:149 | FIELD_VALIDATION | FR-BEN-01 | `IF #OPER = 'A' AND NOT #FOUND THEN MOVE 'BENEFICIARIO NAO ENCONTRADO PARA ALTERACAO' TO #M` |
| RK-46154d4f44a9 | CADBENEF:159 | COMPUTATION | FR-BEN-05 | `COMPUTE #IDADE = #ANO-ATUAL - #ANO-NASC` |
| RK-e4b2970fefe6 | CADBENEF:162 | FIELD_VALIDATION | FR-BEN-04 | `IF #OPER = 'I' THEN MOVE 'A' TO #STATUS` |
| RK-9ffc13028ce4 | CADBENEF:167 | FIELD_VALIDATION | FR-BEN-05 | `IF #IDADE > 75 THEN MOVE 'S' TO #STATUS` |
| RK-07ac728d731a | CADBENEF:171 | FIELD_VALIDATION | FR-BEN-01 | `IF #ERRO THEN WRITE #MSG / ESCAPE ROUTINE` |
| RK-b89433734937 | CADBENEF:177 | — | FR-BEN-01 | `DECIDE ON FIRST VALUE OF #OPER` |
| RK-99ffed6e1d57 | CADBENEF:237 | COMPUTATION | FR-BEN-03 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-ab368e4ef3e2 | CADBENEF:240 | COMPUTATION | FR-BEN-03 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-a04fb0c62d98 | CADBENEF:241 | FIELD_VALIDATION | FR-BEN-03 | `IF #RESTO < 2 THEN MOVE 0 TO #DV1` |
| RK-02b5279daf63 | CADBENEF:244 | COMPUTATION | FR-BEN-03 | `COMPUTE #DV1 = 11 - #RESTO` |
| RK-476620ed64ce | CADBENEF:247 | FIELD_VALIDATION | FR-BEN-03 | `IF #DV1 NE #DIG(10) THEN MOVE FALSE TO #CPF-VALIDO / ESCAPE ROUTINE` |
| RK-98472f98558e | CADBENEF:256 | COMPUTATION | FR-BEN-03 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-d05375bd9555 | CADBENEF:259 | COMPUTATION | FR-BEN-03 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-8178f6bfb367 | CADBENEF:260 | FIELD_VALIDATION | FR-BEN-03 | `IF #RESTO < 2 THEN MOVE 0 TO #DV2` |
| RK-a4491331af7d | CADBENEF:263 | COMPUTATION | FR-BEN-03 | `COMPUTE #DV2 = 11 - #RESTO` |
| RK-9e739b6b003d | CADBENEF:266 | FIELD_VALIDATION | FR-BEN-03 | `IF #DV2 NE #DIG(11) THEN MOVE FALSE TO #CPF-VALIDO` |
| RK-6badeec05527 | CADDEPEND:51 | FIELD_VALIDATION | FR-DEP-01 | `IF NOT #FOUND THEN WRITE 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-7f25da1eeff3 | CADDEPEND:56 | FIELD_VALIDATION | FR-DEP-01 | `IF BENEFICIARIO-V.STATUS = 'C' OR BENEFICIARIO-V.STATUS = 'D' THEN WRITE 'BENEFICIARIO CAN` |
| RK-728f8d2bc779 | CADDEPEND:63 | FIELD_VALIDATION | FR-DEP-02 | `IF #NUM-DEP > 5 THEN WRITE 'LIMITE DE DEPENDENTES ATINGIDO' / ESCAPE BOTTOM` |
| RK-cf0d5200aad9 | CADDEPEND:79 | FIELD_VALIDATION | FR-DEP-03 | `IF #NOME-DEP = ' ' THEN WRITE 'NOME DO DEPENDENTE OBRIGATORIO' / MOVE TRUE TO #ERRO` |
| RK-bba959226637 | CADDEPEND:84 | FIELD_VALIDATION | FR-DEP-03 | `IF #PARENTESCO NE 'FI' AND #PARENTESCO NE 'CO' THEN AND #PARENTESCO NE 'IR' AND #PARENTESC` |
| RK-4dfeeb238cf7 | CADDEPEND:90 | FIELD_VALIDATION | FR-DEP-03 | `IF #ERRO THEN ESCAPE TOP` |
| RK-d08414712f34 | CADDEPEND:97 | FIELD_VALIDATION | FR-DEP-04 | `IF BENEFICIARIO-V.CPF-DEP(#IDX) = #CPF-DEP AND #CPF-DEP NE 0 THEN WRITE 'DEPENDENTE JA CAD` |
| RK-f8707d9be137 | CADDEPEND:105 | FIELD_VALIDATION | FR-DEP-03 | `IF #ERRO THEN ESCAPE TOP` |
| RK-db6fc93c9e4c | CADDEPEND:126 | FIELD_VALIDATION | FR-DEP-05 | `IF #CONT NE 'S' THEN ESCAPE BOTTOM` |
| RK-d20a15a018e6 | CADPROG:51 | FIELD_VALIDATION | FR-PRG-01 | `IF #OPER NE 'I' AND #OPER NE 'C' THEN WRITE 'OPERACAO INVALIDA' / ESCAPE ROUTINE` |
| RK-a1d8765eea49 | CADPROG:56 | FIELD_VALIDATION | FR-PRG-01 | `IF #OPER = 'C' THEN PERFORM CONSULTA-PROG / ESCAPE ROUTINE` |
| RK-1559882bffe4 | CADPROG:81 | FIELD_VALIDATION | FR-PRG-02 | `IF #FOUND THEN WRITE 'PROGRAMA JA CADASTRADO' / ESCAPE ROUTINE` |
| RK-275e4a632e83 | CADPROG:87 | COMPUTATION | FR-PRG-03 | `COMPUTE #FATOR-K = 1.00 + (#FATOR-REAJ * 0.347215)` |
| RK-bd6a7e52a48b | CADPROG:88 | COMPUTATION | FR-PRG-03 | `COMPUTE #VLR-CALC = #VLR-BASE * #FATOR-K` |
| RK-7ca3bec5e5f6 | CADPROG:117 | FIELD_VALIDATION | FR-PRG-01 | `IF *NUMBER(PROGRAMA-V) = 0 THEN WRITE 'PROGRAMA NAO ENCONTRADO'` |
| RK-7116b6a5174c | CALCBENF:138 | COMPUTATION | FR-CAL-01 | `COMPUTE #ANO = #COMPETENCIA / 100` |
| RK-140d297f9d0c | CALCBENF:139 | COMPUTATION | FR-CAL-01 | `COMPUTE #MES = #COMPETENCIA - (#ANO * 100)` |
| RK-886f1116333c | CALCBENF:141 | FIELD_VALIDATION | FR-CAL-01 | `IF #MES < 1 OR #MES > 12 THEN WRITE 'COMPETENCIA INVALIDA' / ESCAPE ROUTINE` |
| RK-a88a2f157187 | CALCBENF:155 | FIELD_VALIDATION | FR-CAL-02 | `IF NOT #FOUND-B THEN WRITE 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-a116de8e94cf | CALCBENF:160 | FIELD_VALIDATION | FR-CAL-02 | `IF BENEFICIARIO-V.STATUS NE 'A' THEN WRITE 'BENEFICIARIO NAO ATIVO - STATUS:' BENEFICIARIO` |
| RK-b030809a3f7c | CALCBENF:174 | FIELD_VALIDATION | FR-CAL-02 | `IF NOT #FOUND-P THEN WRITE 'PROGRAMA NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-f8d9475ad104 | CALCBENF:180 | FIELD_VALIDATION | FR-CAL-03 | `IF #COD-REG >= 1 AND #COD-REG <= 25 THEN MOVE #TAB-REG(#COD-REG) TO #FATOR-REG` |
| RK-2cced191e62e | CALCBENF:187 | FIELD_VALIDATION | FR-CAL-04 | `IF #NUM-DEP = 0 THEN MOVE 1.0000 TO #FATOR-FAM` |
| RK-c0d4163cc4d1 | CALCBENF:190 | FIELD_VALIDATION | FR-CAL-04 | `IF #NUM-DEP <= 2 THEN COMPUTE #FATOR-FAM = 1.0000 + (#NUM-DEP * 0.0500)` |
| RK-3461de4d19c8 | CALCBENF:191 | COMPUTATION | FR-CAL-04 | `COMPUTE #FATOR-FAM = 1.0000 + (#NUM-DEP * 0.0500)` |
| RK-b13aff8bf789 | CALCBENF:193 | FIELD_VALIDATION | FR-CAL-04 | `IF #NUM-DEP <= 4 THEN COMPUTE #FATOR-FAM = 1.1000 + ((#NUM-DEP - 2) * 0.0300)` |
| RK-5aae34cd08cf | CALCBENF:194 | COMPUTATION | FR-CAL-04 | `COMPUTE #FATOR-FAM = 1.1000 + ((#NUM-DEP - 2) * 0.0300)` |
| RK-7e690c7a89ec | CALCBENF:196 | COMPUTATION | FR-CAL-04 | `COMPUTE #FATOR-FAM = 1.1600 + ((#NUM-DEP - 4) * 0.0200)` |
| RK-999fc6833a38 | CALCBENF:205 | COMPUTATION | FR-CAL-06 | `COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000` |
| RK-7b2181c12f19 | CALCBENF:206 | COMPUTATION | FR-CAL-06 | `COMPUTE #IDADE = #ANO - #ANO-NASC` |
| RK-2f190186d76b | CALCBENF:207 | FIELD_VALIDATION | FR-CAL-06 | `IF #IDADE >= 65 THEN MOVE 1.1500 TO #FATOR-IDADE` |
| RK-511b65011b73 | CALCBENF:210 | FIELD_VALIDATION | FR-CAL-06 | `IF #IDADE >= 60 THEN MOVE 1.1000 TO #FATOR-IDADE` |
| RK-f036e04b0398 | CALCBENF:213 | FIELD_VALIDATION | FR-CAL-06 | `IF #IDADE < 18 THEN MOVE 1.0500 TO #FATOR-IDADE` |
| RK-92d4dfd5101f | CALCBENF:225 | COMPUTATION | FR-CAL-07 | `COMPUTE #VLR-BENF = #VLR-BASE * #FATOR-REG * #FATOR-FAM` |
| RK-4bef7758397d | CALCBENF:229 | COMPUTATION | FR-CAL-07 | `COMPUTE #VLR-BENF = #VLR-BENF * (1 + #FATOR-REAJ)` |
| RK-bb591a41dbf3 | CALCBENF:232 | COMPUTATION | FR-CAL-07 | `COMPUTE #VLR-TEMP = #VLR-BENF * 100` |
| RK-9ca5d0466ba9 | CALCBENF:233 | COMPUTATION | FR-CAL-07 | `COMPUTE #VLR-BENF = #VLR-TEMP / 100` |
| RK-be875b52514d | CALCBENF:242 | FIELD_VALIDATION | FR-CAL-08 | `IF #MES = 12 THEN MOVE 'D' TO #TIPO-PGTO / COMPUTE #VLR-13 = #VLR-BASE * #FATOR-REG * #FAT` |
| RK-3ac3d33b1b42 | CALCBENF:244 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-13 = #VLR-BASE * #FATOR-REG * #FATOR-IDADE` |
| RK-0f5eb2af85a0 | CALCBENF:246 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-TEMP = #VLR-13 * 100` |
| RK-f53c75ffb923 | CALCBENF:247 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-13 = #VLR-TEMP / 100` |
| RK-5add7ccbf625 | CALCBENF:248 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-BRUTO = #VLR-BENF + #VLR-13` |
| RK-f81e5c8b9a62 | CALCBENF:251 | FIELD_VALIDATION | FR-CAL-08 | `IF #TIPO-PROG = 'A' THEN COMPUTE #VLR-ABONO = #VLR-BENF * 0.15 / COMPUTE #VLR-TEMP = #VLR-` |
| RK-602168305a78 | CALCBENF:252 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-ABONO = #VLR-BENF * 0.15` |
| RK-2aeddfcfa687 | CALCBENF:254 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-TEMP = #VLR-ABONO * 100` |
| RK-66a219e18a6a | CALCBENF:255 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-ABONO = #VLR-TEMP / 100` |
| RK-e8d3c677f5bc | CALCBENF:256 | COMPUTATION | FR-CAL-08 | `COMPUTE #VLR-BRUTO = #VLR-BRUTO + #VLR-ABONO` |
| RK-8d025b23228f | CALCBENF:266 | COMPUTATION | FR-CAL-10 | `COMPUTE #VLR-LIQ = #VLR-BRUTO - #VLR-DESC` |
| RK-45fca1f354da | CALCBENF:267 | FIELD_VALIDATION | FR-CAL-10 | `IF #VLR-LIQ < 0 THEN MOVE 0 TO #VLR-LIQ` |
| RK-d8033ba178e5 | CALCBENF:272 | COMPUTATION | FR-CAL-10 | `COMPUTE #VLR-TEMP = #VLR-LIQ * 100` |
| RK-c28ec6795433 | CALCBENF:273 | COMPUTATION | FR-CAL-10 | `COMPUTE #VLR-LIQ = #VLR-TEMP / 100` |
| RK-46191b29bce5 | CALCBENF:297 | FIELD_VALIDATION | FR-CAL-08 | `IF #MES = 12 THEN WRITE 'VLR 13O SALARIO:' #VLR-13 / / 'VLR ABONO......:' #VLR-ABONO` |
| RK-f69f8dc0b6c9 | CALCBENF:306 | FIELD_VALIDATION | FR-CAL-05 | `IF #RENDA <= #FAIXA-RENDA(#J) THEN MOVE #FATOR-FAIXA(#J) TO #FATOR-RND / ESCAPE BOTTOM` |
| RK-4bee01aa2d9d | CALCBENF:318 | FIELD_VALIDATION | FR-CAL-09 | `IF #VLR-BRUTO > 500.00 THEN COMPUTE #VLR-DESC = #VLR-BRUTO * 0.03 / COMPUTE #VLR-TEMP = #V` |
| RK-d190c0ee61bb | CALCBENF:319 | COMPUTATION | FR-CAL-09 | `COMPUTE #VLR-DESC = #VLR-BRUTO * 0.03` |
| RK-f673b82833b9 | CALCBENF:320 | COMPUTATION | FR-CAL-09 | `COMPUTE #VLR-TEMP = #VLR-DESC * 100` |
| RK-65e0ed4d5b18 | CALCBENF:321 | COMPUTATION | FR-CAL-09 | `COMPUTE #VLR-DESC = #VLR-TEMP / 100` |
| RK-5416be5ab4a9 | CALCCORR:119 | FIELD_VALIDATION | FR-COR-01 | `IF #COMP-INI > #COMP-FIM THEN WRITE 'PERIODO INVALIDO - COMP INICIAL > FINAL' / ESCAPE ROU` |
| RK-fadeb6de594c | CALCCORR:129 | FIELD_VALIDATION | FR-COR-01 | `IF PAGAMENTO-V.CPF-BENEF NE #CPF THEN ESCAPE BOTTOM` |
| RK-21f4cc982e48 | CALCCORR:133 | FIELD_VALIDATION | FR-COR-01 | `IF PAGAMENTO-V.COMPETENCIA < #COMP-INI THEN ESCAPE TOP` |
| RK-fa50ce8fa3e7 | CALCCORR:136 | FIELD_VALIDATION | FR-COR-01 | `IF PAGAMENTO-V.COMPETENCIA > #COMP-FIM THEN ESCAPE BOTTOM` |
| RK-d24d71f27db8 | CALCCORR:140 | FIELD_VALIDATION | FR-COR-02 | `IF PAGAMENTO-V.IND-CORRIGIDO = 'S' THEN ESCAPE TOP` |
| RK-7ac41f6abbe2 | CALCCORR:152 | COMPUTATION | FR-COR-04 | `COMPUTE #VLR-CORR = #VLR-ORIG * #IND-ACUM` |
| RK-26314a2e669a | CALCCORR:154 | COMPUTATION | FR-COR-04 | `COMPUTE #VLR-TEMP = #VLR-CORR * 100` |
| RK-ef8db09fc095 | CALCCORR:155 | COMPUTATION | FR-COR-04 | `COMPUTE #VLR-CORR = #VLR-TEMP / 100` |
| RK-146fee57d2a4 | CALCCORR:156 | COMPUTATION | FR-COR-04 | `COMPUTE #VLR-DIFF = #VLR-CORR - #VLR-ORIG` |
| RK-b5eb9d994cd9 | CALCCORR:158 | FIELD_VALIDATION | FR-COR-04 | `IF #VLR-DIFF > 0 THEN MOVE #VLR-CORR   TO PAGAMENTO-V.VLR-CORRECAO / MOVE #DT-HOJE     TO ` |
| RK-d87bc4bc2bc4 | CALCCORR:180 | COMPUTATION | FR-COR-03 | `COMPUTE #ANO-C = #COMP-ATUAL / 100` |
| RK-d7af59c5343d | CALCCORR:181 | COMPUTATION | FR-COR-03 | `COMPUTE #MES-C = #COMP-ATUAL - (#ANO-C * 100)` |
| RK-012f5e03ef37 | CALCCORR:184 | FIELD_VALIDATION | FR-COR-03 | `IF #ANO-TAB(#K) = #ANO-C THEN COMPUTE #IND-ACUM = #IND-ACUM * (1 + #IPCA-ANO(#K,#MES-C)) /` |
| RK-2a52231a524c | CALCCORR:185 | COMPUTATION | FR-COR-03 | `COMPUTE #IND-ACUM = #IND-ACUM * (1 + #IPCA-ANO(#K,#MES-C))` |
| RK-314dbfb4a26e | CALCDSCT:75 | FIELD_VALIDATION | FR-DSC-01 | `IF PAGAMENTO-V.CPF-BENEF = #CPF THEN MOVE TRUE TO #FOUND / MOVE PAGAMENTO-V.VLR-BRUTO TO #` |
| RK-8b1376b9c23d | CALCDSCT:82 | FIELD_VALIDATION | FR-DSC-01 | `IF NOT #FOUND THEN WRITE 'PAGAMENTO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-0a477ffc9ddc | CALCDSCT:91 | FIELD_VALIDATION | FR-DSC-01 | `IF *NUMBER(BENEFICIARIO-V) = 0 THEN WRITE 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-746a7b5738cf | CALCDSCT:102 | COMPUTATION | FR-DSC-03 | `COMPUTE #VLR-MAX-DSCT = #VLR-BRUTO * 0.30` |
| RK-3cde6c2d52e2 | CALCDSCT:104 | COMPUTATION | FR-DSC-03 | `COMPUTE #VLR-TEMP = #VLR-MAX-DSCT * 100` |
| RK-636a3924f593 | CALCDSCT:105 | COMPUTATION | FR-DSC-03 | `COMPUTE #VLR-MAX-DSCT = #VLR-TEMP / 100` |
| RK-e3256815c49a | CALCDSCT:112 | FIELD_VALIDATION | FR-DSC-04 | `IF BENEFICIARIO-V.DT-FIM-DSCT(#IDX) NE 0 THEN AND BENEFICIARIO-V.DT-FIM-DSCT(#IDX) < #DT-H` |
| RK-873a78f8fdfb | CALCDSCT:116 | FIELD_VALIDATION | FR-DSC-04 | `IF BENEFICIARIO-V.DT-INICIO-DSCT(#IDX) > #DT-HOJE THEN ESCAPE TOP` |
| RK-5d6c495417bb | CALCDSCT:122 | — | FR-DSC-05 | `DECIDE ON FIRST VALUE OF #TIPO-DSCT` |
| RK-5ebca43330fa | CALCDSCT:125 | FIELD_VALIDATION | FR-DSC-05 | `IF BENEFICIARIO-V.VLR-DSCT(#IDX) > 0 THEN MOVE BENEFICIARIO-V.VLR-DSCT(#IDX) TO #VLR-DSCT-` |
| RK-7ae0930278f4 | CALCDSCT:128 | COMPUTATION | FR-DSC-05 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * (BENEFICIARIO-V.PCT-DSCT(#IDX) / 100)` |
| RK-813b10f0a6b2 | CALCDSCT:135 | FIELD_VALIDATION | FR-DSC-05 | `IF BENEFICIARIO-V.VLR-DSCT(#IDX) > 0 THEN MOVE BENEFICIARIO-V.VLR-DSCT(#IDX) TO #VLR-DSCT-` |
| RK-eb8f0ba106d7 | CALCDSCT:138 | COMPUTATION | FR-DSC-05 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * (BENEFICIARIO-V.PCT-DSCT(#IDX) / 100)` |
| RK-88bafd73a684 | CALCDSCT:144 | COMPUTATION | FR-DSC-05 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * (BENEFICIARIO-V.PCT-DSCT(#IDX) / 100)` |
| RK-a6687439e293 | CALCDSCT:149 | COMPUTATION | FR-DSC-05 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * 0.01` |
| RK-43bd100339a0 | CALCDSCT:153 | FIELD_VALIDATION | FR-DSC-05 | `IF BENEFICIARIO-V.VLR-DSCT(#IDX) > 0 THEN MOVE BENEFICIARIO-V.VLR-DSCT(#IDX) TO #VLR-DSCT-` |
| RK-62ff9a96f5f9 | CALCDSCT:156 | COMPUTATION | FR-DSC-05 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * (BENEFICIARIO-V.PCT-DSCT(#IDX) / 100)` |
| RK-07b224be3337 | CALCDSCT:165 | FIELD_VALIDATION | FR-DSC-03 | `IF #TIPO-DSCT NE 'J'` |
| RK-f27df0e84c50 | CALCDSCT:166 | FIELD_VALIDATION | FR-DSC-03 | `IF #VLR-TOTAL-DSCT > #VLR-MAX-DSCT THEN MOVE #VLR-MAX-DSCT TO #VLR-TOTAL-DSCT` |
| RK-ed72fdc907a3 | CALCDSCT:175 | COMPUTATION | FR-DSC-06 | `COMPUTE #VLR-TEMP = #VLR-TOTAL-DSCT * 100` |
| RK-462a16645319 | CALCDSCT:176 | COMPUTATION | FR-DSC-06 | `COMPUTE #VLR-TOTAL-DSCT = #VLR-TEMP / 100` |
| RK-83b28551c287 | CALCDSCT:195 | FIELD_VALIDATION | FR-DSC-02 | `IF #VLR-BRUTO <= #FAIXA-CONTRIB(#K) THEN COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * #ALIQ-CONTR` |
| RK-70cdacb35c1a | CALCDSCT:196 | COMPUTATION | FR-DSC-02 | `COMPUTE #VLR-DSCT-ITEM = #VLR-BRUTO * #ALIQ-CONTRIB(#K)` |
| RK-9d9bab8eef93 | CONSBENF:72 | FIELD_VALIDATION | FR-CON-01 | `IF *ERROR-NR NE 0 THEN INPUT 'SIFAP - CONSULTA BENEFICIARIO' / / '========================` |
| RK-98c65e845b23 | CONSBENF:80 | FIELD_VALIDATION | FR-CON-01 | `IF #TIPO-BUSCA = ' ' THEN MOVE 'C' TO #TIPO-BUSCA` |
| RK-7ede98209218 | CONSBENF:86 | — | FR-CON-01 | `DECIDE ON FIRST VALUE OF #TIPO-BUSCA` |
| RK-7b5ef292a4dd | CONSBENF:100 | FIELD_VALIDATION | FR-CON-01 | `IF NOT #FOUND THEN WRITE 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-bbda5babb7d9 | CONSBENF:110 | — | FR-CON-02 | `DECIDE ON FIRST VALUE OF BENEFICIARIO-V.STATUS` |
| RK-e17f09d66201 | CONSBENF:152 | FIELD_VALIDATION | FR-CON-03 | `IF PAGAMENTO-V.CPF-BENEF NE BENEFICIARIO-V.CPF THEN ESCAPE BOTTOM` |
| RK-0550647253b2 | CONSBENF:156 | FIELD_VALIDATION | FR-CON-03 | `IF #QTD-HIST > 12 THEN ESCAPE BOTTOM` |
| RK-95a55083feb2 | CONSBENF:166 | FIELD_VALIDATION | FR-CON-03 | `IF #QTD-HIST = 0 THEN WRITE 'NENHUM PAGAMENTO ENCONTRADO'` |
| RK-cfd080c8d910 | CONSBENF:177 | FIELD_VALIDATION | FR-CON-04 | `IF BENEFICIARIO-V.CPF < 10000000000 THEN MOVE SUBSTR(#CPF-STR,1,3) TO #CPF-P1 / COMPRESS #` |
| RK-b4fe11eb2c22 | RELAUDIT:80 | FIELD_VALIDATION | FR-AUD-01 | `IF #TIPO-SAIDA = ' ' THEN MOVE 'T' TO #TIPO-SAIDA` |
| RK-d99bee200be3 | RELAUDIT:84 | FIELD_VALIDATION | FR-AUD-01 | `IF #DT-INI = 0 THEN MOVE 19970101 TO #DT-INI` |
| RK-819d962f567a | RELAUDIT:87 | FIELD_VALIDATION | FR-AUD-01 | `IF #DT-FIM = 0 THEN MOVE #DT-HOJE TO #DT-FIM` |
| RK-713713b19064 | RELAUDIT:93 | FIELD_VALIDATION | FR-AUD-02 | `IF AUDITORIA-V.DT-EVENTO < #DT-INI THEN ESCAPE TOP` |
| RK-aae01121639f | RELAUDIT:96 | FIELD_VALIDATION | FR-AUD-02 | `IF AUDITORIA-V.DT-EVENTO > #DT-FIM THEN ESCAPE BOTTOM` |
| RK-2e5c9f06f325 | RELAUDIT:105 | FIELD_VALIDATION | FR-AUD-03 | `IF AUDITORIA-V.ACAO = 'EX' THEN ADD 1 TO #QTD-FILTRADOS / ESCAPE TOP` |
| RK-b3ac1f6f4ede | RELAUDIT:111 | FIELD_VALIDATION | FR-AUD-04 | `IF #ACAO-FILTRO NE ' '` |
| RK-be935d51d847 | RELAUDIT:112 | FIELD_VALIDATION | FR-AUD-04 | `IF AUDITORIA-V.ACAO NE #ACAO-FILTRO THEN ADD 1 TO #QTD-FILTRADOS / ESCAPE TOP` |
| RK-78771795cd8b | RELAUDIT:119 | FIELD_VALIDATION | FR-AUD-04 | `IF #USUARIO-FILTRO NE ' '` |
| RK-bea2ff075a6c | RELAUDIT:120 | FIELD_VALIDATION | FR-AUD-04 | `IF AUDITORIA-V.USUARIO NE #USUARIO-FILTRO THEN ADD 1 TO #QTD-FILTRADOS / ESCAPE TOP` |
| RK-60326023cab9 | RELAUDIT:127 | FIELD_VALIDATION | FR-AUD-04 | `IF #TABELA-FILTRO NE ' '` |
| RK-7f232f1dd913 | RELAUDIT:128 | FIELD_VALIDATION | FR-AUD-04 | `IF AUDITORIA-V.TABELA-REF NE #TABELA-FILTRO THEN ADD 1 TO #QTD-FILTRADOS / ESCAPE TOP` |
| RK-6a74a1f56dab | RELAUDIT:137 | — | FR-AUD-05 | `DECIDE ON FIRST VALUE OF AUDITORIA-V.ACAO` |
| RK-9ec291e3f4e5 | RELAUDIT:164 | FIELD_VALIDATION | FR-AUD-06 | `IF #LINHA >= (#MAX-LINHAS - 5) THEN PERFORM IMPRIME-CAB-AUDIT` |
| RK-4e229cab081e | RELAUDIT:169 | FIELD_VALIDATION | FR-AUD-06 | `IF #TIPO-SAIDA = 'T' THEN WRITE AUDITORIA-V.DT-EVENTO ' ' / #HR-FORMAT ' ' / AUDITORIA-V.U` |
| RK-7083ebf609a1 | RELAUDIT:210 | FIELD_VALIDATION | FR-AUD-06 | `IF #TIPO-SAIDA = 'T' THEN WRITE '/' / WRITE 'SIFAP - TRILHA DE AUDITORIA' / 40X 'PAG:' #PA` |
| RK-c1a8ff5dbe7b | RELPGT:83 | FIELD_VALIDATION | FR-REL-01 | `IF PAGAMENTO-V.COMPETENCIA > #COMP-FIM THEN ESCAPE BOTTOM` |
| RK-5a5f1426d63d | RELPGT:87 | FIELD_VALIDATION | FR-REL-01 | `IF #COD-PROG-FILTRO NE 0 THEN AND PAGAMENTO-V.COD-PROGRAMA NE #COD-PROG-FILTRO / ESCAPE TO` |
| RK-7c5773e59cfe | RELPGT:93 | FIELD_VALIDATION | FR-REL-02 | `IF PAGAMENTO-V.COD-PROGRAMA NE #PROG-ANT AND #PROG-ANT NE 0 THEN PERFORM IMPRIME-SUBTOTAL ` |
| RK-b0f53e1b01b3 | RELPGT:116 | — | FR-REL-03 | `DECIDE ON FIRST VALUE OF PAGAMENTO-V.TIPO-PGTO` |
| RK-4fcb39638b68 | RELPGT:128 | — | FR-REL-03 | `DECIDE ON FIRST VALUE OF PAGAMENTO-V.STATUS-PGTO` |
| RK-e6e70b3b6737 | RELPGT:144 | FIELD_VALIDATION | FR-REL-04 | `IF #LINHA >= (#MAX-LINHAS - 5) THEN PERFORM IMPRIME-CABECALHO` |
| RK-65a445d0bcfe | RELPGT:173 | FIELD_VALIDATION | FR-REL-02 | `IF #PROG-ANT NE 0 THEN PERFORM IMPRIME-SUBTOTAL` |
| RK-4e7cf0ea0beb | VALBENEF:110 | COMPUTATION | FR-VAL-01 | `COMPUTE #ANO-ATUAL = *DATN / 10000` |
| RK-d92621a0cc50 | VALBENEF:116 | FIELD_VALIDATION | FR-VAL-01 | `IF NOT #CPF-VALIDO THEN ADD 1 TO #QTD-ERROS / MOVE 'CPF INVALIDO - DIGITO VERIFICADOR' TO ` |
| RK-b776e6f05132 | VALBENEF:126 | FIELD_VALIDATION | FR-VAL-01 | `IF NOT #DT-VALIDA THEN ADD 1 TO #QTD-ERROS / MOVE 'DATA NASCIMENTO INVALIDA' TO #MSG-ERRO(` |
| RK-39e9b653aa4d | VALBENEF:136 | FIELD_VALIDATION | FR-VAL-01 | `IF NOT #NOME-VALIDO THEN ADD 1 TO #QTD-ERROS / MOVE 'NOME INVALIDO - DEVE TER NOME E SOBRE` |
| RK-ac7976dff12d | VALBENEF:145 | FIELD_VALIDATION | FR-VAL-05 | `IF #UF NE ' ' THEN 1 #UF-OK (L) / MOVE FALSE TO #UF-OK / FOR #I = 1 TO 27 / END-FOR` |
| RK-20056adb605d | VALBENEF:149 | FIELD_VALIDATION | FR-VAL-05 | `IF #UF = #UF-TAB(#I) THEN MOVE TRUE TO #UF-OK / ESCAPE BOTTOM` |
| RK-bb74de6a3c53 | VALBENEF:154 | FIELD_VALIDATION | FR-VAL-05 | `IF NOT #UF-OK THEN ADD 1 TO #QTD-ERROS / MOVE 'UF INVALIDA' TO #MSG-ERRO(#QTD-ERROS) / MOV` |
| RK-3414a3783a2e | VALBENEF:164 | FIELD_VALIDATION | FR-VAL-01 | `IF #STATUS NE 'A' AND #STATUS NE 'S' AND #STATUS NE 'C' THEN AND #STATUS NE 'I' AND #STATU` |
| RK-b48d9743345d | VALBENEF:190 | FIELD_VALIDATION | FR-VAL-02 | `IF #DIG(#I) NE #DIG(1) THEN MOVE FALSE TO #TODOS-IGUAIS / ESCAPE BOTTOM` |
| RK-605e59b1fe7d | VALBENEF:195 | FIELD_VALIDATION | FR-VAL-02 | `IF #TODOS-IGUAIS THEN MOVE FALSE TO #CPF-VALIDO / ESCAPE ROUTINE` |
| RK-e67e790f872a | VALBENEF:197 | FIELD_VALIDATION | FR-VAL-02 | `IF #DIG(1) = 0 AND #DIG(2) = 0 AND #DIG(3) = 0 THEN MOVE TRUE TO #CPF-VALIDO / ESCAPE ROUT` |
| RK-2dd4cb3c18cd | VALBENEF:209 | COMPUTATION | FR-VAL-02 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-9f7df44b6ca1 | VALBENEF:212 | COMPUTATION | FR-VAL-02 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-ccc5388150f7 | VALBENEF:213 | FIELD_VALIDATION | FR-VAL-02 | `IF #RESTO < 2 THEN MOVE 0 TO #DV1` |
| RK-9985fab5aca5 | VALBENEF:216 | COMPUTATION | FR-VAL-02 | `COMPUTE #DV1 = 11 - #RESTO` |
| RK-f19b73dfd406 | VALBENEF:218 | FIELD_VALIDATION | FR-VAL-02 | `IF #DV1 NE #DIG(10) THEN MOVE FALSE TO #CPF-VALIDO / ESCAPE ROUTINE` |
| RK-cb78ba074b4e | VALBENEF:227 | COMPUTATION | FR-VAL-02 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-23cb286f5641 | VALBENEF:230 | COMPUTATION | FR-VAL-02 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-6381e8b050e1 | VALBENEF:231 | FIELD_VALIDATION | FR-VAL-02 | `IF #RESTO < 2 THEN MOVE 0 TO #DV2` |
| RK-03e29441143e | VALBENEF:234 | COMPUTATION | FR-VAL-02 | `COMPUTE #DV2 = 11 - #RESTO` |
| RK-07ded10a38a1 | VALBENEF:236 | FIELD_VALIDATION | FR-VAL-02 | `IF #DV2 NE #DIG(11) THEN MOVE FALSE TO #CPF-VALIDO` |
| RK-dec345b9d4e4 | VALBENEF:244 | COMPUTATION | FR-VAL-03 | `COMPUTE #ANO = #DT-NASC / 10000` |
| RK-1f589b644cd7 | VALBENEF:245 | COMPUTATION | FR-VAL-03 | `COMPUTE #MES = (#DT-NASC - (#ANO * 10000)) / 100` |
| RK-a34852e9ec02 | VALBENEF:246 | COMPUTATION | FR-VAL-03 | `COMPUTE #DIA = #DT-NASC - (#ANO * 10000) - (#MES * 100)` |
| RK-39c31733e515 | VALBENEF:248 | FIELD_VALIDATION | FR-VAL-03 | `IF #ANO < 1900 OR #ANO > #ANO-ATUAL THEN MOVE FALSE TO #DT-VALIDA / ESCAPE ROUTINE` |
| RK-f60066fede08 | VALBENEF:252 | FIELD_VALIDATION | FR-VAL-03 | `IF #MES < 1 OR #MES > 12 THEN MOVE FALSE TO #DT-VALIDA / ESCAPE ROUTINE` |
| RK-db3b53eeb364 | VALBENEF:256 | FIELD_VALIDATION | FR-VAL-03 | `IF #DIA < 1 OR #DIA > #DIAS-MES(#MES) THEN MOVE FALSE TO #DT-VALIDA` |
| RK-9c6ba0322e06 | VALBENEF:264 | FIELD_VALIDATION | FR-VAL-04 | `IF #NOME = ' ' THEN MOVE FALSE TO #NOME-VALIDO / ESCAPE ROUTINE` |
| RK-9eb88e2bb408 | VALBENEF:271 | FIELD_VALIDATION | FR-VAL-04 | `IF #POS > 1 THEN MOVE TRUE TO #TEM-ESPACO` |
| RK-6e161797bb9a | VALBENEF:274 | FIELD_VALIDATION | FR-VAL-04 | `IF NOT #TEM-ESPACO THEN MOVE FALSE TO #NOME-VALIDO` |
| RK-82c01a2ea13d | VALDOCS:69 | FIELD_VALIDATION | FR-DOC-01 | `IF NOT #CPF-OK THEN ADD 1 TO #QTD-ERROS / MOVE 'CPF INVALIDO' TO #MSG(#QTD-ERROS) / MOVE '` |
| RK-b0821b60ecb6 | VALDOCS:79 | FIELD_VALIDATION | FR-DOC-02 | `IF NOT #RG-OK THEN ADD 1 TO #QTD-ERROS / MOVE 'RG INVALIDO OU FORMATO INCORRETO' TO #MSG(#` |
| RK-5549fc642f21 | VALDOCS:95 | FIELD_VALIDATION | FR-DOC-03 | `IF #DOC-ESP-OK THEN WRITE '** DOCUMENTO ESPECIAL VALIDADO **'` |
| RK-55a63d755481 | VALDOCS:102 | FIELD_VALIDATION | FR-DOC-01 | `IF #CPF = 0 THEN MOVE FALSE TO #CPF-OK / ESCAPE ROUTINE` |
| RK-4187fc1c9b8e | VALDOCS:114 | COMPUTATION | FR-DOC-01 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-9d67b2c9881b | VALDOCS:117 | COMPUTATION | FR-DOC-01 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-1a2b8aca3fed | VALDOCS:118 | FIELD_VALIDATION | FR-DOC-01 | `IF #RESTO < 2 THEN MOVE 0 TO #DV1` |
| RK-533f71e705bc | VALDOCS:121 | COMPUTATION | FR-DOC-01 | `COMPUTE #DV1 = 11 - #RESTO` |
| RK-ca3109301dbc | VALDOCS:123 | FIELD_VALIDATION | FR-DOC-01 | `IF #DV1 NE #DIG(10) THEN MOVE FALSE TO #CPF-OK / ESCAPE ROUTINE` |
| RK-4cd00622ae5a | VALDOCS:131 | COMPUTATION | FR-DOC-01 | `COMPUTE #SOMA = #SOMA + (#DIG(#I) * #PESO)` |
| RK-bb14087b5111 | VALDOCS:134 | COMPUTATION | FR-DOC-01 | `COMPUTE #RESTO = #SOMA - ((#SOMA / 11) * 11)` |
| RK-e3ad9c603136 | VALDOCS:135 | FIELD_VALIDATION | FR-DOC-01 | `IF #RESTO < 2 THEN MOVE 0 TO #DV2` |
| RK-06b627574a45 | VALDOCS:138 | COMPUTATION | FR-DOC-01 | `COMPUTE #DV2 = 11 - #RESTO` |
| RK-08b9ede5ec74 | VALDOCS:140 | FIELD_VALIDATION | FR-DOC-01 | `IF #DV2 NE #DIG(11) THEN MOVE FALSE TO #CPF-OK` |
| RK-2b0e2875eb48 | VALDOCS:148 | FIELD_VALIDATION | FR-DOC-02 | `IF #RG = ' ' THEN MOVE FALSE TO #RG-OK / ESCAPE ROUTINE` |
| RK-f018750c00d0 | VALDOCS:155 | FIELD_VALIDATION | FR-DOC-02 | `IF #RG-LEN > 0 THEN SUBTRACT 1 FROM #RG-LEN` |
| RK-cf4926ddfa8b | VALDOCS:160 | FIELD_VALIDATION | FR-DOC-02 | `IF #RG-LEN < 5 THEN MOVE FALSE TO #RG-OK` |
| RK-4aa29d42f19a | VALDOCS:174 | FIELD_VALIDATION | FR-DOC-03 | `IF #PREF-CPF = #PREF-ESP(#I) THEN MOVE TRUE TO #DOC-ESP-OK / MOVE TRUE TO #CPF-OK / MOVE '` |
| RK-ba073668b27b | VALELEG:59 | COMPUTATION | FR-ELG-01 | `COMPUTE #ANO-ATUAL = *DATN / 10000` |
| RK-80016581d919 | VALELEG:72 | COMPUTATION | FR-ELG-01 | `COMPUTE #ANO-NASC = BENEFICIARIO-V.DT-NASCIMENTO / 10000` |
| RK-8c8b79c28087 | VALELEG:73 | COMPUTATION | FR-ELG-01 | `COMPUTE #IDADE = #ANO-ATUAL - #ANO-NASC` |
| RK-d1fd785bcf1c | VALELEG:81 | FIELD_VALIDATION | FR-ELG-01 | `IF NOT #FOUND-B THEN WRITE 'BENEFICIARIO NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-994493fceb7b | VALELEG:94 | FIELD_VALIDATION | FR-ELG-01 | `IF NOT #FOUND-P THEN WRITE 'PROGRAMA NAO ENCONTRADO' / ESCAPE ROUTINE` |
| RK-74d42c778166 | VALELEG:99 | FIELD_VALIDATION | FR-ELG-01 | `IF PROGRAMA-V.STATUS-PROG NE 'A' THEN WRITE 'PROGRAMA INATIVO' / ESCAPE ROUTINE` |
| RK-86ee7c50f9f4 | VALELEG:107 | FIELD_VALIDATION | FR-ELG-02 | `IF #COD-REG = 99 THEN MOVE TRUE TO #ELEGIVEL / WRITE 'BENEFICIARIO ELEGIVEL - REGIAO ESPEC` |
| RK-9a4651f7dd24 | VALELEG:116 | FIELD_VALIDATION | FR-ELG-03 | `IF #STATUS-BENEF NE 'A'` |
| RK-7c608b834e79 | VALELEG:117 | FIELD_VALIDATION | FR-ELG-03 | `IF #STATUS-BENEF = 'S' THEN ADD 1 TO #QTD-MOT / MOVE 'BENEFICIARIO SUSPENSO' TO #MOTIVO(#Q` |
| RK-fc541e8adcfc | VALELEG:122 | FIELD_VALIDATION | FR-ELG-03 | `IF #STATUS-BENEF = 'C' OR #STATUS-BENEF = 'D' THEN ADD 1 TO #QTD-MOT / MOVE 'BENEFICIARIO ` |
| RK-4ff3d6cc6794 | VALELEG:127 | FIELD_VALIDATION | FR-ELG-03 | `IF #STATUS-BENEF = 'I' THEN ADD 1 TO #QTD-MOT / MOVE 'BENEFICIARIO INATIVO' TO #MOTIVO(#QT` |
| RK-06883f7fa2f7 | VALELEG:139 | FIELD_VALIDATION | FR-ELG-04 | `IF PROGRAMA-V.IDADE-MIN > 0` |
| RK-2cb07a956769 | VALELEG:140 | FIELD_VALIDATION | FR-ELG-04 | `IF #IDADE < PROGRAMA-V.IDADE-MIN THEN ADD 1 TO #QTD-MOT / MOVE 'IDADE INFERIOR AO MINIMO D` |
| RK-dd82bfe9d500 | VALELEG:146 | FIELD_VALIDATION | FR-ELG-04 | `IF PROGRAMA-V.IDADE-MAX > 0` |
| RK-50e8ebafa202 | VALELEG:147 | FIELD_VALIDATION | FR-ELG-04 | `IF #IDADE > PROGRAMA-V.IDADE-MAX THEN ADD 1 TO #QTD-MOT / MOVE 'IDADE SUPERIOR AO MAXIMO D` |
| RK-5f1dcae4ccb7 | VALELEG:157 | FIELD_VALIDATION | FR-ELG-04 | `IF PROGRAMA-V.RENDA-MAX > 0` |
| RK-4c6d057f4ecb | VALELEG:158 | FIELD_VALIDATION | FR-ELG-04 | `IF #RENDA > PROGRAMA-V.RENDA-MAX THEN ADD 1 TO #QTD-MOT / MOVE 'RENDA FAMILIAR ACIMA DO TE` |
| RK-d9a36a3c8a42 | VALELEG:168 | — | FR-ELG-05 | `DECIDE ON FIRST VALUE OF #TIPO-PROG` |
| RK-e5d581584c6d | VALELEG:171 | FIELD_VALIDATION | FR-ELG-05 | `IF #RENDA > 600.00` |
| RK-b63f2863cdab | VALELEG:172 | FIELD_VALIDATION | FR-ELG-05 | `IF #NUM-DEP < 1 THEN ADD 1 TO #QTD-MOT / MOVE 'PROG ASSISTENCIAL: RENDA > 600 SEM DEPENDEN` |
| RK-aa4425811246 | VALELEG:178 | FIELD_VALIDATION | FR-ELG-05 | `IF #DOCS-OK NE 'S' THEN ADD 1 TO #QTD-MOT / MOVE 'DOCUMENTACAO INCOMPLETA' TO #MOTIVO(#QTD` |
| RK-093a02fbe84e | VALELEG:185 | FIELD_VALIDATION | FR-ELG-05 | `IF #IDADE < 60 THEN ADD 1 TO #QTD-MOT / MOVE 'PROG PREVIDENCIARIO: IDADE < 60' TO #MOTIVO(` |
| RK-7aeaee84c79d | VALELEG:192 | FIELD_VALIDATION | FR-ELG-05 | `IF #IDADE < 16 OR #IDADE > 65 THEN ADD 1 TO #QTD-MOT / MOVE 'PROG TRABALHO: IDADE FORA DA ` |
| RK-0cfdfa24b877 | VALELEG:206 | FIELD_VALIDATION | FR-ELG-06 | `IF #COD-ELEG NE ' ' THEN PERFORM VERIF-ELEG-ESPECIFICA` |
| RK-bd27c2ba8977 | VALELEG:213 | FIELD_VALIDATION | FR-ELG-07 | `IF #ELEGIVEL THEN WRITE 'BENEFICIARIO ELEGIVEL PARA O PROGRAMA'` |
| RK-3e570ba9c17c | VALELEG:226 | FIELD_VALIDATION | FR-ELG-06 | `IF SUBSTR(#COD-ELEG,1,1) = 'R'` |
| RK-d7bb85d92636 | VALELEG:228 | FIELD_VALIDATION | FR-ELG-06 | `IF BENEFICIARIO-V.NIS = 0 THEN ADD 1 TO #QTD-MOT / MOVE 'NIS NAO CADASTRADO' TO #MOTIVO(#Q` |
| RK-af932d091e75 | VALELEG:234 | FIELD_VALIDATION | FR-ELG-06 | `IF SUBSTR(#COD-ELEG,2,1) = 'D'` |
| RK-5f5731566730 | VALELEG:236 | FIELD_VALIDATION | FR-ELG-06 | `IF #NUM-DEP = 0 THEN ADD 1 TO #QTD-MOT / MOVE 'PROGRAMA REQUER DEPENDENTES' TO #MOTIVO(#QT` |
