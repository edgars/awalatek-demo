#!/usr/bin/env bash
# Smoke test del despliegue docker-compose (story 8.1), repetible:
#   scripts/docker-smoke.sh [proyecto] [puerto-host]      (default: sifap-smoke 3300)
# Construye y levanta un proyecto compose aislado (volumen propio <proyecto>-data),
# verifica HTTP 200 + assets estáticos, seed, lote (exit 0), migración inválida (exit ≠ 0)
# y persistencia tras down/up. Al final borra SOLO ese proyecto (contenedores, volumen,
# imagen local); KEEP=1 lo conserva para inspección.
set -euo pipefail

PROJECT="${1:-sifap-smoke}"
PORT="${2:-3300}"
BASE="http://localhost:${PORT}"
export SIFAP_PORT="$PORT" SIFAP_VOLUME="${PROJECT}-data"
cd "$(dirname "$0")/.."

dc() { docker compose -p "$PROJECT" "$@"; }
ok() { printf '  ✓ %s\n' "$*"; }
falha() { printf '  ✗ %s\n' "$*" >&2; exit 1; }

limpar() {
  if [ "${KEEP:-0}" = "1" ]; then echo "KEEP=1: proyecto ${PROJECT} conservado"; return; fi
  dc down -v --rmi local >/dev/null 2>&1 || true
  # Imágenes huérfanas de builds anteriores de ESTE proyecto (no toca otras).
  docker image prune -f --filter "label=com.docker.compose.project=${PROJECT}" >/dev/null 2>&1 || true
}
trap limpar EXIT

esperar_200() {
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$BASE/" 2>/dev/null; then return 0; fi
    sleep 1
  done
  dc logs app | tail -30 >&2
  falha "GET / sin respuesta 200 en 60 s"
}

status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1"; }

contagens() {
  dc exec -T app node -e '
    const D = require("better-sqlite3");
    const d = new D("/data/sifap.db", { readonly: true });
    const c = (t) => d.prepare(`select count(*) c from ${t}`).get().c;
    console.log(["ProgramaSocial", "Beneficiario", "Pagamento"].map((t) => `${t}=${c(t)}`).join(" "));'
}

echo "== build + up (${PROJECT}, puerto ${PORT})"
dc up --build -d
esperar_200
ok "GET / → 200"
for rota in /programas /conciliacao /pagamentos; do
  [ "$(status "$rota")" = "200" ] || falha "GET $rota → $(status "$rota")"
  ok "GET $rota → 200"
done
css="$(curl -fsS "$BASE/" | grep -oE '/_next/static/[^"]+\.css' | head -1 || true)"
[ -n "$css" ] || falha "la home no referencia ningún stylesheet /_next/static"
[ "$(status "$css")" = "200" ] || falha "GET $css → $(status "$css")"
ok "GET $css → 200 (assets estáticos copiados)"

echo "== seed + lote"
dc run --rm -T app npm run db:seed
dc run --rm -T app npm run lote:pagamentos || falha "lote:pagamentos terminó con exit $?"
ok "lote:pagamentos exit 0"

echo "== migración con DATABASE_URL inválida"
if dc run --rm -T --no-deps -e DATABASE_URL=file:/nao/existe/x.db app true >/dev/null 2>&1; then
  falha "el entrypoint no falló con DATABASE_URL inválida"
fi
ok "entrypoint termina con exit ≠ 0"

echo "== persistencia down/up"
antes="$(contagens)"
dc down
dc up -d
esperar_200
depois="$(contagens)"
[ "$antes" = "$depois" ] || falha "datos distintos tras down/up: '$antes' ≠ '$depois'"
case "$depois" in *"Pagamento=0"*) falha "sin pagamentos tras el lote: $depois" ;; esac
ok "datos persistidos: $depois"

echo "== OK (imagen: $(docker image ls -q "${PROJECT}-app" | head -1))"
docker image ls "${PROJECT}-app"
