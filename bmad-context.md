# Contexto del Proyecto (para agentes BMAD)

Este repositorio fue producido por **RNC** (Reengineering New Code) a partir de
un sistema legado. Contiene documentos de planificación del método BMAD, no
código de aplicación.

## Procedencia

- Legado: **SIFAP** — Natural/Adabas (mainframe), 15 programas + 4 DDMs.
- Workspace RNC: `603f473c-d0aa-4d1a-bdb1-6e365371c787`
  (módulo UIR `4cf7ed9e-0cf6-4b28-a604-a4264592a561`, 289 reglas, fuente retenido).
- Flujo: código legado → UIR → documentos BMAD → corrección de rumbo
  (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-24.md`).

### Programas legados → épicas

| Programa | Función | Épica |
|---|---|---|
| CADPROG | Alta/consulta de programa social | E1 |
| CADBENEF, VALBENEF, VALDOCS, CADDEPEND, CONSBENF | Beneficiario, validaciones, dependientes, consulta | E2 |
| VALELEG | Elegibilidad beneficiario × programa | E3 |
| CALCBENF, CALCDSCT, BATCHPGT | Cálculo de beneficio, descuentos, lote mensual | E4 |
| CALCCORR | Corrección retroactiva (IPCA) | E5 |
| BATCHCON | Conciliación bancaria CNAB 240 | E6 |
| RELPGT, BATCHREL, RELAUDIT | Informes de pagos, consolidado y auditoría | E7 |

## Instrucciones para el agente Dev

- `docs/prd.md` es la fuente de verdad de comportamiento; `docs/architecture.md`
  de estructura. No inventes otro stack.
- Implementa las historias de `docs/stories/` **una a la vez, en el orden de
  `_bmad-output/implementation-artifacts/sprint-status.yaml`** (E0 primero,
  E8 último).
- **`Pagamento` y `Auditoria` no tienen CRUD libre.** Los pagos los genera el
  motor de cálculo (E4) y solo cambian por procesos (descuentos, corrección,
  conciliación). La auditoría la escribe el sistema y solo se consulta.
- **Grupos periódicos Adabas (PE)** — dependientes (máx. 10), descuentos (máx. 8),
  tramos de cálculo (máx. 5), parámetros regionales (máx. 6) — son tablas
  hijas con FK al padre + `occurrence`; se editan dentro de la pantalla del padre.
- **Dinero:** `Decimal`, nunca `float`. Todo resultado intermedio se **trunca** a
  2 decimales (padrón mainframe) salvo donde la regla diga otra cosa.
- **Fechas legadas** AAAAMMDD / competencia AAAAMM: sigue la decisión registrada
  en `docs/architecture.md`.
- **`LEGACY-QUIRK`:** comportamientos raros del legado marcados así en el PRD se
  **replican tal cual** con un comentario `// LEGACY-QUIRK(D<n>): …`. No los
  "corrijas": son decisiones registradas.
- **`NEEDS REVIEW`:** implementa la versión más probable y deja
  `// TODO(review): …` indicando qué debe confirmar un humano.
- **Precedencia:** directivas del autor > configuración explícita > decisiones
  derivadas > defaults.

## Stack objetivo

- Frontend + backend: Next.js (App Router) · TypeScript
- ORM: Prisma · Migraciones: prisma-migrate · Validación: zod
- Base de datos: SQLite
- Deployment: docker-compose · SSO: off
- Entorno: `.env` + `.env.example` commiteado documentando cada variable

## Guardarraíl RNC MCP

Cada regla se cita como `RK-<12 hex>` + ubicación `PROGRAMA:línea`. Con el
servidor MCP de RNC conectado:

- Antes de cerrar una historia: `getRule(workspaceId, "RK-…")` por cada regla
  citada y compara con la condición y el `sourceExcerpt`.
- Si hay duda, lee el fuente original: `getSourceFile(workspaceId, "app/<PROG>.NSN")`.
- Antes de inventar comportamiento: `searchKnowledge` / `findRules`.

Sin MCP los documentos son autosuficientes.
