import { isResp, requireUser } from "@/lib/api";
import { appUrl } from "@/lib/app-url";
import { loadNotes, vaultZip } from "@/lib/notes";

// «Download for Obsidian»: the notebook as a folder of Markdown notes (unzip into a vault, or open the folder as one).
export async function GET(req: Request) {
  const u = await requireUser();
  if (isResp(u)) return u;
  const zip = vaultZip(await loadNotes(u.id, 5000), { appUrl: appUrl(req), tz: u.tz });
  return new Response(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="unchore-notes-${new Date().toISOString().slice(0, 10)}.zip"` } });
}
