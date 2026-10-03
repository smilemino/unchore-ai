// When a plan's limit lifts, read from the AI company's own words (AI Soul lib/limit-proof.ts parseResetAt):
// «resets 3:10am (Asia/Seoul)» · «resets Oct 5, 12pm (UTC)» → the moment as ISO, so the member is told the exact time
// instead of «soon». Anything unreadable, past or more than 8 days away reads as null (the old «resets soon» line stays).
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MAX_MS = 8 * 86_400_000;

function tzOffsetMs(tz, at) {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    if (s === "GMT") return 0;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(s);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600_000 + Number(m[3]) * 60_000) : null;
  } catch { return null; }
}

export function parseResetAt(text, now = Date.now()) {
  const m = /resets\s+(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?:\s*\(([^)]+)\))?/i.exec(String(text ?? ""));
  if (!m) return null;
  const off = tzOffsetMs(m[6]?.trim() || "UTC", new Date(now));
  if (off === null) return null;
  let h = Number(m[3]) % 12; if (m[5].toLowerCase() === "pm") h += 12;
  const min = Number(m[4] ?? 0);
  const local = new Date(now + off);
  let y = local.getUTCFullYear(), mo = local.getUTCMonth(), d = local.getUTCDate();
  const monIdx = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (m[1] && monIdx < 0) return null;
  if (monIdx >= 0) { mo = monIdx; d = Number(m[2]); }
  let t = Date.UTC(y, mo, d, h, min) - off;
  if (monIdx >= 0) { if (t < now - 86_400_000) { y += 1; t = Date.UTC(y, mo, d, h, min) - off; } }
  else if (t <= now) t += 86_400_000;
  return t > now && t - now <= MAX_MS ? new Date(t).toISOString() : null;
}
