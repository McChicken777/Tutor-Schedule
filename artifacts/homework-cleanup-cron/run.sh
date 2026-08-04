#!/bin/bash
# Daily cleanup: deletes object-storage files for homework records older than
# 28 days. Skips any file that has an open report against it.
# Runs as a Replit Scheduled Deployment (cron: 0 3 * * *).

set -euo pipefail

if [ -z "${INTERNAL_CRON_SECRET:-}" ]; then
  echo "ERROR: INTERNAL_CRON_SECRET is not set" >&2
  exit 1
fi

TARGET_URL="https://81ea024b-7dcc-4d12-8980-329ab76f41ef-00-3pfnigp3oiasq.janeway.replit.dev/api/internal/homework-files-cleanup/run"

echo "Running homework-files-cleanup at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "X-Internal-Secret: ${INTERNAL_CRON_SECRET}" \
  "${TARGET_URL}")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)

echo "HTTP $http_code"
echo "$body"

if [ "$http_code" -ne 200 ]; then
  echo "ERROR: expected 200, got $http_code" >&2
  exit 1
fi
