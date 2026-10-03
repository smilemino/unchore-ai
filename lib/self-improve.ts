import { isOwnerEmail } from "./youtube-connect";

// Who may change Unchore itself (owner 2026-10-03: «my Unchore account must improve Unchore the way AI Soul improves itself;
// other members can't — except changing their own screen»).
// The owner: their AI works on Unchore's own code on the owner's computer (lib/tools/computer.ts) — branch, full check, and after
// the owner's «yes» ship to everyone (scripts/owner-ship.sh). Members: their own screen only (personal_ui); a wish for Unchore
// itself is passed on to the team — the «can't do» answer becomes an ability gap (lib/gaps.ts) that AI Soul's check builds.

export const REPO = "smilemino/unchore";

export const selfImproveGuide = (email: string) => [
  "## Improving Unchore itself (owner account)",
  "This member is Unchore's owner. When they ask to fix or improve Unchore — a feature, a screen, wording, a bug, speed — do it yourself on the computer tool, the way AI Soul's coding agent improves AI Soul. Never tell them to do the steps.",
  `1. Code: \`test -d unchore || git clone https://github.com/${REPO} unchore\`, then in it \`git fetch -q origin && git checkout -B owner/<short-name> origin/main\` and \`git config user.name smilemino && git config user.email ${email}\` (secrets: ["GITHUB_TOKEN"]). Read the code around the change before editing. Match the surrounding style; keep the change small.`,
  "2. Screen words are English in the code and go through t(); Korean is hand-written in lib/locales/ko.json; other languages are filled by the check. A new table goes in a new db/migrations/NNN_name.sql with the next free number.",
  '3. Check: `bash scripts/owner-check.sh` with background:true (secrets: ["OPENROUTER_API_KEY"]) — install, translations, lint, types, every test with a throwaway database, build; about 15 minutes. Read the log until «ALL CHECKS PASSED». A red step: fix the cause and run it again; never skip, weaken or delete a check or a test. Same error twice: stop and tell the owner what is wrong.',
  '4. Commit and push the branch (`git push -u origin HEAD`). Then tell the owner in plain words what members will see change, and ask one yes/no question: ship it to everyone now?',
  '5. After their «yes» in their next message: `bash scripts/owner-ship.sh` with background:true (secrets: ["GITHUB_TOKEN","OPENROUTER_API_KEY","UNCHORE_DATABASE_URL"]) — rebases on main, checks again, applies database changes, pushes main and waits until unchore.ai runs the new version («SHIPPED»). Report the version and what changed. If it says worker/ changed, say the answer worker still needs its redeploy.',
  "Members' data, money and other members' accounts are never changed this way — only Unchore's code.",
].join("\n");

export const MEMBER_SCOPE_GUIDE = [
  "## Changing Unchore",
  "This member can change their own Unchore screen (look, layout, their own widgets — the personal screen) but not Unchore itself: its features for everyone, its code, prices, rules or other members.",
  "If they ask for a change to Unchore itself, say in one line that you can't change Unchore for everyone, that the idea is passed on to the Unchore team, and offer what you can do on their own screen.",
].join("\n");

/** The guide for this member's answers: the owner's self-improvement steps when their computer is on, the member limit otherwise. */
export function changeGuide(email: string | null | undefined, computer: boolean): string {
  if (!isOwnerEmail(email)) return MEMBER_SCOPE_GUIDE;
  return computer ? selfImproveGuide(email ?? "") : "";
}

/** Secrets that reach Unchore's own database: only the ship script may receive them (lib/tools/computer.ts). */
export function shipOnlySecret(name: string, command: string): string | null {
  if (!/^UNCHORE_/.test(name)) return null;
  return /^(?:cd [^;&|]+ && )?bash scripts\/owner-ship\.sh\s*$/.test(command.trim()) ? null : `${name} is only given to «bash scripts/owner-ship.sh».`;
}
