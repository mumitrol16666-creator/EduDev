#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/edudev}"
MIGRATION_NAME="${MIGRATION_NAME:-20260703190000_init}"

if [[ "${CONFIRM_BASELINE:-}" != "true" ]]; then
  cat <<MSG
This script marks the initial Prisma migration as already applied.

Use it only once when production tables already exist because the database
was previously created with prisma db push.

Run:
  CONFIRM_BASELINE=true $0
MSG
  exit 1
fi

cd "$APP_DIR"
npm run prisma:validate --prefix backend
npx --prefix backend prisma migrate resolve --applied "$MIGRATION_NAME" --schema backend/prisma/schema.prisma
