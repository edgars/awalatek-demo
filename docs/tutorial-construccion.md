# Tutorial — Cómo construimos SIFAP con RNC + BMAD + Claude Code

Este documento reconstruye, paso a paso y en orden, **todos los comandos y acciones**
que llevaron desde el sistema legado Natural/Adabas (SIFAP, mainframe) hasta la
aplicación web actual (Next.js 16 + Prisma 7 + SQLite), tal como quedó registrado en
el historial de git y en los artefactos de BMAD.

> Convenciones: los comandos de terminal van en bloques `bash`; lo que se escribe en
> Claude Code (comandos `/…` o pedidos en lenguaje natural) va en bloques `text`.
> Nunca pegues tokens reales en documentos: donde aparece `<TOKEN>` usa el tuyo.

---

## 0. Resultado final (para orientarse)

| Métrica | Valor |
|---|---|
| Programas legados cubiertos | CADPROG, CADBENEF, CADDEPEND, VALBENEF, VALDOCS, VALELEG, CONSBENF, CALCBENF, BATCHPGT, CALCDSCT, CALCCORR, BATCHCON, RELPGT, BATCHREL, RELAUDIT |
| Reglas legadas (RK) trazadas | 289/289, cada una con `// RK-<clave> (PROGRAMA:línea)` y test |
| Épicas / historias | 9 épicas (0–8), 20 historias + 1.2 (extensión) |
| Tests | ~1100 unitarios/integración (Vitest) + 86 e2e (Playwright) |
| Despliegue | docker-compose (1 servicio `app`, SQLite en volumen) |

---

## 1. Prerrequisitos

```bash
node --version        # Node 24 LTS
git --version
docker --version      # Docker + Docker Compose (historia 8.1)
uv --version          # lo usan los scripts de BMAD (render de skills)
```

- **Claude Code** instalado y abierto en la raíz del repositorio.
- **BMAD Method** instalado en el repo (carpetas `_bmad/` y `.claude/skills/bmad-*`):

```bash
npx bmad-method install      # interactivo: módulo BMM + herramienta Claude Code
```

- Acceso al **RNC** (plataforma que analizó el código legado y expone reglas, fuentes y
  modelo de datos vía MCP).

---

## 2. Fase 1 — Paquete generado por RNC

El punto de partida fue el paquete que **RNC generó desde su UIR** (commits
`b4d10ef`/`c953dba`, *"generate application from RNC UIR"*): PRD, arquitectura, UX,
épicas e historias, `bmad-context.md` y los fuentes legados analizados.

### 2.1 Conectar el MCP de RNC a Claude Code

```bash
claude mcp add rnc --transport sse https://api.rnc.skalena.co/sse \
  --header "Authorization: Bearer <TOKEN>"
```

- Queda con alcance **local** (solo este proyecto). Si el token se expone en un chat o
  documento, **rotarlo**.
- Uso: `listWorkspaces`, `getRule`, `getSourceFile`, `getModuleRules`, etc.
- Si el MCP se cuelga dentro de la sesión, se puede consultar la misma API por HTTP/SSE
  con un script propio (así se verificaron las 289 reglas: ver
  `_bmad-output/implementation-artifacts/rk-verification.md`).

---

## 3. Fase 2 — Orientación con BMAD

```text
/bmad-help
```

Muestra en qué fase está el proyecto y el siguiente paso recomendado. Luego:

```text
sí, arranca sprint planning
```

(`/bmad-sprint-planning`). El **Readiness Gate falló**: el paquete original modelaba
el sistema como 8 CRUD genéricos y las reglas legadas no se podían implementar así.

---

## 4. Fase 3 — Corrección de rumbo (`/bmad-correct-course`)

```text
/bmad-correct-course
```

Pedido: *"actualizar los contextos BMAD con base en las reglas del workspace RNC"*.
Elecciones durante el workflow: **modo Incremental**, documentos en **español**,
y cada propuesta aprobada una a una (*"apruebo"*).

