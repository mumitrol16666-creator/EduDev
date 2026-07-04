#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/edudev}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
PM2_APP="${PM2_APP:-edudev}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-$APP_DIR/deploy/ecosystem.config.cjs}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4100/ready}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$APP_DIR/deploy/backup-postgres.sh}"
LOCK_FILE="${LOCK_FILE:-/tmp/edudev-deploy.lock}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP_SECONDS="${HEALTH_SLEEP_SECONDS:-2}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

healthcheck() {
  local attempt
  for attempt in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null; then
      log "Healthcheck passed: $HEALTH_URL"
      return 0
    fi
    log "Healthcheck attempt $attempt/$HEALTH_RETRIES failed"
    sleep "$HEALTH_SLEEP_SECONDS"
  done
  return 1
}

rollback_code() {
  local previous_sha="$1"
  if [[ -z "$previous_sha" ]]; then
    log "No previous commit available for rollback"
    return 1
  fi

  log "Rolling code back to $previous_sha"
  git reset --hard "$previous_sha"
  npm ci --prefix backend
  npm run prisma:generate --prefix backend
  npm prune --omit=dev --prefix backend
  pm2 startOrReload "$ECOSYSTEM_FILE" --env production --update-env
  healthcheck
}

main() {
  require_command git
  require_command npm
  require_command pm2
  require_command curl
  require_command flock

  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "Another deploy is already running"

  cd "$APP_DIR"

  local previous_sha target_sha
  previous_sha="$(git rev-parse HEAD 2>/dev/null || true)"

  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    fail "Tracked files are modified on server. Commit/stash them before deploy."
  fi

  log "Fetching $REMOTE/$BRANCH"
  git fetch "$REMOTE" "$BRANCH"
  target_sha="$(git rev-parse "$REMOTE/$BRANCH")"
  log "Deploying $target_sha"

  git reset --hard "$target_sha"

  log "Installing backend dependencies"
  npm ci --prefix backend

  log "Checking backend and frontend JavaScript syntax"
  find backend/src crm/js -name '*.js' -print0 | xargs -0 -n1 node --check

  log "Validating Prisma schema"
  npm run prisma:validate --prefix backend
  npm run prisma:generate --prefix backend

  if [[ "$RUN_MIGRATIONS" == "true" ]]; then
    if [[ -x "$BACKUP_SCRIPT" ]]; then
      log "Running pre-migration database backup"
      "$BACKUP_SCRIPT"
    else
      log "Backup script not executable or missing: $BACKUP_SCRIPT"
      log "Continuing because database backup may be handled by platform automation"
    fi

    log "Applying Prisma migrations"
    npm run prisma:migrate:deploy --prefix backend
  fi

  log "Pruning development dependencies"
  npm prune --omit=dev --prefix backend

  log "Reloading PM2 app"
  pm2 startOrReload "$ECOSYSTEM_FILE" --env production --update-env
  pm2 save

  if ! healthcheck; then
    log "Deploy healthcheck failed"
    rollback_code "$previous_sha" || true
    fail "Deploy failed. Code rollback attempted. Database migrations are not automatically rolled back."
  fi

  log "Deploy completed successfully"
}

main "$@"
