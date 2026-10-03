// Satisfaction numbers per face (plan 10판 §5·§12) for the owners' nightly mail — counts only, never content.
// usage_events only knows the one-way member ref (lib/privacy.ts ref), so we compute each member's ref here and group by face.
import { q } from "./db";
import { ref } from "./privacy";

export type FaceRow = { face: string; members: number; onboarded: number; firstAutoMin: number | null; auto10: string; back7: string; noteOff: number };

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };

/** Pure: rows from members and their events (tested). */
export function faceRows(
  members: { id: string; face: string | null; created: number; onboarded: number | null; noteLevel: number }[],
  events: Map<string, { kind: string; at: number }[]>,
  now: number,
): FaceRow[] {
  const DAY = 86_400_000;
  const groups = new Map<string, typeof members>();
  for (const m of members) { const f = m.face ?? "(not yet)"; groups.set(f, [...(groups.get(f) ?? []), m]); }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([face, ms]) => {
    const firstAuto: number[] = [];
    let due = 0, back = 0;
    for (const m of ms) {
      const ev = events.get(m.id) ?? [];
      const auto = ev.filter((e) => e.kind.startsWith("automation_")).map((e) => e.at).sort((a, b) => a - b)[0];
      if (auto !== undefined) firstAuto.push(Math.round((auto - m.created) / 60_000));
      if (m.onboarded && now - m.onboarded >= 14 * DAY) {             // came back in days 7–14 after the first chat?
        due++;
        if (ev.some((e) => e.kind === "turn" && e.at >= m.onboarded! + 7 * DAY && e.at < m.onboarded! + 14 * DAY)) back++;
      }
    }
    const onboarded = ms.filter((m) => m.onboarded).length;
    // Marketing plan v2 (2026-09-30): a trial only works if something runs on day one — share switched on within 10 minutes of signing up.
    const in10 = firstAuto.filter((min) => min <= 10).length;
    return { face, members: ms.length, onboarded, firstAutoMin: median(firstAuto), auto10: `${in10}/${ms.length} (${Math.round((in10 / ms.length) * 100)}%)`, back7: due ? `${back}/${due} (${Math.round((back / due) * 100)}%)` : "—",
      noteOff: ms.filter((m) => m.onboarded && m.noteLevel === 0).length };
  });
}

export async function faceReport(now = Date.now()): Promise<FaceRow[]> {
  const members = (await q<{ id: string; face: string | null; created_at: string; onboarded_at: string | null; nudge_level: number }>(
    "select id, face, created_at, onboarded_at, nudge_level from users")).map((u) => ({ id: u.id, face: u.face, created: Date.parse(u.created_at), onboarded: u.onboarded_at ? Date.parse(u.onboarded_at) : null, noteLevel: u.nudge_level }));
  const byRef = new Map(members.map((m) => [ref(m.id), m.id]));
  const rows = await q<{ user_ref: string; kind: string; created_at: string }>(
    "select user_ref, kind, created_at from usage_events where created_at > now() - interval '60 days' and (kind = 'turn' or kind like 'automation_%')");
  const events = new Map<string, { kind: string; at: number }[]>();
  for (const r of rows) { const id = byRef.get(r.user_ref); if (id) events.set(id, [...(events.get(id) ?? []), { kind: r.kind, at: Date.parse(r.created_at) }]); }
  return faceRows(members, events, now);
}

export function faceTable(rows: FaceRow[]): string {
  if (!rows.length) return "";
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `<h4>By face</h4><table cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr><th align="left">Face</th><th>Members</th><th>Finished first chat</th><th>First automation (median min)</th><th>Automation within 10 min</th><th>Back after 7 days</th><th>Turned daily note off</th></tr>${
    rows.map((r) => `<tr><td>${esc(r.face)}</td><td align="right">${r.members}</td><td align="right">${r.onboarded}</td><td align="right">${r.firstAutoMin ?? "—"}</td><td align="right">${esc(r.auto10)}</td><td align="right">${esc(r.back7)}</td><td align="right">${r.noteOff}</td></tr>`).join("")}</table>`;
}

// Growth scoreboard (plan 11판 §13 C): the one number everyone is graded on — people who really used Unchore this week —
// plus friend-link signups and where new members came from. Test accounts are left out. Counts only, never content.
export type Growth = { wau: number; signups7: number; friends7: number; bySource: Record<string, number> };

/** Pure: one line for the owners' nightly mail (tested). */
export function growthLine(g: Growth): string {
  const src = Object.entries(g.bySource).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ") || "—";
  return `Growth (7 days, real members): used Unchore ${g.wau} · new ${g.signups7} · from a friend's link ${g.friends7} · came from: ${src}`;
}

export async function growthNumbers(): Promise<Growth> {
  const real = "u.email !~* 'smoke|test|@unchore\\.ai$|example\\.'";
  const [w, s, f, by] = await Promise.all([
    q<{ n: number }>(`select count(distinct c.user_id)::int as n from messages m join conversations c on c.id = m.conversation_id join users u on u.id = c.user_id where ${real} and m.role = 'user' and m.created_at > now() - interval '7 days'`),
    q<{ n: number }>(`select count(*)::int as n from users u where ${real} and u.created_at > now() - interval '7 days'`),
    q<{ n: number }>(`select count(*)::int as n from users u where ${real} and u.ref_by is not null and u.created_at > now() - interval '7 days'`),
    q<{ s: string; n: number }>(`select coalesce(split_part(u.source, '/', 1), 'unknown') as s, count(*)::int as n from users u where ${real} and u.created_at > now() - interval '7 days' group by 1`),
  ]);
  return { wau: w[0]?.n ?? 0, signups7: s[0]?.n ?? 0, friends7: f[0]?.n ?? 0, bySource: Object.fromEntries(by.map((r) => [r.s, r.n])) };
}
