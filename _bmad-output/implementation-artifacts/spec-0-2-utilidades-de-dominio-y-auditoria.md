---
title: 'Story 0.2 — Utilidades de dominio y auditoría'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_revision: '65c27691a0247bf94778f4694e08d57b2eb934d8'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md'
  - '{project-root}/bmad-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      numAuditoria máx.+1 falla (SQLITE_BUSY/P2002) con escritores concurrentes en procesos/clientes distintos (app + lote).
    evidence: |-
      Probe del reviewer: 4 llamadas solapadas desde 2 PrismaClient sobre el mismo archivo fallaron (SocketTimeout, transacción anidada). En un solo cliente 10 concurrentes dan 1..10. Relevante cuando el lote (E4) y la conciliación (E6) corran como procesos separados.
    location: >-
      src/server/auditoria.ts
    severity: medium
  - summary: >-
      registrarEvento no acepta un momento (dt/hr) provisto por el llamador.
    evidence: |-
      BATCHCON toma *DATN/*TIMN una sola vez y graba todos los eventos CO/DV con esa hora; E6 necesita pasar el momento del proceso para equivalencia.
    location: >-
      src/server/auditoria.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Todas las épicas siguientes necesitan aritmética de dinero con truncado mainframe, fechas legadas enteras, validación de CPF módulo 11, flags LEGACY-QUIRK y un único escritor de auditoría; sin ellos cada historia reinventaría (y divergiría en) estas reglas.

**Approach:** Crear en `src/domain` los módulos puros `money`, `legacyDate`, `cpf` y `quirks`, y en `src/server` el escritor append-only `auditoria`, con tests unitarios; el seed pasa a usar la utilidad de CPF de dominio.

## Boundaries & Constraints

**Always:**
- `src/domain/*` sin imports de Prisma ni Next; `decimal.js` solo se importa dentro de `src/domain/money.ts` (los demás reciben/devuelven sus tipos).
- Truncado = hacia cero a 2 decimales (padrón `×100 → entero → /100` del legado). `redondear` = `+0,005` y truncar (D11), también para negativos, como el legado.
- Cada una de las 11 reglas de FR-BEN-03 con comentario `// RK-<clave> (CADBENEF:<línea>)` junto al código que la implementa.
- Mensaje literal de fallo: `CPF INVALIDO - DIGITO VERIFICADOR INCORRETO` exportado como constante.
- Auditoría: `numAuditoria` = máx.+1 calculado **dentro de la misma transacción** que el insert; acepta un cliente de transacción opcional para que los procesos (E6) graben el evento en su propia transacción.
- Textos de auditoría cortados a la longitud del DDM (como el `MOVE` de Natural): `usrEvento` 8, `tipoEntidade` 15, `idEntidade` 20, `desAcao` 80.

**Never:**
- Validación de dígitos repetidos (D4b), fecha válida/febrero 29 (D16) o máscaras de CPF (D7): son de E2.
- Funciones de update/delete de auditoría, pantallas o rutas API.
- `Number` flotante para dinero en ninguna función pública.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Truncar positivo | `truncar("12.3456")` | `12.34` | No error expected |
| Truncar negativo | `truncar("-12.3456")` | `-12.34` (hacia cero) | No error expected |
| Redondear | `redondear("12.345")` / `redondear("12.344")` | `12.35` / `12.34` | No error expected |
| Centavos | `aCentavos("1234.567")` / `deCentavos(123456)` | `123456` / `1234.56` | No error expected |
| CPF válido con cero | `validaModulo11("01234567890")` | `true` | No error expected |
| CPF DV incorrecto | `validaModulo11("01234567891")` | `false` | No error expected |
| CPF mal formado | `"123"`, `"abc45678901"`, `""` | `false` | No lanza |
| Edad por año | `idadePorAno(19850412, 2026)` | `41` | No error expected |
| Fecha legada | `dataParaInt("2026-09-24")` / `intParaData(0)` | `20260924` / `null` | Entrada inválida → error |
| Hoy | `hoje()` con `TZ=America/Sao_Paulo` a 02:30 UTC del 25/09 | `{ data: 20260924, hora: 233000 }` | No error expected |
| Flag por defecto | `LEGACY_DOC_ESPECIAL_ENABLED` ausente / `"true"` | `false` / `true` | Valor distinto de `true`/`false` → error de configuración |
| Auditoría secuencial | 2 llamadas a `registrarEvento` en base vacía | `numAuditoria` 1 y 2 | No error expected |

</intent-contract>

## Code Map

- `src/server/db.ts` -- exporta `prisma` (Proxy perezoso) y `createPrismaClient(url)`; reutilizar, no modificar.
- `prisma/schema.prisma` modelo `Auditoria` -- campos `numAuditoria` (@unique), `dtEvento`, `hrEvento`, `codAcao`, `tipoEntidade`, `idEntidade`, `usrEvento`, `desAcao`, `valorAnterior?`, `valorPosterior?`; no modificar el esquema.
- `prisma/seed.ts:13` `cpfComDv` -- helper local de 0.1; reemplazar su cuerpo por la utilidad de dominio (mantener el export para `tests/schema.test.ts:8,57,81`).
- `tests/schema.test.ts` -- patrón de base SQLite temporal (`mkdtempSync` + `prisma migrate deploy` + `createPrismaClient`) a reutilizar para el test de auditoría.
- `vitest.config.ts` -- ya incluye `src/**/*.test.ts` y `tests/**/*.test.ts`.
- Reglas: `docs/prd.md` FR-BEN-03 y Anexo A (claves RK de CADBENEF 113, 237, 240, 241, 244, 247, 256, 259, 260, 263, 266).

## Tasks & Acceptance

**Execution:**
- `src/domain/money.ts` -- `Dinheiro` (alias de Decimal), `dec(v)`, `truncar(v)`, `redondear(v)`, `aCentavos(v)`, `deCentavos(n)`, `fator(s)` (string N3.4/N3.2 → Decimal) -- base aritmética única.
- `src/domain/legacyDate.ts` -- `dataParaInt`/`intParaData` (ISO `AAAA-MM-DD` ↔ AAAAMMDD, 0 ↔ null), `competenciaParaInt`/`intParaCompetencia` (`AAAA-MM` ↔ AAAAMM), `anoDe(dt)`, `idadePorAno(dtNasc, anoRef)`, `hoje()` → `{ data, hora }` en la zona `TZ` (default `America/Sao_Paulo`) -- fechas legadas.
- `src/domain/cpf.ts` -- `MSG_CPF_INVALIDO`, `validaModulo11(cpf)`, `completaDv(base9)` con comentarios RK -- FR-BEN-03 una sola vez.
- `src/domain/quirks.ts` -- `lerQuirks(env = process.env)` validado con zod → `{ docEspecialHabilitado: boolean }` -- flags tipados (D4).
- `src/server/auditoria.ts` -- `registrarEvento(evento, cliente?)` con `acao` ∈ IN/AL/CO/CN/DV/EX; asigna `numAuditoria`, `dtEvento`, `hrEvento` vía `hoje()`; único escritor -- ADR-009.
- `prisma/seed.ts` -- `cpfComDv` delega en `completaDv` -- elimina la duplicación anunciada en 0.1.
- `src/domain/*.test.ts`, `tests/auditoria.test.ts` -- cubren cada fila de la matriz y cada regla RK (al menos un test por regla).

**Acceptance Criteria:**
- Given el repositorio, when se busca `decimal.js` fuera de `src/domain/money.ts`, then no hay imports.
- Given `src/server/auditoria.ts`, when se inspeccionan sus exports, then no existe ninguna función que actualice o borre auditoría.
- Given `npm run lint && npm test`, when se ejecutan, then terminan en verde con los tests nuevos incluidos.

## Spec Change Log

## Review Triage Log

### 2026-09-24 — Review pass
- verdicts: 38 findings — high 0, medium 3, low 21, false 14, maybe-false 0
- findings:
  - `[medium]` `[defer]` (edge) max+1 con procesos/transacciones concurrentes en distintos clientes → SQLITE_BUSY/P2002 — real con app + lote (`docker compose run`) como procesos separados; topología de E4/E6, diferido
  - `[low]` `[reject]` (edge) dos `registrarEvento` en paralelo sobre el mismo `tx` — uso indebido del llamador; corregir exigiría asignación por transacción
  - `[low]` `[patch]` (edge) `usuario: ""` no cae en `SIFAP_USER` — corregido con `?.trim() ||` + test
  - `[low]` `[reject]` (edge) `tabela`/`chave`/`descricao` vacíos — llamadores internos; agregar guards no se justifica
  - `[low]` `[reject]` (edge) corte parte pares sustitutos — textos del dominio son ASCII/latin
  - `[low]` `[reject]` (edge) `TZ` POSIX inválido → RangeError — `TZ` controlado por `.env`
  - `[false]` `[reject]` (edge) `idadePorAno(0, ano)` = ano — el legado calcula igual (`#ANO - #ANO-NASC`); nacimiento es obligatorio (FR-BEN-02)
  - `[false]` `[reject]` (edge) edad negativa — mismo comportamiento del legado (equivalencia)
  - `[low]` `[reject]` (edge) `anoDe` con AAAAMM — uso indebido; sin llamador
  - `[low]` `[patch]` (edge) `intParaData` acepta mes 13/día 99 — agregado rango 01–12/01–31 en ambos sentidos
  - `[low]` `[patch]` (edge) competencia mes 00/13 — mismo patch
  - `[low]` `[reject]` (edge) Decimal NaN/Infinity — `dec()` ya rechaza strings/números no finitos; Decimal externo no llega
  - `[low]` `[reject]` (edge) `aCentavos` devuelve -0 — sin efecto en SQLite/Prisma
  - `[low]` `[reject]` (edge) `fator` no valida ancho N3.4 — entradas validadas con zod en las historias de API
  - `[low]` `[reject]` (edge) `calculaDv1/2` sin validar entrada — helpers internos usados solo con dígitos ya validados
  - `[false]` `[reject]` (edge) CPF con dígitos repetidos aceptado — D4b es de VALBENEF (historia 2.2) por diseño; CADBENEF no lo valida
  - `[medium]` `[defer]` (blind) max+1 sin seguridad concurrente — agrupado con el primero (topología); en un proceso la concurrencia está cubierta por el test agregado
  - `[false]` `[reject]` (blind) `hoje()` depende de `TZ` del proceso — la historia pide "según TZ"; `.env.example` fija `America/Sao_Paulo`
  - `[false]` `[reject]` (blind) `anoDe(0)`/edad sin sentido — igual al legado (ver arriba)
  - `[low]` `[patch]` (blind) conversiones no hacen ida y vuelta con meses/días imposibles — mismo patch de rangos
  - `[low]` `[patch]` (blind) `rounding: ROUND_DOWN` global en el clon trunca `toFixed` de cualquier llamador — eliminado del clon; `truncar`/`aCentavos` pasan `ROUND_DOWN` explícito
  - `[low]` `[reject]` (blind) `fator` sin formato — ver arriba
  - `[low]` `[reject]` (blind) campos de texto sin validación/`valorAnterior` sin límite/UTF-16 — ver arriba; columnas TEXT sin límite en SQLite
  - `[medium]` `[defer]` (blind) sin timestamp provisto por el llamador — BATCHCON toma `*DATN/*TIMN` una vez para todos los eventos; se agrega parámetro opcional en E6
  - `[low]` `[reject]` (blind) `ACOES_AUDITORIA` mutable en runtime — improbable
  - `[false]` `[reject]` (blind) tests de CPF: `completaDv("000000000")` chocará con D4b — D4b vive en otra función (VALBENEF); `validaModulo11`/`completaDv` siguen siendo solo módulo 11. Duplicación de aserciones: cosmética
  - `[low]` `[reject]` (blind) `calculaDv1/2` exportados sin validar — ver arriba
  - `[low]` `[reject]` (blind) quirks validados solo al usarse — se leen al entrar a la validación de E2; sin impacto
  - `[low]` `[reject]` (blind) `cpfComDv` passthrough / estilo de import — mantiene el export usado por los tests
  - `[low]` `[patch]` (verif) sin test de concurrencia de `numAuditoria` — agregado `Promise.all` de 10 → 1..10 (pre-verificado)
  - `[medium]` `[defer]` (verif) dos `PrismaClient` sobre el mismo archivo fallan bajo contención — agrupado con el primero
  - `[false]` `[reject]` (intent) RK-bc7d67f3dad4 reducido a constante — la rama "si inválido → mensaje" pertenece al flujo de CADBENEF (historia 2.1)
  - `[low]` `[reject]` (intent) 8 de 11 reglas testeadas vía helpers y no vía `validaModulo11` — equivalente; los helpers son exactamente las reglas
  - `[low]` `[patch]` (intent) sin oráculo independiente de CPFs válidos — agregados literales conocidos `11144477735`, `52998224725` (válidos) y `11144477736` (inválido)
  - `[low]` `[reject]` (intent) money sin casos cero/overflow — cubiertos implícitamente; improbable
  - `[false]` `[reject]` (intent) lectura parse/format — ISO↔entero es la lectura de la arquitectura (la UI convierte desde selectores)
  - `[false]` `[reject]` (intent) quirks lanza con valores inválidos — decisión del spec (Design/matriz)
  - `[false]` `[reject]` (intent) sin evidencia de `getRule` — verificado por la API de RNC: las 11 `RK-` coinciden (condición y línea)

## Design Notes

- `truncar` usa `Decimal.ROUND_DOWN` (hacia cero) con `toDecimalPlaces(2)`; los intermedios del cálculo se truncan explícitamente donde la regla lo diga (E4), no automáticamente.
- `hoje()` usa `Intl.DateTimeFormat` con `timeZone`; recibe `agora: Date = new Date()` para tests deterministas.
- `validaModulo11` exige `^\d{11}$`; cualquier otra entrada es `false` sin lanzar (el legado recibe N11 ya numérico).

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errores
- `npm test` -- expected: todos los tests en verde (esquema + dominio + auditoría)
- `grep -rn "decimal.js" src prisma tests | grep -v "src/domain/money"` -- expected: sin resultados

## Auto Run Result

- **Resumen:** utilidades de dominio compartidas (`money`, `legacyDate`, `cpf`, `quirks`) y escritor append-only de auditoría; el seed usa `completaDv`.
- **Archivos:**
  - `src/domain/money.ts` — Decimal aislado, `truncar`/`redondear` (D11)/centavos/`fator`.
  - `src/domain/legacyDate.ts` — ISO↔AAAAMMDD/AAAAMM con rango mes/día, `idadePorAno`, `hoje()` por `TZ`.
  - `src/domain/cpf.ts` — FR-BEN-03 módulo 11 con las 11 `RK-`.
  - `src/domain/quirks.ts` — `LEGACY_DOC_ESPECIAL_ENABLED` validado con zod (default false).
  - `src/server/auditoria.ts` — `registrarEvento` (máx.+1 en la transacción, cliente de transacción opcional, cortes DDM).
  - `prisma/seed.ts` — delega en `completaDv`.
  - Tests: `src/domain/*.test.ts`, `tests/auditoria.test.ts`.
- **Review:** 38 hallazgos — 5 patches aplicados (todos `low`: fallback de usuario vacío, rangos mes/día, `rounding` global del clon, test de concurrencia, oráculos de CPF independientes); 2 diferidos (`medium`: concurrencia entre procesos, momento provisto por el llamador para E6); 31 rechazados con su razón en el triage log.
- **Follow-up review recomendado:** `false` — patches: high 0, medium 0, low 5.
- **Verificación:** `npm run lint` 0 errores; `npm test` 48/48; sin `decimal.js` fuera de `money.ts`; las 11 `RK-` verificadas contra RNC vía API (`getRule`: condición y línea coinciden).
- **Riesgos residuales:** año 0000–0999 en `dataParaInt` produce enteros que `intParaData` rechaza (inalcanzable desde selectores de fecha); escritura concurrente entre procesos (diferido).
