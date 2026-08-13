#!/usr/bin/env bash
# Print Supabase project ref from a postgresql URL (no credentials).
# Usage: source this file; supabase_db_ref "$DATABASE_URL"
supabase_db_ref() {
  local url="${1:-}"
  if [[ "$url" =~ postgres\.([a-zA-Z0-9]+): ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$url" =~ @db\.([a-zA-Z0-9]+)\.supabase ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  printf 'unknown'
  return 1
}