Resultado (commit `4d19f38`, *"replan SIFAP BMAD pack by domain"*):

- De 8 CRUD → **9 épicas por dominio / 20 historias** (`docs/epics/`, `docs/stories/`).
- PRD, arquitectura y UX reescritos (`docs/prd.md`, `docs/architecture.md`, `docs/ux/`).
- **289/289 reglas** mapeadas a requisitos (FR-…) y verificadas contra RNC.
- Decisiones **LEGACY-QUIRK D1–D17** (PRD §5). Criterio aprobado:
  **"replicar y marcar"** (`// LEGACY-QUIRK(Dn)`); D4 detrás de un flag apagado.
- Propuesta: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-24.md`.
- `sprint-status.yaml` regenerado en `_bmad-output/implementation-artifacts/`.

Ajuste técnico necesario: el render de skills fallaba por una clave de configuración
duplicada (`implementation_artifacts` ambigua). Se quitaron las claves `gds` duplicadas
de `_bmad/config.toml` (opción 2 del diagnóstico).

---

## 5. Fase 4 — Construcción: el ciclo por historia

### 5.1 Primera historia, en modo guiado

```text
/bmad-build
```

Historia **0.1** (scaffold + esquema completo de datos). Luego se pasó al modo
autónomo:

```text
usando bmad comece a implementar as story e o projeto como o todo
```

Elecciones: **Autónomo** (`bmad-build-auto`: parar solo ante bloqueos o decisiones de
negocio), **commits directos en `main`** (uno por historia), sin `push` sin permiso.

### 5.2 El ciclo que se repitió en cada historia

1. **Spec de la historia** → `_bmad-output/implementation-artifacts/spec-<historia>.md`
   (contrato: *Always / Never*, matriz I/O y casos límite, Code Map, criterios de
   aceptación, puerto de e2e propio).
2. **Implementación** (agente dev), con:
   - reglas en `src/domain` (TypeScript puro, sin Prisma),
   - casos de uso en `src/server`, pantallas en `src/app`,
   - `// RK-<clave> (PROG:línea)` + test por cada regla,
   - `// LEGACY-QUIRK(Dn)` donde se replica un comportamiento raro.
3. **Verificación**:
   ```bash
   npm run lint && npm test && npm run build && E2E_PORT=<puerto> npx playwright test
   ```
4. **Revisión en 4 capas** (subagentes independientes sobre el diff):
   - *Blind Hunter* (revisión a ciegas),
   - *Edge Case Hunter* (casos límite, contrastando con el spec y el fuente legado),
   - *Verification Gap* (qué no está probado),
   - *Intent Alignment* (¿implementa lo que pedía la historia?).
5. **Triage** (patch / defer / reject) y **patches** aplicados por el mismo agente.
6. **Cierre**: log de triage + "Auto Run Result" en el spec, `sprint-status.yaml`
   actualizado, commit `chore: close story …`.

### 5.3 Comandos útiles durante la construcción

```bash
# Diff de una historia para revisión (sin artefactos BMAD ni lockfile)
git diff <base> <rama> -- . ':(exclude)_bmad-output' ':(exclude)package-lock.json' > /tmp/diff.diff
```

```text
/bmad-sprint-planning     # pedir "status" para ver el avance del sprint
```

Cada skill de BMAD se "renderiza" antes de ejecutarse (lo hace Claude Code al invocarla):

```bash
uv run --no-cache _bmad/scripts/render_skill.py --project-root . --skill .claude/skills/bmad-build-auto
```

---

## 6. Fase 5 — Agentes en paralelo (worktrees)

Pedido: *"¿se podría crear en paralelo un agente por historia?"* → estrategia aprobada:

- Máximo **3 historias en paralelo**, cada una en su **git worktree** aislado.
- **Olas por dependencias**: A (2.4, 2.5, 4.1 → 2.6, 3.1, 4.4), B (4.2, 4.3, 5.1),
  C (6.1, 7.1, 7.2 → 7.3), 8.1 al final.
