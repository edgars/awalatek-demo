---
title: 'Endurecimiento — concurrencia, LGPD en URLs, volumen y limpieza'
type: 'chore'
created: '2026-09-25'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/docs/architecture.md'
  - '{project-root}/bmad-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Los specs de las 20 historias dejaron diferidos técnicos (frontmatter `deferred` y `deferred-work.md`) que no requieren decisión de negocio: candados solo en memoria, posibles pagos duplicados entre procesos, CPF completo en URLs, informes que cargan todo en memoria y código duplicado.

**Approach:** Tres frentes paralelos (worktrees), sin cambiar reglas de negocio ni el comportamiento por defecto de los LEGACY-QUIRK.

## Boundaries & Constraints

**Always (todos):** reglas legadas, mensajes literales y RK intactos; tests existentes verdes (solo se ajustan tests que dependen de la superficie que el frente cambia explícitamente, p. ej. URLs en H2); `npm run lint && npm test && npm run build && E2E_PORT=<puerto> npx playwright test` en verde; migraciones Prisma nuevas con `prisma migrate dev --name <nombre>` (nunca editar migraciones existentes); sin PII en logs.

**Never:** tocar `sprint-status.yaml`; cambiar defaults de quirks; auth/login (fuera de alcance).

### H1 — Concurrencia e integridad (E2E_PORT=3244)
- Candado entre procesos en la base: tabla nueva (p. ej. `ProcessoLock { nome @id, dono, adquiridoEm }`) con adquisición atómica (insert; P2002 = ocupado) y expiración configurable (p. ej. 2 h, para candados huérfanos tras un crash). Usarlo en el lote (web + CLI) y en la conciliación, manteniendo los mensajes actuales ("Lote já em execução." / "Conciliação já em execução."). Liberar en `finally`.
- Pagos duplicados: verificar si CALCBENF (cálculo individual, `src/server/calculo.ts`) permite dos pagos del mismo CPF en la misma competencia. Si el legado lo impide o ninguna regla lo permite → índice único `(numCpf, anoMesRef)` + tratar P2002 como "ya generado" en el lote. Si el legado lo permite en el individual → **no** agregar el índice; documentarlo y cubrir el lote solo con el candado. Decisión y evidencia en el commit y en un comentario.
- `numAuditoria` máx.+1: reintento ante P2002 (y SQLITE_BUSY ya cubierto por `db.ts`) con test de colisión.
- Tests pendientes: P2002 de `incluirPrograma` e `incluirBeneficiario` (inclusión concurrente del mismo código/CPF → mensaje legado de duplicado); constraints (unique de `nis`, `numPagamento`, `numAuditoria`, `(beneficiarioId, cpfDependente)`; cascadas Programa→faixas/params y Pagamento→descontos; RESTRICT Pagamento→Beneficiario).
- `nis` y `cpfDependente` vacíos → `NULL` antes de grabar (si aún no se hace) con test.
- Script `npm run db:check` que ejecute `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` (y test/CI note en README).

### H2 — LGPD: CPF fuera de las URLs (E2E_PORT=3245)
- Ninguna URL de la app lleva el CPF completo (ni en path ni en query). Rutas afectadas al menos: `/beneficiarios/[cpf]/editar`, `/beneficiarios/[cpf]/dependentes`, `/beneficiarios/[cpf]/descontos`, `/consulta?cpf=`, `/elegibilidade?cpf=&programa=`, `/validacao/documentos` y `/validacao/cadastro` si reciben CPF por URL, `/pagamentos` si filtra por CPF en query. Buscar todas (`grep -rn "cpf" src/app` para `href`, `searchParams`, `redirect`, `router.push`).
- Sustituir por un identificador opaco: el `id` interno de `Beneficiario` (no secuencial expuesto si es autoincremental → usar un token opaco estable, p. ej. columna nueva `chavePublica` (cuid/uuid) con migración y backfill para filas existentes, `@unique`). Los formularios de búsqueda por CPF envían por POST (Server Action) o por el cuerpo, nunca en la URL; los atajos entre pantallas usan la clave opaca.
- El CPF sigue enmascarado en HTML donde ya lo está; donde se muestra completo para edición (campo inmutable), mantenerlo solo dentro del formulario, no en atributos de enlaces.
- Actualizar e2e y tests afectados (cambio explícito de superficie). Agregar un test que recorra `src/app` y falle si aparece un patrón de CPF en `href`/rutas dinámicas `[cpf]`.

### H3 — Volumen y limpieza (E2E_PORT=3246)
- Consolidado (7.2): agregación en SQL (`groupBy`/`aggregate` o SQL crudo parametrizado) por status y por región, conservando D10/D11 y el modo corregido; mismo resultado que hoy (test de equivalencia sobre datos aleatorios con el cálculo actual en memoria).
- Informes analítico (7.1) y auditoría (7.3): tope de filas (constante `LIMITE_LINHAS_RELATORIO = 20000`); si se supera, no se carga el detalle y se muestra "Período com mais de 20.000 registros. Refine o filtro." (los totales pueden seguir por agregación). Filtros de auditoría (acción, usuario, tabla, EX) empujados al `where` preservando la semántica y los contadores (total/filtrados se obtienen por `count`).
- Lote (4.2): lectura de beneficiarios por cursor (lotes de 500, orden `numCpf`), conservando orden, D17 y resultados.
- Limpieza: un único módulo para `ERRO_INESPERADO`, `falhaInesperada` (log solo name/code) y `usuarioOperativo` (hoy duplicados en varios módulos; `src/server/quirksConfig.ts` ya exporta `ERRO_INESPERADO`) con tests del no-log de PII; reemplazar las copias.
- E2E: aislar el spec de dependientes (usa su propio beneficiario en vez de MARIA) para que no altere el factor familiar que otros specs asumen.

</intent-contract>

## Verification

- Por frente: `npm run lint && npm test && npm run build && E2E_PORT=<puerto> npx playwright test` (dos corridas) en verde; H1 además `npm run db:check`.
