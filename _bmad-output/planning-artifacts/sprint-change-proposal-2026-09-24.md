# Sprint Change Proposal — SIFAP

- **Fecha:** 2026-09-24
- **Autor:** Edgar (con agente Dev, flujo `bmad-correct-course`, modo incremental)
- **Alcance:** **Mayor** — replan de PRD, arquitectura, UX, épicas e historias (sin código implementado todavía)
- **Estado:** ✅ aprobado por Edgar el 2026-09-24 y aplicado (docs/, README, bmad-context.md, sprint-status.yaml)

---

## 1. Resumen del problema

El pack BMAD generado por RNC modelaba SIFAP como **8 CRUDs genéricos** (una
épica por tabla, "todos los campos como `input`"). El Readiness Gate de sprint
planning dio **FAIL**:

- Las reglas de negocio no se podían implementar: ~90 criterios del tipo
  "Enforce: Conditional" sin condición ni efecto; 109 FR "Conditional/WARN" sin acción.
- Lógica de cálculo, lote, conciliación CNAB y corrección IPCA incrustada en
  historias CRUD sin flujo que la dispare.
- Conflicto PRD ("out of scope — do NOT implement") vs historia de pagamentos (obligatorias).
- Sin claves `RK-` en PRD ni historias, a pesar de que README y `bmad-context.md` las prometían.
- Tablas `*_grp_*` (grupos periódicos Adabas) tratadas como entidades sueltas sin vínculo al padre.
- Deployment contradictorio (servicios `api` + `db` para SQLite).

**Cómo se descubrió:** Readiness Gate (`bmad-sprint-planning`) + auditoría vía
MCP/API de RNC. Primero pareció que el workspace `603f473c` no existía: era el
token de otro tenant. Con el token correcto, `603f473c` (1 módulo, 289 reglas)
resultó idéntico al módulo `4517bf7d` de `d115510f` (mismo fuente por hash,
mismas 289 `RK-`). Las "890 reglas" de `d115510f` son la duplicación de una
ingestión anterior.

**Evidencia:** 15 programas Natural + 4 DDMs recuperados con `getSourceFile`
(retención activa); 289 reglas con `ruleKey`, `sourceSpan` y `sourceExcerpt`.

## 2. Análisis de impacto

### Épicas
Las 8 épicas CRUD no se pueden completar como estaban escritas → **reemplazadas** por 9 épicas por dominio,
alineadas a los programas legados:

| Épica | Programas legados | Historias | Reglas |
|---|---|---|---|
| 0 Fundación | — (transversal) | 2 | 11 |
| 1 Programas sociales | CADPROG | 1 | 6 |
| 2 Beneficiarios | CADBENEF, VALBENEF, VALDOCS, CADDEPEND, CONSBENF | 6 | 78 |
| 3 Elegibilidad | VALELEG | 1 | 29 |
| 4 Cálculo y pagos | CALCBENF, CALCDSCT, BATCHPGT | 4 | 110 |
| 5 Corrección retroactiva | CALCCORR | 1 | 14 |
| 6 Conciliación bancaria | BATCHCON | 1 | 9 |
| 7 Informes y auditoría | RELPGT, BATCHREL, RELAUDIT | 3 | 32 |
| 8 Deployment | — | 1 | — |
| **Total** | 15 programas | **20** | **289/289** |

### Historias
Las 9 historias actuales se eliminan; 20 historias nuevas con criterios de aceptación
concretos (rutas, mensajes literales, efectos), tabla `FR → RK → PROG:línea`,
test por regla y verificación `getRule`.

### Artefactos
| Artefacto | Impacto |
|---|---|
| `bmad-context.md` | Reescrito (español): procedencia real, programas→épicas, reglas para el agente (sin CRUD en Pagamento/Auditoria, PE→hijos, Decimal/truncado, LEGACY-QUIRK), guardrail MCP por `RK-`+`PROG:línea` |
| `docs/prd.md` | Reescrito: 74 FR de negocio, 289/289 reglas trazadas, §5 decisiones D1–D17, NFR de dinero/regresión/LGPD/auditoría, Anexo A de trazabilidad |
| `docs/architecture.md` | Reescrito: dominio puro + motor único, fechas `Int` legadas, dinero en centavos, modelo conciliado DDM×código (campos ➕), relaciones confirmadas, 1 contenedor, ADR-001..010 |
| `docs/ux/DESIGN.md` | Reescrito: 20 pantallas mapeadas a 3270, UI pt-BR, componentes de conversión |
| `docs/ux/EXPERIENCE.md` | Reescrito: navegación, patrones, 7 flujos, estados vacíos, accesibilidad |
| `docs/epics/*`, `docs/stories/*` | Reemplazados (9 épicas / 20 historias) |
| `docs/product-brief.md` | Ajuste menor: de "8 entidades CRUD" a "15 procesos / 7 dominios"; 289 reglas |
| `README.md` | Ajuste: dominio, orden de historias (sprint-status), protocolo (LEGACY-QUIRK, sin CRUD en pagos/auditoría), sección "Decisiones pendientes" (D4, D17) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Nuevo (generado por `sprint_plan.py`) |

