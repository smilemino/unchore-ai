import { isResp, requireUser } from "@/lib/api";
import { q } from "@/lib/db";
import { loadNotes } from "@/lib/notes";
import { unlock } from "@/lib/privacy";

// Everything the user has, as one JSON download (files as names only — download them from the chat).
export async function GET() {
  const u = await requireUser();
  if (isResp(u)) return u;
  const [conversations, messages, projects, memories, automations, notes] = await Promise.all([
    q("select id, title, project_id, pinned, created_at, updated_at from conversations where user_id = $1 order by created_at", [u.id]),
    q("select m.conversation_id, m.role, m.content, m.model, m.created_at from messages m join conversations c on c.id = m.conversation_id where c.user_id = $1 order by m.created_at", [u.id]),
    q("select id, name, instructions from projects where user_id = $1", [u.id]),
    q("select text, created_at from memories where user_id = $1", [u.id]),
    q("select title, recipe, args, schedule, status, created_at from automations where user_id = $1", [u.id]),
    loadNotes(u.id, 5000),
  ]);
  const open = <T extends Record<string, unknown>>(rows: T[], k: keyof T) => rows.map((r) => ({ ...r, [k]: unlock(r[k] as string) }));
  const body = JSON.stringify({ exported_at: new Date().toISOString(), user: { email: u.email }, projects, conversations: open(conversations, "title"),
    messages: open(messages, "content"), memories: open(memories, "text"), automations, notes }, null, 1);
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="unchore-export-${new Date().toISOString().slice(0, 10)}.json"` } });
}
