#!/usr/bin/env bash
# Run the whole system in Docker: the local Supabase stack (started by the
# Supabase CLI) plus the Next.js app built from the Dockerfile.
#
#   npm run docker:up       build + start (http://localhost:3000/oceana-gardens)
#   npm run docker:down     stop the app container (Supabase keeps running)
#
# The app container uses host networking so that the browser and the Next.js
# server reach Supabase at the same address (http://127.0.0.1:54321). See the
# comments in docker-compose.yml for macOS/Windows.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

require_docker
docker compose version >/dev/null 2>&1 \
  || die "'docker compose' is not available. Install Docker Compose v2 (it ships with Docker Desktop)."

case "$(uname -s)" in
  Linux) ;;
  *)
    warn "You are not on Linux. The app container needs host networking:"
    warn "  Docker Desktop 4.34+ > Settings > Resources > Network > 'Enable host networking', then restart Docker."
    warn "  If that is not possible, use 'npm run db:start' + 'npm run dev' instead."
    ;;
esac

bash scripts/db-start.sh

say "Checking .env.docker (settings for the app container)..."
ensure_env_file .env.docker .env.docker.example

if port_in_use 3000 && [ -z "$(docker compose ps --status running -q web 2>/dev/null || true)" ]; then
  die "Port 3000 is already in use (is 'npm run dev' still running?). Stop it and try again."
fi

say "Building and starting the app container (the first build takes a few minutes)..."
docker compose --env-file .env.docker up --build -d

say "Waiting for the app to answer on http://localhost:3000 ..."
for _ in $(seq 1 60); do
  if port_in_use 3000; then
    ok "The app is running."
    cat <<EOF

  Open ${C_BOLD}http://localhost:3000/oceana-gardens${C_RESET} and sign in with admin@oceanagardens.test / Password123!

  Logs:        docker compose logs -f web
  Stop app:    npm run docker:down
  Stop Supabase too:  npm run db:stop
EOF
    exit 0
  fi
  sleep 2
done

warn "The app did not answer within 2 minutes. Check the logs with: docker compose logs web"
exit 1