### Técnico
Sin código existente: no hay rollback. Impacto en infraestructura: deployment
simplificado a 1 servicio.

## 3. Enfoque recomendado

**Híbrido: replan del MVP con equivalencia funcional.**

- Opción 1 (ajuste directo de las 8 historias): **no viable**: la estructura CRUD no aloja procesos.
- Opción 2 (rollback): **N/A**, no hay código.
- Opción 3 (revisión del MVP/replan): **viable**. Elegida, con este criterio:
  equivalencia funcional con el legado y rarezas documentadas.

**Criterio LEGACY-QUIRK (aprobado):** replicar el comportamiento legado y marcarlo
`// LEGACY-QUIRK(Dn)`. D4 (bypass de documentos por prefijo de CPF) queda detrás
del flag `LEGACY_DOC_ESPECIAL_ENABLED`, desactivado por defecto.

| Esfuerzo de planificación | Riesgo | Impacto en calendario |
|---|---|---|
| Medio (ya ejecutado en esta sesión) | Bajo: docs regenerados desde UIR + fuente, cobertura verificada por script | Ninguno, no se había iniciado la implementación |

## 4. Propuestas de cambio aprobadas (modo incremental)

| # | Artefacto | Decisión | Borrador |
|---|---|---|---|
| 1 | `bmad-context.md` | ✅ Aprobada | texto en la conversación |
| 2 | `docs/prd.md` | ✅ Aprobada (D4 = flag desactivado) | `scratchpad/prd.new.md` |
| 3 | `docs/architecture.md` | ✅ Aprobada | `scratchpad/architecture.new.md` |
| 4 | Épicas + historias | ✅ Aprobada | `scratchpad/out/` |
| 5 | `docs/ux/DESIGN.md` + `EXPERIENCE.md` | ✅ Aprobada | `scratchpad/DESIGN.new.md`, `EXPERIENCE.new.md` |
| — | `product-brief.md`, `README.md` | Ajustes derivados (consistencia) | se aplican con la aprobación final |

### Decisiones LEGACY-QUIRK registradas (PRD §5)
D1 tablas fijas de región/tramos · D2 tope 30 % en el loop · D3 13.º sin meses
activos · D4 prefijos especiales (flag off) · D4b CPF 000… repetido válido · D5
suspensión > 75 · D6 límite de dependientes > 5 · D7 máscara CPF · D8 doble
ajuste FATOR-K/REAJ · D9 IPCA 2010–2012 · D10 regiones del informe · D11
redondeo vs truncado · D12 región 99 · D13 dos algoritmos de descuento / líquido
no recalculado · D14 descuentos registrados vs aplicados · D15 dominios del
código · D16 febrero con 29 días · D17 renta > 9.999,99 (lote arrastra factor; `TODO(review)`).

## 5. Handoff de implementación

**Clasificación:** Mayor (replan). PM/arquitecto = esta sesión; queda un handoff al Dev.

| Rol | Responsabilidad |
|---|---|
| Agente Dev (`bmad-build`) | Implementar historias en el orden de `sprint-status.yaml`, empezando por 0.1 |
| Negocio / seguridad | Decidir D4 (activar o no el flag) y D17 (confirmar si el arrastre en el lote es bug) |
| Auditoría | Aprobación necesaria antes de cambiar D7 |
| Test architect (opcional, `bmad-testarch-test-design`) | Plan de regresión de cálculo (NFR-03) antes de la épica 4 |

**Criterios de éxito**
- `docs/` sin rastros del modelo "8 CRUDs"; 289/289 `RK-` citadas en PRD e historias.
- Readiness Gate de `bmad-sprint-planning` = PASS o CONCERNS (solo D4/D17).
- `sprint-status.yaml` con 9 épicas / 20 historias `ready-for-dev`.
- Suite de regresión de cálculo al centavo en verde al cerrar la épica 4.
