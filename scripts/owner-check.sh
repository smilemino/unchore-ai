#!/usr/bin/env bash
# Unchore's full check — the same one every change passes before it ships (owner 2026-10-03: «my Unchore account must be able to
# improve Unchore the way AI Soul improves itself»). Runs on the owner's own computer (lib/tools/computer.ts) or any Linux box:
# install → translations → lint → types → every test with a throwaway database → build. Nothing is skipped; a red step stops.
#   bash scripts/owner-check.sh            (I18N_OPENROUTER_KEY or OPENROUTER_API_KEY set → missing translations are filled first)
# Exit codes: 7 install · 9 no database · 10 translations · 11 lint · 12 types · 13 tests · 14 build.
set -o pipefail
cd "$(dirname "$0")/.." || exit 2
step() { echo "== $1 ($(date +%H:%M:%S))"; }

step install
if ! command -v pnpm >/dev/null; then corepack enable >/dev/null 2>&1 || sudo corepack enable >/dev/null 2>&1 || sudo npm i -g pnpm@12.5.1 >/dev/null 2>&1; fi
pnpm install --frozen-lockfile --prefer-offline >/tmp/uc-check-install.log 2>&1 || { tail -20 /tmp/uc-check-install.log; exit 7; }

step translations
export I18N_OPENROUTER_KEY="${I18N_OPENROUTER_KEY:-$OPENROUTER_API_KEY}"
if [ -n "$I18N_OPENROUTER_KEY" ] || command -v claude >/dev/null; then node scripts/i18n.mjs auto || exit 10; fi
node scripts/i18n.mjs check || exit 10

step lint; pnpm lint || exit 11
step types; pnpm typecheck || exit 12

step "test database"
pgbin() { for d in /usr/lib/postgresql/*/bin /usr/pgsql-*/bin /usr/bin /usr/local/bin; do [ -x "$d/initdb" ] && { echo "$d"; return; }; done; }
B=$(pgbin)
if [ -z "$B" ]; then
  if command -v apt-get >/dev/null; then sudo apt-get update -qq >/dev/null 2>&1; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql >/dev/null 2>&1
  elif command -v dnf >/dev/null; then sudo dnf install -y -q postgresql16-server >/dev/null 2>&1 || sudo dnf install -y -q postgresql-server >/dev/null 2>&1; fi
  B=$(pgbin)
fi
[ -n "$B" ] || { echo "No PostgreSQL here and it couldn't be installed."; exit 9; }
D=$(mktemp -d /tmp/uc-pg.XXXXXX); PORT=$((5600 + RANDOM % 300))
if [ "$(id -u)" = 0 ]; then chown postgres "$D"; as() { su postgres -c "$1"; }; else as() { bash -c "$1"; }; fi
as "LANG=C.UTF-8 $B/initdb -D $D/data -A trust -U postgres >/dev/null" || exit 9
as "$B/pg_ctl -D $D/data -o '-p $PORT -k $D' -l $D/log start -w >/dev/null" || { tail -5 "$D/log"; exit 9; }
stop_db() { as "$B/pg_ctl -D $D/data stop -m fast >/dev/null" 2>/dev/null; rm -rf "$D"; }
trap stop_db EXIT

step tests
TEST_DATABASE_URL="postgres://postgres@localhost:$PORT/postgres" TZ=UTC pnpm test --maxWorkers="${UC_TEST_WORKERS:-2}" || exit 13

step build
rm -rf .next; pnpm build >/tmp/uc-check-build.log 2>&1 || { tail -30 /tmp/uc-check-build.log; exit 14; }
echo "ALL CHECKS PASSED"