- Cada worktree con su propio `E2E_PORT` (p. ej. 3224, 3227, 3230…) y su propia `e2e.db`.
- Yo (orquestador) escribo los specs, lanzo las revisiones y **mergeo de a uno**, con la
  suite completa entre merges.

Preparación de cada worktree (lo hacía cada agente):

```bash
git reset --hard <sha de main>              # los worktrees nacían en un commit viejo
cp ../../.env .env
npm install
DATABASE_URL=file:./dev.db npx prisma migrate deploy
DATABASE_URL=file:./dev.db npx prisma db seed
```

Merge y limpieza:

```bash
git merge --no-edit worktree-agent-<id>
npm run lint && npm test && npm run build && E2E_PORT=3240 npx playwright test
git worktree remove --force .claude/worktrees/agent-<id>
git branch -d worktree-agent-<id>
```

Conflictos típicos resueltos a mano: `src/components/layout/navegacao.ts` (cada historia
activaba su ítem del menú), `package.json`, y en el endurecimiento `lotePagamentos.ts`.

---

## 7. Historias implementadas (orden de cierre)

| Épica | Historia | Legado | Pantalla / artefacto |
|---|---|---|---|
| 0 Fundación | 0.1 Scaffold + esquema | DDM | Next.js 16, Prisma 7, SQLite |
| | 0.2 Utilidades de dominio + auditoría | — | `money.ts`, `legacyDate.ts`, `cpf.ts`, `registrarEvento` |
| 1 Programas | 1.1 Inclusión y consulta | CADPROG | `/programas` |
| 2 Beneficiarios | 2.1 Inclusión/alteración | CADBENEF | `/beneficiarios` |
| | 2.2 Validación cadastral | VALBENEF | `/validacao/cadastro` |
| | 2.3 Validación de documentos | VALDOCS | `/validacao/documentos` |
| | 2.4 Dependientes | CADDEPEND | `/beneficiarios/[chave]/dependentes` |
| | 2.5 Descuentos registrados | — | `/beneficiarios/[chave]/descontos` |
| | 2.6 Consulta | CONSBENF | `/consulta` |
| 3 Elegibilidad | 3.1 Validación de elegibilidad | VALELEG | `/elegibilidade` |
| 4 Cálculo y pagos | 4.1 Motor + cálculo individual | CALCBENF | `/calculo` |
| | 4.2 Lote mensual | BATCHPGT | `/lote` + `npm run lote:pagamentos` |
| | 4.3 Recálculo de descuentos | CALCDSCT | `/descontos` |
| | 4.4 Consulta de pagos | — | `/pagamentos` (solo lectura) |
| 5 Corrección | 5.1 Corrección IPCA | CALCCORR | `/correcao` |
| 6 Conciliación | 6.1 Retorno CNAB 240 | BATCHCON | `/conciliacao` |
| 7 Informes | 7.1 Analítico | RELPGT | `/relatorios/pagamentos` |
| | 7.2 Consolidado | BATCHREL | `/relatorios/consolidado` |
| | 7.3 Auditoría | RELAUDIT | `/relatorios/auditoria` |
| 8 Deployment | 8.1 docker-compose | — | `Dockerfile`, `docker-compose.yml` |
| (extensión) | 1.2 Editar/desactivar programas | — | `/programas/[cod]/editar` |

---

## 8. Problemas encontrados y cómo se resolvieron

