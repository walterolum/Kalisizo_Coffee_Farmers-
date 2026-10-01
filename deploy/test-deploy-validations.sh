#!/usr/bin/env bash
# Verifies deploy.sh's pre-flight validation without a Docker daemon: `docker` is
# stubbed, so execution past the checks would only echo.
#
# Runs in a throwaway copy of the project. It must never be pointed at a working
# tree with a real .env, because these cases deliberately create and remove one.
set -u

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cp -r deploy "$WORK/"
cp .env.verify "$WORK/.env.verify"

mkdir -p "$WORK/tmp/bin"
{
  echo '#!/bin/sh'
  echo 'echo "[stub-docker] $*"'
  echo 'exit 0'
} > "$WORK/tmp/bin/docker"
chmod +x "$WORK/tmp/bin/docker"
export PATH="$WORK/tmp/bin:$PATH"

cd "$WORK"

echo "=== case 1: JWT_SECRET empty -> must refuse ==="
sed 's|^JWT_SECRET=.*|JWT_SECRET=""|' .env.verify > .env
bash deploy/deploy.sh
echo "exit=$?"
echo

echo "=== case 2: POSTGRES_PASSWORD has URL-reserved chars -> must refuse ==="
sed 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD="a@b:c/d"|' .env.verify > .env
bash deploy/deploy.sh
echo "exit=$?"
echo

echo "=== case 3: no .env at all -> must refuse ==="
rm -f .env
bash deploy/deploy.sh
echo "exit=$?"
echo

echo "=== case 4: everything valid -> must reach the build ==="
cp .env.verify .env
bash deploy/deploy.sh 2>&1 | head -12
echo "exit=${PIPESTATUS[0]}"
echo

echo "=== case 5: --seed without ADMIN_PASSWORD -> must refuse before deploying ==="
sed 's|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=""|' .env.verify > .env
bash deploy/deploy.sh --seed
echo "exit=$?"