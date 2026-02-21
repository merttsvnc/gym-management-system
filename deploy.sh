#!/usr/bin/env bash
set -Eeuo pipefail

# ===== Config =====
APP_NAME="gym-api"
REPO_BRANCH="main"

DOMAIN="gym-api.quuilo.com"
HEALTH_PATH="/health"
HEALTH_URL="https://${DOMAIN}${HEALTH_PATH}"
HEALTH_TIMEOUT=40

NETWORK_NAME="traefik_web"

BACKEND_DIR="backend"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.prod.yml"

API_CONTAINER="gym-api"
DB_CONTAINER="gym_api_db"

# ===== Helpers =====
log() { printf "\n[%s] %s\n" "$(date '+%F %T')" "$*"; }
err() { printf "\n[ERROR %s] %s\n" "$(date '+%F %T')" "$*" >&2; }

# ===== Pre-flight =====
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then err "docker yok"; exit 1; fi
if ! docker compose version >/dev/null 2>&1; then err "docker compose plugin yok"; exit 1; fi
if [[ ! -f "$COMPOSE_FILE" ]]; then err "${COMPOSE_FILE} yok"; exit 1; fi

if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  err "backend/.env yok. Production env dosyasını oluştur."
  exit 1
fi

# Network hazırla
if ! sudo docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  log "Network '${NETWORK_NAME}' yok, oluşturuluyor..."
  sudo docker network create "$NETWORK_NAME" >/dev/null
fi

current_sha()  { git rev-parse --short HEAD; }
upstream_sha() { git ls-remote origin -h "refs/heads/${REPO_BRANCH}" | awk '{print $1}' | cut -c1-7; }
has_updates()  { [[ "$(current_sha)" != "$(upstream_sha)" ]]; }

health_check() {
  log "Sağlık kontrolü: ${HEALTH_URL}"
  set +e
  timeout "${HEALTH_TIMEOUT}" bash -c \
    "until curl -sk -o /dev/null -w '%{http_code}' '${HEALTH_URL}' | egrep -q '^(200)$'; do sleep 1; done"
  local HC=$?
  set -e
  return $HC
}

build_and_deploy() {
  log "Kod çekiliyor..."
  git fetch --all -p
  git checkout "${REPO_BRANCH}"
  git pull --rebase origin "${REPO_BRANCH}"

  local GIT_SHA
  GIT_SHA="$(git rev-parse --short HEAD)"
  log "Current commit: ${GIT_SHA}"

  log "Compose build (no-cache)..."
  sudo docker compose -f "${COMPOSE_FILE}" down || true
  sudo docker compose -f "${COMPOSE_FILE}" build --no-cache
  sudo docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

  log "DB hazır mı?"
  set +e
  for i in $(seq 1 40); do
    sudo docker exec "${DB_CONTAINER}" pg_isready -U gym_api -d gym_api >/dev/null 2>&1
    [[ $? -eq 0 ]] && break
    sleep 2
  done
  set -e

  log "Prisma migrate deploy..."
  sudo docker exec -i "${API_CONTAINER}" sh -lc "npx prisma migrate deploy --schema=prisma/schema.prisma"

  if ! health_check; then
    err "Health-check başarısız."
    sudo docker logs --tail 200 "${API_CONTAINER}" || true
    sudo docker logs --tail 200 traefik || true
    exit 1
  fi

  log "Dangling image prune"
  sudo docker image prune -f >/dev/null 2>&1 || true

  log "✅ Deploy tamamlandı (${GIT_SHA})."
}

case "${1:-once}" in
  once)
    if has_updates; then
      build_and_deploy
    else
      log "Uzakta yeni commit yok. Yine de force için: $0 force"
    fi
    ;;
  force)
    build_and_deploy
    ;;
  watch)
    while true; do
      if has_updates; then
        build_and_deploy
      fi
      sleep 20
    done
    ;;
  *)
    err "Kullanım: $0 [once|force|watch]"
    exit 2
    ;;
esac

exit 0