#!/bin/sh
# ADR-007: aplica las migraciones pendientes contra DATABASE_URL y luego ejecuta el
# comando (por defecto `node server.js`; también `npm run lote:pagamentos`, etc.).
# Si la migración falla, el contenedor termina con ese código de error.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "docker-entrypoint: DATABASE_URL não configurada" >&2
  exit 1
fi

/app/node_modules/.bin/prisma migrate deploy

exec "$@"
