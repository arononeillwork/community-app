#!/usr/bin/env bash
# First-time setup: install packages, start local Supabase, load the schema and
# the sample data (Oceana Gardens + Demo Heights), and create .env.local.
#
#   npm run setup                 asks before resetting an existing database
#   SETUP_YES=1 npm run setup     no questions (for scripts/CI)
#   SETUP_SKIP_RESET=1 npm run setup   keep the current database contents
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/lib.sh

say "Checking what's installed..."
check_node
command -v npm >/dev/null 2>&1 || die "npm is not installed (it comes with Node.js)."
require_docker
ok "Docker is running"

say "Installing packages (npm install)..."
npm install --no-audit --no-fund
ok "Packages installed"

bash scripts/db-start.sh

say "Checking .env.local (the app's local settings)..."
ensure_env_file .env.local .env.example

if [ "${SETUP_SKIP_RESET:-0}" = "1" ]; then
  warn "Skipping the database reset (SETUP_SKIP_RESET=1)."
else
  reset="yes"
  if [ "${SETUP_YES:-0}" != "1" ] && [ -t 0 ]; then
    printf '\nThis will reset your LOCAL database to the sample data (anything you added locally is removed).\n'
    printf 'Continue? [Y/n] '
    read -r answer || answer=""
    case "$answer" in
      n|N|no|NO|No) reset="no" ;;
    esac
  fi
  if [ "$reset" = "yes" ]; then
    say "Loading the database schema and sample data (npx supabase db reset)..."
    npx supabase db reset --yes
    ok "Database ready with the sample communities"
  else
    warn "Database reset skipped. Run 'npm run db:reset' later to load the sample data."
  fi
fi

cat <<EOF

${C_GREEN}${C_BOLD}All set!${C_RESET}

  1. Start the app:     ${C_BOLD}npm run dev${C_RESET}
  2. Open:              ${C_BOLD}http://localhost:3000/oceana-gardens${C_RESET}
  3. Sign in with:      admin@oceanagardens.test  /  Password123!
     (more test accounts are listed in README.md)

  Emails (magic links, invites) arrive in Mailpit: http://127.0.0.1:54324
  Stop Supabase when you're done:  npm run db:stop
EOF
