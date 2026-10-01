#!/usr/bin/env bash
# Build, migrate and roll the stack to the newest commit.
#
#   ./deploy/deploy.sh            build, migrate, recreate containers
#   ./deploy/deploy.sh --seed     also run the idempotent content seed
#
# Safe to re-run. `docker compose up` is a no-op when the image is unchanged,
# `prisma migrate deploy` skips migrations already applied, and the seed only
# fills empty tables.

set -euo pipefail

cd "$(dirname "$0")/.."

RUN_SEED=0
for arg in "$@"; do
  case "$arg" in
    --seed) RUN_SEED=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f .env ]; then
  echo "error: .env not found. Run: cp .env.example.production .env" >&2
  exit 1
fi

# Fail before touching anything if a required value is still a placeholder. A
# half-configured .env otherwise produces an app that boots and then 500s.
missing=0
for key in JWT_SECRET POSTGRES_PASSWORD NEXT_PUBLIC_SITE_URL SITE_DOMAIN; do
  value="$(grep -E "^${key}=" .env | head -n1 | cut -d= -f2- | tr -d '"')"
  if [ -z "$value" ]; then
    echo "error: ${key} is empty in .env" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "fill these in first; see .env.example.production" >&2
  exit 1
fi

# Compose splices POSTGRES_PASSWORD straight into DATABASE_URL. A character that
# is legal in a password but reserved in a URL silently produces a malformed
# connection string, and the symptom is a Prisma "invalid port number" error
# thrown at query time rather than at startup — so it is worth catching here,
# where the message can still name the cause.
read_env() { grep -E "^$1=" .env | head -n1 | cut -d= -f2- | tr -d '"'; }

pg_password="$(read_env POSTGRES_PASSWORD)"
if printf '%s' "$pg_password" | grep -q '[^A-Za-z0-9._~-]'; then
  echo "error: POSTGRES_PASSWORD contains characters that are reserved in a URL." >&2
  echo "       It is interpolated into DATABASE_URL, so ':' '@' '/' '?' '#'" >&2
  echo "       '%' '+' would break the connection string. Regenerate it with:" >&2
  echo "       openssl rand -hex 24" >&2
  exit 1
fi

# Checked before anything is deployed, not after: a seed that then refuses to
# run has already replaced the running image, leaving a half-applied deploy.
if [ "$RUN_SEED" -eq 1 ] && [ -z "$(read_env ADMIN_PASSWORD)" ]; then
  echo "error: --seed needs ADMIN_PASSWORD set in .env" >&2
  exit 1
fi

echo "==> building"
docker compose build --pull app

# Migrations run to completion before the new app is served. Reversing this
# order would start the new code against the old schema.
echo "==> migrating"
docker compose run --rm migrate

echo "==> starting"
# --wait blocks until the app reports healthy, so a failed deploy fails the
# script instead of quietly leaving a broken container running.
docker compose up -d --wait app caddy

if [ "$RUN_SEED" -eq 1 ]; then
  echo "==> seeding"
  docker compose run --rm migrate npx tsx prisma/seed.ts
fi

echo "==> health"
docker compose exec -T app curl -fsS http://127.0.0.1:3000/api/v1/health
echo

echo
echo "deployed: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown commit')"
echo "site:     $(grep -E '^NEXT_PUBLIC_SITE_URL=' .env | cut -d= -f2- | tr -d '\"')"