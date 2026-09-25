#!/bin/sh
# ADR-007: aplica las migraciones pendientes contra DATABASE_URL y luego ejecuta el
# comando (por defecto `node server.js`; también `npm run lote:pagamentos`, etc.).
# Si la migración falla, el contenedor termina con ese código de error.
# SKIP_MIGRATIONS=1 omite la migración (comandos puntuales con `docker compose run`).
set -e

[ $# -gt 0 ] || set -- node server.js

if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL não configurada" >&2
  exit 1
fi

[ -w /data ] || { echo "docker-entrypoint: /data sem permissão de escrita" >&2; exit 1; }
if [ "$SKIP_MIGRATIONS" = "1" ]; then
  echo "docker-entrypoint: SKIP_MIGRATIONS=1 — migrações não aplicadas" >&2
else
  # Lock no volume: serializa migrações de contêineres simultâneos (app + run).
  flock -w 120 /data/.migrate.lock /app/node_modules/.bin/prisma migrate deploy
fi

exec "$@"
