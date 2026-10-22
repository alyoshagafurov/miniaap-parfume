#!/usr/bin/env bash
set -euo pipefail

# Prisma 7 reads DATABASE_URL from prisma.config.ts even during client
# generation. Preview builds have no production database by default, so give
# code generation a non-routable placeholder there. Production migrations must
# use the real Vercel Production DATABASE_URL and fail closed if it is missing.
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL is required for production migrations" >&2
    exit 1
  fi
  pnpm prisma generate
  pnpm db:deploy
else
  DATABASE_URL="${DATABASE_URL:-postgresql://build:build@127.0.0.1:5432/build?schema=public}" pnpm prisma generate
fi

pnpm build