| Problema | Solución |
|---|---|
| MCP de RNC sin respuesta dentro de la sesión | Cliente SSE propio contra la misma API; Python del sistema (`/usr/bin/python3`) por un error de certificados SSL |
| Render de skills: "ambiguous config value" | Quitar claves duplicadas en `_bmad/config.toml` |
| Un subagente inventó nombres de campos | Renombrar a los nombres reales del DDM y regenerar la migración inicial |
| Worktrees creados sobre un commit viejo | `git reset --hard <sha de main>` como primer paso de cada agente |
| Límites de uso (HTTP 429) cortaban agentes | Reanudarlos y bajar la concurrencia |
| e2e intermitentes (`P1008`) | Causa: `SQLITE_BUSY` por transacciones `BEGIN` diferidas con escritores en otras conexiones. Fix en `src/server/db.ts`: reintento de `$transaction` con backoff; e2e sobre `next build && next start`; `e2e.db` en modo WAL |
| `PrismaClientValidationError` en `npm run dev` tras un cambio de schema | El servidor de desarrollo conserva el cliente Prisma viejo: `npx prisma migrate deploy` + **reiniciar** `npm run dev` |

---

## 9. Correcciones configurables de los quirks (D4–D23)

Pedido: *"implemente de D4 a D23"* → decisión: **corrección con flag** (por defecto,
paridad total con el legado).

```bash
# .env — lista de quirks a corregir (o ALL; ALL excluye D7, que exige auditoría)
SIFAP_QUIRKS_CORRIGIDOS="D17,D21,D23"
SIFAP_QUIRKS_CORRIGIDOS="ALL,D7"

# Flags con semántica inversa (el default ya es el comportamiento corregido)
LEGACY_DOC_ESPECIAL_ENABLED=false             # D4
LEGACY_STATUS_BRANCO_ALTERACAO_ENABLED=false  # D18
```

Se implementó en 3 grupos paralelos (cadastro, cálculo/pagos, informes). Tabla completa
en `docs/prd.md` §5.1. En el código: `// LEGACY-QUIRK(Dn)` (rama legado) y
`// CORRECAO(Dn)` (rama corregida).

---

## 10. Endurecimiento técnico (H1, H2, H3)

- **H1 — Concurrencia**: candado entre procesos en la base (`ProcessoLock`) para lote y
  conciliación, con renovación; reintentos por colisión de unicidad.
  ```bash
  npm run lock:liberar -- LOTE-PAGAMENTOS     # o CONCILIACAO, si quedó un candado huérfano
  npm run db:check                            # schema vs. migraciones
  ```
- **H2 — LGPD**: ningún CPF/NIS en URLs; clave opaca `chavePublica` por beneficiario;
  `Referrer-Policy: same-origin`.
- **H3 — Volumen y limpieza**: consolidado por agregación SQL, tope de 20.000 filas en
  informes, lote leído de a 500, helpers de error únicos (`src/lib/falhas.ts`).

---

## 11. Uso diario

```bash
# Primera vez
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev                         # http://localhost:3000  (o: npm run dev -- -p 3001)

# Tras un pull con migraciones nuevas
npx prisma migrate deploy && npx prisma generate   # y reiniciar npm run dev

# Calidad
npm run lint
npm test
SIFAP_QUIRKS_CORRIGIDOS=ALL,D7 npx vitest run      # modo corregido
npm run build
E2E_PORT=3240 npx playwright test

# Lote mensual por CLI
npm run lote:pagamentos
npm run lote:pagamentos -- --data=20260901         # fecha fija

# Docker
docker compose up --build -d
docker compose run --rm app npm run db:seed        # datos de demo (opcional)
docker compose run --rm app npm run lote:pagamentos
bash scripts/docker-smoke.sh sifap-smoke 3300      # verificación completa y limpieza
```

---

## 12. Publicación

```bash
git status                       # .claude/ y _bmad/ quedan fuera (herramientas locales)
git log --oneline origin/main..main
git push origin main
```

Antes del push se verificó que no hubiera `.env`, bases `.db` ni tokens en los commits.

---

## 13. Pendientes (decisiones de negocio)

- Login/roles e identidad real del operador en la auditoría.
- Qué correcciones de quirks activar en producción (sugerido: `D17,D21,D23`).
- Despliegue en Vercel: requiere base gestionada (libSQL o Postgres), lote vía Vercel
  Cron y ajustar la subida CNAB al límite de 4,5 MB por request.
