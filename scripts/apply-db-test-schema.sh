#!/usr/bin/env bash

# DB test 잡 전용. 운영 스키마 스냅샷 위에 스냅샷보다 새 마이그레이션만 얹는다.
# 설계: docs/specs/2026-10-19-activity-log-design.md 8.3

set -euo pipefail

migrations_dir="${1:?usage: apply-db-test-schema.sh <migrations dir>}"
db_url="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
baseline_db_url="${BASELINE_DB_URL:-$db_url}"
baseline="supabase/baseline/schema.sql"
prelude="supabase/baseline/prelude.sql"

baseline_version="$(head -n 1 "$baseline" | sed -n 's/^-- baseline-migration: \([0-9]\{14\}\)$/\1/p')"
if [[ -z "$baseline_version" ]]; then
  echo "::error::$baseline must start with '-- baseline-migration: <version>'."
  exit 1
fi

run_sql() {
  psql "$1" --quiet --no-psqlrc -v ON_ERROR_STOP=1 --file "$2"
}

if [[ -f "$prelude" ]]; then
  run_sql "$baseline_db_url" "$prelude"
fi
run_sql "$baseline_db_url" "$baseline"

applied=0
while IFS= read -r file; do
  version="$(basename "$file" | cut -d_ -f1)"
  if [[ "$version" > "$baseline_version" ]]; then
    echo "Applying $(basename "$file")"
    run_sql "$db_url" "$file"
    applied=$((applied + 1))
  fi
done < <(find "$migrations_dir" -maxdepth 1 -name '*.sql' | sort)
echo "Applied $applied migration(s) newer than $baseline_version."
