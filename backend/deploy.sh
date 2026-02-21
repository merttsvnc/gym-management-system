#!/usr/bin/env bash
set -euo pipefail

# Run relative to this script's directory (backend/)
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

DOMAIN="gym-api.quuilo.com"
HEALTH_URL="https://${DOMAIN}/health"

API_CONTAINER="gym-api"
DB_CONTAINER="gym_api_db"

echo "==> App dir:        $APP_DIR"
echo "==> Compose file:   $COMPOSE_FILE"
echo "==> Health URL:     $HEALTH_URL"
echo "==> API container:  $API_CONTAINER"
echo "==> DB container:   $DB_CONTAINER"

echo "==> [1/9] Pre-checks"
command -v docker >/dev/null
docker compose version >/dev/null

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: $COMPOSE_FILE not found in $APP_DIR"
  exit 1
fi

if [ ! -f ".env.prod" ]; then
  echo "ERROR: .env.prod not found in $APP_DIR"
  echo "Create backend/.env.prod (do NOT commit it)."
  exit 1
fi

echo "==> [2/9] Optional: git pull (only if this folder is a git repo)"
if [ -d ".git" ]; then
  git pull --rebase
else
  echo "Note: backend/ is not a git repo. Skipping git pull."
  echo "Tip: On VPS, you can clone the full repo OR rsync only backend/."
fi

echo "==> [3/9] Build images"
docker compose -f "$COMPOSE_FILE" build

echo "==> [4/9] Start services"
docker compose -f "$COMPOSE_FILE" up -d

echo "==> [5/9] Wait for Postgres to be ready"
set +e
for i in $(seq 1 40); do
  docker exec "$DB_CONTAINER" pg_isready -U gym_api -d gym_api >/dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "DB is ready ✅"
    break
  fi
  echo "DB not ready yet... ($i/40)"
  sleep 2
done
set -e

echo "==> [6/9] Run Prisma migrations (deploy)"
docker exec -i "$API_CONTAINER" sh -lc "npx prisma migrate deploy"

echo "==> [7/9] Quick API container status"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "($API_CONTAINER|$DB_CONTAINER)" || true

echo "==> [8/9] Health check"
set +e
ok=0
for i in $(seq 1 30); do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$HEALTH_URL")
  echo "Attempt $i -> HTTP $code"
  if [ "$code" = "200" ]; then
    ok=1
    echo "OK: service is healthy ✅"
    break
  fi
  sleep 2
done
set -e

echo "==> [9/9] Tail logs"
docker logs --tail=160 "$API_CONTAINER" || true

if [ "$ok" -ne 1 ]; then
  echo "ERROR: Health check failed. Useful logs:"
  echo "- Traefik:"
  docker logs --tail=200 traefik | grep -iE "acme|certificate|error|router|service|${DOMAIN}" || true
  echo "- API:"
  docker logs --tail=200 "$API_CONTAINER" || true
  exit 1
fi

echo "DONE ✅"