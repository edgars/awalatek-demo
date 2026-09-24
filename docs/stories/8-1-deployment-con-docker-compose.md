# Story 8.1: Deployment con docker-compose

**Épica:** 8 — Deployment  
**Requisitos:** técnico (sin reglas legadas) (ver `docs/prd.md`)  
**Arquitectura:** `docs/architecture.md`

## Criterios de aceptación

- [ ] `docker compose up --build` levanta el servicio único `app` (Next.js standalone, puerto 3000) desde un checkout limpio + `.env`.
- [ ] SQLite en volumen nombrado `sifap-data` (`/data/sifap.db`); `prisma migrate deploy` al arrancar; los datos sobreviven a `down`/`up`.
- [ ] `docker compose run --rm app npm run lote:pagamentos` ejecuta el lote mensual.
- [ ] `.env.example` documenta todas las variables leídas por la app.

## Definición de terminado

- Criterios de aceptación marcados; `npm run lint && npm test` en verde.
- Comportamientos `LEGACY-QUIRK` citados con su ID; `NEEDS REVIEW`/`TODO(review)` explícitos.
