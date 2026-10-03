#!/usr/bin/env bash
# Ship a change to everyone (owner account only, after the owner's «yes» in the chat — the computer tool sets UC_YES=1 only then).
# On the change's branch, committed: rebase on main → the full check (scripts/owner-check.sh) → database changes → push main
# (Vercel deploys main) → wait until unchore.ai answers with the new version. A red step stops before anything goes live.
#   bash scripts/owner-ship.sh      with the saved secrets UNCHORE_DATABASE_URL and OPENROUTER_API_KEY
# Exit codes: 3 no «yes» · 4 no database secret · 5 uncommitted work · 15 migration number taken twice · 16 rebase · 17 push ·
#             18/12 re-check after rebase · 19 database change failed · 21 not live in 15 min · others from owner-check.sh.
set -o pipefail
cd "$(dirname "$0")/.." || exit 2
[ "$UC_YES" = 1 ] || { echo "Shipping to every member needs the owner's «yes» in the chat first."; exit 3; }
[ -n "$UNCHORE_DATABASE_URL" ] || { echo "The saved secret UNCHORE_DATABASE_URL is missing."; exit 4; }
[ -z "$(git status --porcelain)" ] || { echo "Commit the change first:"; git status --short | head -20; exit 5; }
# A number taken twice only stops the ship when one of the files is new on this branch (two already on main both ran by name).
dup() { local mine; mine=$(git diff --name-only --diff-filter=A origin/main HEAD -- db/migrations | sed -n 's|^db/migrations/\([0-9]\{3\}\)_.*|\1|p'); for n in $(ls db/migrations | sed -n 's/^\([0-9]\{3\}\)_.*/\1/p' | sort | uniq -d); do echo "$mine" | grep -qx "$n" && echo "$n"; done; }

git fetch -q origin && git rebase -q origin/main || { git rebase --abort 2>/dev/null; exit 16; }
[ -z "$(dup)" ] || { echo "Migration number taken twice: $(dup) — renumber yours to the next free one."; exit 15; }
bash scripts/owner-check.sh || exit $?
git add -A lib/locales lib/words && git commit -q -m "Translations" || true
# main may have moved while the check ran: rebase again and re-check what a rebase can break
git fetch -q origin && git rebase -q origin/main || { git rebase --abort 2>/dev/null; exit 16; }
[ -z "$(dup)" ] || { echo "Migration number taken twice: $(dup)"; exit 15; }
node scripts/i18n.mjs check || exit 18
pnpm typecheck || exit 12
DATABASE_URL="$UNCHORE_DATABASE_URL" node scripts/migrate.mjs || exit 19
before=$(git rev-parse origin/main)
git push -q origin HEAD:main || exit 17
sha=$(git rev-parse HEAD | cut -c1-7)
echo "pushed main $sha"
for _ in $(seq 1 45); do
  curl -sf -m 10 https://unchore.ai/api/health | grep -q "\"version\":\"$sha\"" && { echo "LIVE $sha on unchore.ai"; break; }
  sleep 20
done
curl -sf -m 10 https://unchore.ai/api/health | grep -q "\"version\":\"$sha\"" || { echo "Not live after 15 minutes — look at the Vercel deployment."; exit 21; }
if [ -n "$(git diff --name-only "$before" HEAD -- worker/)" ]; then
  echo "NOTE: worker/ changed — the answer worker (Railway) runs the old worker until it is redeployed."
fi
echo "SHIPPED $sha"
