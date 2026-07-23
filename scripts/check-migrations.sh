#!/usr/bin/env bash

set -euo pipefail

: "${EVENT_NAME:?EVENT_NAME is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
  echo "Manual run: all committed migrations will be reconciled."
  changes="$(
    git ls-files 'supabase/migrations/*.sql' |
      awk '{ print "A\t" $0 }'
  )"
else
  if [[ -z "${BASE_SHA:-}" || "$BASE_SHA" == "0000000000000000000000000000000000000000" ]]; then
    BASE_SHA="$(git hash-object -t tree /dev/null)"
  fi
  changes="$(git diff --name-status "$BASE_SHA" "$HEAD_SHA" -- supabase/migrations)"
fi

if [[ -z "$changes" ]]; then
  echo "has_changes=false" >> "$GITHUB_OUTPUT"
  echo "No migration changes."
  exit 0
fi

echo "$changes"
echo "has_changes=true" >> "$GITHUB_OUTPUT"

invalid_changes="$(awk '$1 != "A" { print }' <<< "$changes")"
if [[ -n "$invalid_changes" ]]; then
  echo "::error::Applied migrations are immutable. Add a new migration instead of modifying, deleting, or renaming an existing file."
  echo "$invalid_changes"
  exit 1
fi

while IFS=$'\t' read -r status file; do
  [[ "$status" == "A" ]] || continue
  filename="$(basename "$file")"
  if [[ ! "$filename" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "::error file=$file::Migration filenames must match YYYYMMDDHHMMSS_lower_snake_case.sql."
    exit 1
  fi
  if [[ ! -s "$file" ]]; then
    echo "::error file=$file::Migration file must not be empty."
    exit 1
  fi
done <<< "$changes"
