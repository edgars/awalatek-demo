# syntax=docker/dockerfile:1
# SIFAP — imagen multi-stage (ADR-007): Next.js standalone + SQLite en /data.

# ---- base -------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
# openssl: requerido por el schema engine de `prisma migrate deploy`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# ---- deps: npm ci (build nativo de better-sqlite3 + postinstall prisma generate) ----
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build: next build (standalone) + bundles JS del lote y del seed ----------
FROM deps AS build
COPY . .
# El servidor standalone no incluye `.next/static` ni `public/`: se copian aquí.
# Nunca un .env dentro de la imagen (el .dockerignore ya lo excluye).
RUN npm run build \
  && npm run build:scripts \
  && cp -r .next/static .next/standalone/.next/static \
  && if [ -d public ]; then cp -r public .next/standalone/public; fi \
  && rm -f .next/standalone/.env*

# ---- cli-deps: prisma CLI (migrate deploy) + dependencias de los bundles del lote/seed ----
# Se podan del árbol del lockfile (versiones exactas) todas las dependencias fuera de
# docker/cli-deps.json; el servidor standalone ya trae su propio node_modules trazado.
FROM deps AS cli-deps
COPY docker/cli-deps.json /tmp/cli-deps.json
RUN node -e ' \
    const fs = require("fs"); \
    const keep = JSON.parse(fs.readFileSync("/tmp/cli-deps.json", "utf8")).dependencies; \
    const p = JSON.parse(fs.readFileSync("package.json", "utf8")); \
    const faltantes = keep.filter((k) => !(k in p.dependencies)); \
    if (faltantes.length) { console.error("cli-deps.json fora de dependencies:", faltantes.join(", ")); process.exit(1); } \
    p.dependencies = Object.fromEntries(Object.entries(p.dependencies).filter(([k]) => keep.includes(k))); \
    delete p.devDependencies; \
    fs.writeFileSync("package.json", JSON.stringify(p, null, 2));' \
  && npm prune --omit=dev --no-audit --no-fund \
  && rm -rf node_modules/.cache

# ---- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TZ=America/Sao_Paulo \
    DATABASE_URL=file:/data/sifap.db

COPY --from=cli-deps --chown=node:node /app/node_modules ./node_modules
# Standalone: server.js, .next (con static) y node_modules trazado (se fusiona con el
# de cli-deps; ambos salen del mismo lockfile).
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./prisma.config.ts
COPY --chown=node:node docker/package.json ./package.json
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# /data se crea con dueño `node` para que el volumen nombrado herede los permisos.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
