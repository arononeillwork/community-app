#!/usr/bin/env bash
# Start the local Supabase stack (it runs as Docker containers).
#
#   npm run db:start        lightweight: Postgres, Auth, REST, Storage, Realtime, Mailpit
#   npm run db:start:full   everything, including Supabase Studio on http://127.0.0.1:54323
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

mode="${1:-light}"
case "$mode" in
  light|--light) mode="light" ;;
  full|--full) mode="full" ;;
  *) die "Unknown option '$mode'. Use: scripts/db-start.sh [--full]" ;;
esac

require_docker
require_cli

if supabase_running; then
  ok "Supabase is already running."
  if [ "$mode" = "full" ] && ! docker ps --format '{{.Names}}' | grep -qx "supabase_studio_$(project_id)"; then
    warn "Studio is not running because Supabase was started in lightweight mode."
    warn "To switch: 'npm run db:stop' and then 'npm run db:start:full' (your data is kept)."
  fi
else
  if [ "$mode" = "full" ]; then
    say "Starting the full local Supabase stack, including Studio. The first run downloads several images and can take a few minutes..."
    npx supabase start
  else
    say "Starting local Supabase (skipping the optional services: $LIGHT_EXCLUDES)."
    say "The first run downloads the Docker images and can take a few minutes..."
    npx supabase start -x "$LIGHT_EXCLUDES"
  fi
  ok "Supabase is running."
fi

print_local_urls
