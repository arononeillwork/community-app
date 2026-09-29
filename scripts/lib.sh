#!/usr/bin/env bash
# Shared helpers for the scripts in this folder. Source it, don't run it:
#   . "$(dirname "$0")/lib.sh"
# Every script cds to the project root first, so paths below are relative to it.

# ----------------------------------------------------------------- messages
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_RESET=$'\033[0m'
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

say()  { printf '%s==>%s %s\n' "$C_BOLD" "$C_RESET" "$*"; }
ok()   { printf '%s ok%s  %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%swarning:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

# ----------------------------------------------------------------- project
# The Supabase CLI names its containers supabase_<service>_<project_id>.
project_id() {
  local id
  id="$(sed -n 's/^project_id[[:space:]]*=[[:space:]]*"\(.*\)"[[:space:]]*$/\1/p' supabase/config.toml 2>/dev/null | head -n 1)"
  printf '%s' "${id:-community-app}"
}

db_container() { printf 'supabase_db_%s' "$(project_id)"; }

# Heavy optional services we skip by default (some images are also blocked by
# restrictive proxies). The app only needs Postgres, Auth, REST, Storage,
# Realtime, Kong and Mailpit.
LIGHT_EXCLUDES="vector,logflare,edge-runtime,imgproxy,studio,supavisor"

# ----------------------------------------------------------------- checks
require_docker() {
  command -v docker >/dev/null 2>&1 \
    || die "Docker is not installed. Install Docker Desktop (macOS/Windows) or Docker Engine (Linux): https://docs.docker.com/get-docker/"
  docker info >/dev/null 2>&1 \
    || die "Docker is installed but not running. Start Docker Desktop (or 'sudo systemctl start docker') and try again."
}

require_cli() {
  [ -x node_modules/.bin/supabase ] \
    || die "The Supabase CLI is not installed yet. Run 'npm install' (or 'npm run setup') first."
}

check_node() {
  command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install Node 22 LTS: https://nodejs.org/"
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 22 ]; then
    warn "You are using Node $(node --version). This project is built and tested with Node 22 — please upgrade if anything fails."
  else
    ok "Node $(node --version)"
  fi
}

# True when the local Supabase stack is up.
supabase_running() {
  npx supabase status >/dev/null 2>&1
}

# Print one value from `supabase status -o env` (e.g. ANON_KEY, API_URL).
supabase_env() {
  npx supabase status -o env 2>/dev/null | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -n 1
}

# True when something is listening on 127.0.0.1:<port>.
port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

# ----------------------------------------------------------------- env files
# Read KEY from an env file (no quotes handling beyond stripping one pair).
env_value() {
  sed -n "s/^$2=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" "$1" 2>/dev/null | head -n 1
}

# Replace KEY=... in FILE (or append it) with VALUE.
set_env_value() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

# Create FILE from EXAMPLE if missing, then copy the local Supabase URL and keys
# into it (they are printed by `supabase status`). Existing files are only checked.
ensure_env_file() {
  local file="$1" example="$2" api anon service
  if [ ! -f "$file" ]; then
    [ -f "$example" ] || die "$example is missing, so $file cannot be created."
    cp "$example" "$file"
    ok "Created $file from $example"
    if supabase_running; then
      api="$(supabase_env API_URL)"; anon="$(supabase_env ANON_KEY)"; service="$(supabase_env SERVICE_ROLE_KEY)"
      [ -n "$api" ] && set_env_value "$file" NEXT_PUBLIC_SUPABASE_URL "$api"
      [ -n "$anon" ] && set_env_value "$file" NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon"
      [ -n "$service" ] && set_env_value "$file" SUPABASE_SERVICE_ROLE_KEY "$service"
      ok "Filled $file with the keys of your local Supabase"
    fi
  else
    check_env_file "$file"
  fi
}

# Warn (never overwrite) when an existing env file points at different keys.
check_env_file() {
  local file="$1" anon
  supabase_running || return 0
  anon="$(supabase_env ANON_KEY)"
  if [ -n "$anon" ] && [ "$(env_value "$file" NEXT_PUBLIC_SUPABASE_ANON_KEY)" != "$anon" ]; then
    warn "$file has a different NEXT_PUBLIC_SUPABASE_ANON_KEY than your local Supabase. Run 'npx supabase status' and update it."
  else
    ok "$file matches your local Supabase"
  fi
}

# ----------------------------------------------------------------- output
print_local_urls() {
  cat <<EOF

  ${C_BOLD}Local addresses${C_RESET}
    App (after 'npm run dev')   http://localhost:3000/oceana-gardens
    Supabase API                http://127.0.0.1:54321
    Database                    postgresql://postgres:postgres@127.0.0.1:54322/postgres
    Mailpit (emails)            http://127.0.0.1:54324
    Studio (db:start:full only) http://127.0.0.1:54323

EOF
}
