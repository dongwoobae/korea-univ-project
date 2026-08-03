#!/usr/bin/env bash

# `migrate`와 `verify-migration-history` 잡이 공유한다.
# 원본 secret은 자동 마스킹되지만 `[YOUR-PASSWORD]` 치환 후의 인코딩된 파생 값은
# 별도 마스킹 없이는 로그에 그대로 남는다. 두 잡이 같은 마스킹을 받도록
# 로직을 한 곳에만 둔다.

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL_TEMPLATE:-}" || -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "::error::Configure SUPABASE_DB_URL and SUPABASE_DB_PASSWORD in the production environment or repository secrets."
  exit 1
fi
if [[ "$SUPABASE_DB_URL_TEMPLATE" != *".pooler.supabase.com:5432/"* ]]; then
  echo "::error::SUPABASE_DB_URL must be the IPv4-compatible Session pooler URI on port 5432."
  exit 1
fi
if [[ "$SUPABASE_DB_URL_TEMPLATE" != *"[YOUR-PASSWORD]"* ]]; then
  echo "::error::SUPABASE_DB_URL must retain the [YOUR-PASSWORD] placeholder."
  exit 1
fi

encoded_password="$(
  node -e 'process.stdout.write(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD))'
)"
database_url="${SUPABASE_DB_URL_TEMPLATE/\[YOUR-PASSWORD\]/$encoded_password}"

echo "::add-mask::$encoded_password"
echo "::add-mask::$database_url"
echo "SUPABASE_MIGRATION_DB_URL=$database_url" >> "$GITHUB_ENV"
