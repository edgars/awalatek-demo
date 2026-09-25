---
title: 'Correcciones configurables de LEGACY-QUIRK D4b–D23'
type: 'feature'
created: '2026-09-25'
status: 'ready-for-dev'
baseline_revision: '270fc8b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/prd.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Los quirks del legado se replicaron y marcaron (`// LEGACY-QUIRK(Dn)`), pero negocio necesita poder activar el comportamiento corregido de cada uno sin perder la paridad con el mainframe.

**Approach:** Cada quirk corregible tiene su comportamiento corregido implementado junto al legado. La elección se hace por configuración ya existente en `src/domain/quirks.ts` (commit 270fc8b): `SIFAP_QUIRKS_CORRIGIDOS` (lista o `ALL`; vacía = legado) y `LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED` (D18). Default = comportamiento actual (paridad). Decisión del usuario 2026-09-25: "Corrección con flag".

## Boundaries & Constraints

**Always:**
- El dominio sigue puro: las funciones reciben la configuración como parámetro (`quirks: Pick<Quirks, "corrigidos">` o un booleano derivado con `corrige(q, "Dn")`), con **default = legado** para no romper llamadas existentes. `lerQuirks()` se llama solo en la capa de servidor/acción (o CLI del lote), una vez por solicitud/corrida; configuración inválida → error de configuración registrado sin PII y mensaje genérico (patrón de `src/app/validacao/documentos/actions.ts`).
- En el código, cada rama queda marcada: `// LEGACY-QUIRK(Dn)` en la rama legado y `// CORRECAO(Dn)` en la corregida, con una línea que diga qué corrige.
- Tests: por quirk, dominio en **ambos modos** (legado y corregido) con casos límite; al menos un test de servidor por quirk con `vi.stubEnv("SIFAP_QUIRKS_CORRIGIDOS", "Dn")` que pruebe que la configuración llega al dominio. Todos los tests existentes (legado) deben seguir verdes **sin cambios de expectativas**. El e2e corre en modo legado (playwright.config.ts fija la lista vacía) y no se modifica salvo necesidad.
- Mensajes nuevos en pt-BR, mayúsculas y sin tildes si imitan el estilo del legado.

**Correcciones (definición normativa):**

| ID | Legado (default) | Corregido (`Dn` en la lista) | Dónde |
|---|---|---|---|
| D4b | CPF con 11 dígitos iguales que empieza por 000 es válido | Todo CPF con 11 dígitos iguales es inválido | `src/domain/cpf.ts`, `beneficiario/validacao.ts` |
| D5 | Edad > 75 → status S también en la alteración | Solo en la inclusión; en la alteración se conserva el status elegido | `beneficiario/cadastro.ts` |
| D6 | Límite de dependientes corta en > 5 (permite 6) | Máximo 5 (el 6.º se rechaza con el mismo mensaje legado) | `beneficiario/dependentes.ts` |
| D7 | Máscara de consulta según cero a la izquierda | Siempre `***.***.XXX-XX` (dígitos 7–9 y 10–11 del CPF de 11 con ceros) | `cpf.ts` (`mascaraCpfConsulta`) — requiere aprobación de auditoría para activarlo |
| D8 | Base ya × FATOR-K y el motor vuelve a × (1 + FATOR-REAJ) | El motor no reaplica (1 + FATOR-REAJ) (el reajuste ya está en la base) | `calculo/motor.ts` |
| D9 | Año fuera de la tabla IPCA → índice 1, sin aviso | Pago de año sin IPCA no se procesa: aviso "SEM INDICE IPCA: COMP=AAAAMM PGTO=n" en el resultado, no se marca ni cuenta | `calculo/correcao.ts`, `server/correcao.ts`, pantalla |
| D10 | 1–5 N, 6–10 NE, 11–15 SE, 16–20 S, todo lo demás CENTRO-OESTE | 21–25 CENTRO-OESTE; 0, 99, > 25 y beneficiario inexistente → nueva fila "NAO CLASSIFICADA" (la tabla muestra 6 filas en modo corregido) | `relatorios/consolidado.ts` + pantalla |
| D11 | Bruto redondeado (+0,005) antes de sumar en región/general | Suma del bruto sin redondeo (igual al cálculo) | `relatorios/consolidado.ts` |
| D12 | Región 99 → elegible sin ninguna verificación | Región 99 pasa por todas las verificaciones normales | `elegibilidade.ts` |
| D13 | CALCDSCT no recalcula el líquido | CALCDSCT recalcula y graba `vlrLiquido` con la misma fórmula del motor (bruto + abono − descuento, verificar en `motor.ts`); la pantalla quita el aviso D13 y muestra el líquido nuevo. El 3 % plano del motor no cambia | `server/descontos.ts`, pantalla `/descontos` |
| D16 | Febrero siempre con 29 días | Año bisiesto real (gregoriano) | `beneficiario/validacao.ts` (y `legacyDate.ts` si aplica) |
| D17 | Renta > 9.999,99: individual factor 0; lote arrastra el factor anterior | El lote no arrastra: usa lo mismo que el individual | `server/lotePagamentos.ts` (+ CLI) |
| D18 | (flag `LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED=true`) la alteración graba status en blanco salvo edad > 75 → S; el select de status no se muestra | Default actual (PRD FR-BEN-01, status editable) | `beneficiario/cadastro.ts`, `server/beneficiarios.ts`, pantalla |
| D19 | Nombre de una sola palabra válido (relleno A60) | Nombre exige al menos dos palabras (un espacio entre caracteres no blancos tras `trim`) | `beneficiario/validacao.ts` |
| D20 | Largo del RG hasta el primer espacio | Largo = caracteres no blancos (se ignoran los espacios) | `beneficiario/documentos.ts` |
| D21 | Consulta muestra los primeros 12 pagos | Muestra los **últimos** 12 (mayor `numPagamento`), del más reciente al más antiguo | `beneficiario/consulta.ts`, `server/consulta.ts`, pantalla |
| D22 | Lectura por CPF en orden de inserción, corta en el primer pago > final | Lee los pagos del CPF en el período ordenados por competencia (y nº), sin parada temprana | `calculo/correcao.ts`, `server/correcao.ts` |
| D23 | `dtPagamento` grabada tal cual viene (DDMMAAAA) | Si es fecha DDMMAAAA válida → AAAAMMDD; si ya es AAAAMMDD válida → igual; si no → 0 + aviso "DATA PAGAMENTO INVALIDA: DOC=n" | `cnab240.ts`, `server/conciliacao.ts` |

D4 ya es configurable (`LEGACY_DOC_ESPECIAL_ENABLED`) y no se toca. D1–D3 quedan fuera de alcance. D14/D15 son decisiones de modelo, no comportamientos.

**Never:**
- Cambiar el comportamiento por defecto (lista vacía). Cambiar expectativas de tests existentes. Tocar `sprint-status.yaml`. Tocar quirks fuera de tu grupo.

## Grupos de trabajo (paralelo, worktrees)

- **A — Cadastro y validación:** D4b, D5, D6, D12, D16, D18, D19, D20.
- **B — Cálculo y pagos:** D8, D9, D13, D17, D22, D23.
- **C — Consulta e informes:** D7, D10, D11, D21.

## Verification

- `npm run lint && npm test && npm run build && E2E_PORT=<puerto> npx playwright test` en verde.
- Con `SIFAP_QUIRKS_CORRIGIDOS=ALL` los tests del grupo en modo corregido pasan.

</intent-contract>
