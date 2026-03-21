#!/usr/bin/env bash
set -euo pipefail

# One-click deploy script for Tencent Cloud CVM (Docker).
# Usage:
#   chmod +x scripts/deploy-cvm.sh
#   ./scripts/deploy-cvm.sh
#
# Required env vars:
#   OPENAI_API_KEY (or DEEPSEEK_API_KEY)
# Optional env vars:
#   OPENAI_BASE_URL, OPENAI_MODEL, PORT
#   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_OTP_SECRET, ADMIN_STATIC_OTP, ADMIN_SIGN_SECRET

APP_NAME="${APP_NAME:-ai-chat-assistant}"
IMAGE_NAME="${IMAGE_NAME:-${APP_NAME}:latest}"
PORT="${PORT:-80}"

if [[ -z "${OPENAI_API_KEY:-}" && -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY or DEEPSEEK_API_KEY is required."
  exit 1
fi

echo "==> Building image: ${IMAGE_NAME}"
docker build -t "${IMAGE_NAME}" .

echo "==> Replacing old container: ${APP_NAME}"
docker rm -f "${APP_NAME}" >/dev/null 2>&1 || true

echo "==> Starting new container"
docker run -d \
  --name "${APP_NAME}" \
  --restart unless-stopped \
  -p "${PORT}:80" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}" \
  -e OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.deepseek.com/v1}" \
  -e OPENAI_MODEL="${OPENAI_MODEL:-deepseek-chat}" \
  -e ADMIN_USERNAME="${ADMIN_USERNAME:-rosent}" \
  -e ADMIN_PASSWORD="${ADMIN_PASSWORD:-2026321}" \
  -e ADMIN_OTP_SECRET="${ADMIN_OTP_SECRET:-local-admin-otp}" \
  -e ADMIN_STATIC_OTP="${ADMIN_STATIC_OTP:-246810}" \
  -e ADMIN_SIGN_SECRET="${ADMIN_SIGN_SECRET:-local-admin-sign}" \
  "${IMAGE_NAME}"

echo "==> Health check"
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/api/health" || {
  echo "Health check failed. Latest logs:"
  docker logs --tail 120 "${APP_NAME}" || true
  exit 1
}

echo "Deploy success."
docker ps --filter "name=${APP_NAME}" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
