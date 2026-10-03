import { vaultSecret } from "../vault";

// Pull-request review with the member's own GitHub connection (the GITHUB_TOKEN secret «Connect GitHub» saves — owner 2026-10-02
// «Unchore has to do what Claude Code and Codex do»). Reading is free and needs no computer; posting a review waits for the
// member's «yes» in this very message. The token never reaches the AI or the answer.

const API = "https://api.github.com";
const REPO = /^[\w.-]+\/[\w.-]+$/;
const DIFF_MAX = 60_000, FILE_MAX = 12_000;
const appBase = () => (process.env.APP_URL ?? "https://unchore.ai").replace(/\/$/, "");
export const CONNECT = () =>
  `GitHub isn't connected yet. Give the member this link to connect it in one tap (they press «Authorize» on GitHub, then come back and say done): ${appBase()}/api/connect/github/start`;

type Out = { ok: boolean; text: string };
type PrFile = { filename: string; status: string; additions: number; deletions: number; patch?: string };

async function gh(token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "unchore", ...(init.body ? { "content-type": "application/json" } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const why = (status: number, body: unknown) =>
  status === 404 ? "GitHub says it doesn't exist or this connection can't see it (a private repository of another account?)."
    : status === 401 ? "The GitHub connection has expired — ask the member to connect it again: " + CONNECT().split(": ").pop()
    : `GitHub answered ${status}${(body as { message?: string } | null)?.message ? `: ${(body as { message: string }).message}` : ""}.`;

/** Cut each file's diff and the whole to sizes an answer can hold, saying so. */
export function diffText(files: PrFile[]): string {
  let left = DIFF_MAX;
  const parts: string[] = [];
  for (const f of files) {
    const head = `### ${f.filename} (${f.status}, +${f.additions} −${f.deletions})`;
    let patch = f.patch ?? "(no text diff — binary or too large for GitHub to show)";
    if (patch.length > FILE_MAX) patch = `${patch.slice(0, FILE_MAX)}\n…(this file's diff is cut here)`;
    const block = `${head}\n\`\`\`diff\n${patch}\n\`\`\``;
    if (block.length > left) { parts.push(`…(${files.length - parts.length} more file(s) not shown — the diff is too long; ask about a file by name)`); break; }
    parts.push(block); left -= block.length;
  }
  return parts.join("\n\n");
}

export async function githubTool(ctx: { userId: string; yes: boolean }, a: Record<string, unknown>, token?: string | null): Promise<Out> {
  const action = String(a.action ?? "");
  const repo = String(a.repo ?? "").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  if (!REPO.test(repo)) return { ok: false, text: "Give the repository as owner/name (for example vercel/next.js)." };
  const t = token === undefined ? await vaultSecret(ctx.userId, "GITHUB_TOKEN") : token;
  if (!t) return { ok: false, text: CONNECT() };
  if (action === "prs") {
    const r = await gh(t, `/repos/${repo}/pulls?state=open&per_page=30`);
    if (r.status !== 200 || !Array.isArray(r.body)) return { ok: false, text: why(r.status, r.body) };
    const rows = (r.body as Array<{ number: number; title: string; user?: { login?: string }; draft?: boolean; updated_at: string }>)
      .map((p) => `#${p.number} ${p.title} — ${p.user?.login ?? "?"}${p.draft ? " (draft)" : ""} · updated ${p.updated_at.slice(0, 10)}`);
    return { ok: true, text: rows.length ? `Open pull requests in ${repo}:\n${rows.join("\n")}` : `${repo} has no open pull requests.` };
  }
  const n = Number(a.number);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, text: "Give the pull request number." };
  if (action === "pr") {
    const [p, f] = await Promise.all([gh(t, `/repos/${repo}/pulls/${n}`), gh(t, `/repos/${repo}/pulls/${n}/files?per_page=100`)]);
    if (p.status !== 200 || !p.body) return { ok: false, text: why(p.status, p.body) };
    const pr = p.body as { title: string; body: string | null; user?: { login?: string }; base?: { ref?: string }; head?: { ref?: string }; html_url: string; changed_files?: number };
    const files = Array.isArray(f.body) ? (f.body as PrFile[]) : [];
    return { ok: true, text: [`#${n} ${pr.title} — ${pr.user?.login ?? "?"} · ${pr.head?.ref ?? "?"} → ${pr.base?.ref ?? "?"} · ${pr.changed_files ?? files.length} file(s) · ${pr.html_url}`,
      pr.body ? `Description:\n${pr.body.slice(0, 3000)}` : "(no description)", diffText(files)].join("\n\n") };
  }
  if (action === "comment") {
    const body = String(a.body ?? "").trim();
    if (!body) return { ok: false, text: "Give the comment text." };
    if (!ctx.yes) return { ok: false, text: "Not posted: show the member the exact comment first and post it after they say «yes» in the chat." };
    const path = typeof a.path === "string" && a.path ? a.path : null, line = Number(a.line);
    // GitHub wants a review body with event COMMENT even when the words sit on a line, so the body then points to that line.
    const review = { event: "COMMENT", body: path && Number.isInteger(line) && line > 0 ? `Comment on ${path} line ${line}.` : body,
      ...(path && Number.isInteger(line) && line > 0 ? { comments: [{ path, line, side: "RIGHT", body }] } : {}) };
    const r = await gh(t, `/repos/${repo}/pulls/${n}/reviews`, { method: "POST", body: JSON.stringify(review) });
    if (r.status !== 200 && r.status !== 201) return { ok: false, text: why(r.status, r.body) };
    return { ok: true, text: `Posted on ${repo}#${n}: ${(r.body as { html_url?: string } | null)?.html_url ?? ""}` };
  }
  return { ok: false, text: `Unknown action «${action}» — use prs, pr or comment.` };
}
