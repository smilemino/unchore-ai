import { accessToken } from "./google-connect";

// Reading and doing things in the member's Google account (Calendar, Gmail, Drive). Reads feed the answer as data; sending a mail or
// adding an event only ever runs from /api/connect/google/act after the member's «Yes».
export class GoogleError extends Error { constructor(public status: number, public why: string) { super(why); } }

async function g<T>(userId: string, url: string, init: RequestInit = {}): Promise<T> {
  const tok = await accessToken(userId);
  if (!tok) throw new GoogleError(401, "not_connected");
  const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${tok}` } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new GoogleError(r.status, /has not been used|is disabled|SERVICE_DISABLED/.test(body) ? "api_off" : r.status === 403 ? "no_permission" : `http_${r.status}`);
  }
  return (r.status === 204 ? {} : await r.json()) as T;
}

type Ev = { summary?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
export async function calendarList(userId: string, fromIso: string, toIso: string, tz: string): Promise<string[]> {
  const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  u.search = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: "true", orderBy: "startTime", maxResults: "30", timeZone: tz }).toString();
  const r = await g<{ items?: Ev[] }>(userId, u.toString());
  const f = (x?: { dateTime?: string; date?: string }) => x?.dateTime ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(x.dateTime)) : x?.date ?? "";
  return (r.items ?? []).map((e) => `${f(e.start)} – ${f(e.end)} · ${e.summary ?? "(no title)"}${e.location ? ` @ ${e.location}` : ""}`);
}
export async function calendarAdd(userId: string, e: { title: string; start: string; end?: string; tz: string; where?: string; note?: string }): Promise<string> {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start);
  const end = e.end ?? (allDay ? e.start : new Date(Date.parse(e.start) + 3600_000).toISOString());
  const body = { summary: e.title, location: e.where, description: e.note,
    start: allDay ? { date: e.start } : { dateTime: e.start, timeZone: e.tz }, end: allDay ? { date: end } : { dateTime: end, timeZone: e.tz } };
  const r = await g<{ htmlLink?: string }>(userId, "https://www.googleapis.com/calendar/v3/calendars/primary/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.htmlLink ?? "";
}

// Mail is send-only (gmail.send): Unchore never reads the inbox — that scope is «restricted» (lib/google-connect.ts).
/** RFC 2822 mail, UTF-8 subject encoded so any language arrives intact. */
export function rawMail(to: string, subject: string, body: string): string {
  const subj = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  return Buffer.from(`To: ${to}\r\nSubject: ${subj}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}`, "utf8").toString("base64url");
}
export async function gmailSend(userId: string, m: { to: string; subject: string; body: string }): Promise<string> {
  const r = await g<{ id?: string }>(userId, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: rawMail(m.to, m.subject, m.body) }) });
  return r.id ?? "";
}

const EXPORT: Record<string, [string, string]> = {
  "application/vnd.google-apps.document": ["text/plain", ".txt"],
  "application/vnd.google-apps.spreadsheet": ["text/csv", ".csv"],
  "application/vnd.google-apps.presentation": ["text/plain", ".txt"],
};

/** A file the member picked (drive.file), streamed so a big file passes Vercel's 4.5 MB body limit. Google Docs/Sheets/Slides
 *  come out as text/CSV; anything else as it is. */
export async function driveDownload(userId: string, id: string): Promise<{ name: string; mime: string; size: number; body: ReadableStream<Uint8Array> }> {
  const meta = await g<{ name: string; mimeType: string; size?: string }>(userId, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType,size`);
  const exp = EXPORT[meta.mimeType];
  const tok = await accessToken(userId);
  const url = exp ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exp[0])}` : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok || !r.body) throw new GoogleError(r.status, `http_${r.status}`);
  return { name: exp ? `${meta.name}${exp[1]}` : meta.name, mime: exp ? exp[0] : meta.mimeType, size: Number(meta.size ?? 0), body: r.body };
}
export async function driveSearch(userId: string, text: string): Promise<string[]> {
  const safe = text.replace(/['\\]/g, " ").slice(0, 100);
  const r = await g<{ files?: { id: string; name: string; mimeType: string; modifiedTime: string }[] }>(userId,
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q: `(name contains '${safe}' or fullText contains '${safe}') and trashed = false`, pageSize: "10", fields: "files(id,name,mimeType,modifiedTime)", orderBy: "modifiedTime desc" })}`);
  return (r.files ?? []).map((f) => `[${f.id}] ${f.name} · ${f.mimeType.replace("application/vnd.google-apps.", "google ")} · ${f.modifiedTime.slice(0, 10)}`);
}
export async function driveRead(userId: string, id: string): Promise<string> {
  const meta = await g<{ name: string; mimeType: string }>(userId, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType`);
  const exp = meta.mimeType === "application/vnd.google-apps.document" ? "text/plain" : meta.mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv" : meta.mimeType === "application/vnd.google-apps.presentation" ? "text/plain" : null;
  const tok = await accessToken(userId);
  const url = exp ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exp)}` : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
  if (!exp && !/^text\/|json|csv|xml/.test(meta.mimeType)) return `${meta.name} (${meta.mimeType}) — not a text file, content not read`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new GoogleError(r.status, `http_${r.status}`);
  return `${meta.name}\n\n${(await r.text()).slice(0, 40_000)}`;
}
