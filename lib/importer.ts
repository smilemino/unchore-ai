// Bring chats over from ChatGPT or Claude exports (conversations.json, or the export ZIP as downloaded). Ported from AI Soul lib/claude-import.ts.
import { unzipSync } from "fflate";

/** Largest conversations.json we unpack (after unzipping). */
export const IMPORT_MAX_BYTES = 50 * 1024 * 1024;

/** A Claude chat's messages in reading order: from the last message back to the root along parent_message_uuid (edited
 *  questions and re-rolled answers are side branches — only the line the Claude app shows comes over), else by index, else as listed. */
export function claudeOrder(c: Record<string, unknown>): Record<string, unknown>[] {
  const all = Array.isArray(c.chat_messages) ? (c.chat_messages as Record<string, unknown>[]) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const m of all) if (typeof m.uuid === "string") byId.set(m.uuid, m);
  const hasParents = all.some((m) => typeof m.parent_message_uuid === "string");
  let leaf = typeof c.current_leaf_message_uuid === "string" ? byId.get(c.current_leaf_message_uuid) : undefined;
  if (!leaf && hasParents) {
    const parents = new Set(all.map((m) => m.parent_message_uuid).filter((x): x is string => typeof x === "string"));
    leaf = all.filter((m) => typeof m.uuid === "string" && !parents.has(m.uuid as string))
      .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || Number(a.index ?? 0) - Number(b.index ?? 0)).at(-1);
  }
  if (leaf && hasParents) {
    const chain: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (let cur: Record<string, unknown> | undefined = leaf; cur && typeof cur.uuid === "string" && !seen.has(cur.uuid); cur = typeof cur.parent_message_uuid === "string" ? byId.get(cur.parent_message_uuid) : undefined) {
      seen.add(cur.uuid); chain.push(cur);
    }
    return chain.reverse();
  }
  if (all.every((m) => typeof m.index === "number")) return [...all].sort((a, b) => (a.index as number) - (b.index as number));
  return all;
}

/** Uploaded file → parsed JSON. A ZIP is opened and its conversations.json (in any folder) is read; the size cap applies after unzipping. */
export function readExportFile(buf: Uint8Array): { json: unknown } | { error: "not_zip_export" | "too_big" | "not_json"; status: number } {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  let raw: Uint8Array = buf;
  if (isZip) {
    let tooBig = false;
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(buf, { filter: (f) => {
        if (!/(^|\/)conversations\.json$/.test(f.name)) return false;
        if (f.originalSize > IMPORT_MAX_BYTES) { tooBig = true; return false; }
        return true;
      } });
    } catch { return { error: "not_zip_export", status: 400 }; }
    if (tooBig) return { error: "too_big", status: 413 };
    const key = Object.keys(files)[0];
    if (!key) return { error: "not_zip_export", status: 422 };
    raw = files[key]!;
  } else if (buf.length > IMPORT_MAX_BYTES) return { error: "too_big", status: 413 };
  try { return { json: JSON.parse(Buffer.from(raw).toString("utf8")) }; } catch { return { error: "not_json", status: 400 }; }
}
export type Imported = { uuid: string | null; title: string; created: string | null; messages: { role: "user" | "assistant"; content: string }[] };

type GptNode = { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number | null } | null; parent?: string | null; children?: string[] };

export function parseExport(raw: unknown): Imported[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Imported[] = [];
  for (const c of arr as Record<string, unknown>[]) {
    if (!c || typeof c !== "object") continue;
    // Claude: {name, created_at, chat_messages:[{sender:"human"|"assistant", text}]}
    if (Array.isArray(c.chat_messages)) {
      const messages = (claudeOrder(c) as { sender?: string; text?: string; content?: { text?: string }[] }[])
        .map((m) => ({ role: m.sender === "human" ? "user" as const : "assistant" as const, content: (m.text || (m.content ?? []).map((x) => x.text ?? "").join("\n")).trim() }))
        .filter((m) => m.content);
      if (messages.length) out.push({ uuid: typeof c.uuid === "string" && c.uuid ? `claude:${c.uuid}` : null, title: String(c.name || messages[0]!.content.slice(0, 60)), created: typeof c.created_at === "string" ? c.created_at : null, messages });
      continue;
    }
    // ChatGPT: {title, create_time, mapping:{id:{message, parent, children}}, current_node}
    if (c.mapping && typeof c.mapping === "object") {
      const map = c.mapping as Record<string, GptNode>;
      let id = typeof c.current_node === "string" ? c.current_node : null;
      const chain: GptNode[] = [];
      for (let guard = 0; id && map[id] && guard < 5000; guard++) { chain.push(map[id]!); id = map[id]!.parent ?? null; }
      const messages = chain.reverse().flatMap((n) => {
        const role = n.message?.author?.role;
        const text = (n.message?.content?.parts ?? []).filter((p): p is string => typeof p === "string").join("\n").trim();
        return (role === "user" || role === "assistant") && text ? [{ role: role as "user" | "assistant", content: text }] : [];
      });
      const gid = typeof c.conversation_id === "string" && c.conversation_id ? c.conversation_id : typeof c.id === "string" && c.id ? c.id : null;
      if (messages.length) out.push({ uuid: gid ? `chatgpt:${gid}` : null, title: String(c.title || messages[0]!.content.slice(0, 60)), created: typeof c.create_time === "number" ? new Date(c.create_time * 1000).toISOString() : null, messages });
    }
  }
  return out;
}

/** Chats not brought over before (by the export's own id — db/migrations/046), up to `max` per upload. The same file uploaded
 *  again adds nothing twice; a big export comes over `max` chats at a time, each upload picking up where the last stopped. */
export function newChats(chats: Imported[], known: Set<string>, max: number): { pick: Imported[]; skipped: number; more: number } {
  const seen = new Set(known);
  const fresh = chats.filter((c) => !c.uuid || (!seen.has(c.uuid) && !!seen.add(c.uuid)));
  return { pick: fresh.slice(0, max), skipped: chats.length - fresh.length, more: Math.max(0, fresh.length - max) };
}
