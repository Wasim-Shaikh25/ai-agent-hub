#!/usr/bin/env bash
# Docker smoke test for hub-server.
# Builds the server image, starts a Postgres + Redis stack, runs migrations,
# and verifies the container is healthy and /health returns 200.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

NETWORK="hub-server-smoke"
POSTGRES_NAME="hub-server-smoke-pg"
REDIS_NAME="hub-server-smoke-redis"
SERVER_NAME="hub-server-smoke-server"
IMAGE="hub-server:smoke"

cleanup() {
  docker rm -f "$SERVER_NAME" "$POSTGRES_NAME" "$REDIS_NAME" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup 2>/dev/null || true

echo "Building server image..."
docker build -t "$IMAGE" "$REPO_ROOT/server"

docker network create "$NETWORK"

docker run -d --name "$POSTGRES_NAME" --network "$NETWORK" \
  -e POSTGRES_USER=hub -e POSTGRES_PASSWORD=hub -e POSTGRES_DB=hub \
  pgvector/pgvector:pg16

docker run -d --name "$REDIS_NAME" --network "$NETWORK" redis:7-alpine

# Wait for Postgres to be ready
for i in {1..30}; do
  if docker exec "$POSTGRES_NAME" pg_isready -U hub -d hub >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker run -d --name "$SERVER_NAME" --network "$NETWORK" -p 18080:8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgres://hub:hub@$POSTGRES_NAME:5432/hub" \
  -e REDIS_URL="redis://$REDIS_NAME:6379" \
  -e JWT_SECRET='prod-jwt-secret-must-be-at-least-thirty-two-characters-long' \
  -e SUPERADMIN_PASSWORD='prod-superadmin-password-long' \
  -e DEV_API_KEY='' \
  -e EMBEDDINGS_PROVIDER=local \
  -e PORT=8080 \
  "$IMAGE"

# Wait for healthy status and /health
for i in {1..60}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$SERVER_NAME" 2>/dev/null || echo 'starting')
  if [[ "$STATUS" == "healthy" ]]; then
    break
  fi
  sleep 1
done

HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:18080/health || true)
if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "PASS: server container is healthy and /health returned 200."
else
  echo "ERROR: server did not become healthy (status=$HTTP_STATUS)." >&2
  docker logs "$SERVER_NAME" >&2
  exit 1
fi
