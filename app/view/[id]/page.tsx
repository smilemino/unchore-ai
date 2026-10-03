// Excel · Word · PowerPoint preview in a new tab — the chat stays where it was (AI Soul app/view/[id], 10/3 owner «yes»).
// Only the member's own file (lib/office-view.ts); file text is shown as plain text, never run as HTML.
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { trFor } from "@/lib/i18n-server";
import { loadPreview } from "@/lib/office-view";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function View({ params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const t = trFor(u.lang);
  const { id } = await params;
  const p = await loadPreview(u.id, id);
  if (!p) return <main className="mx-auto max-w-3xl p-6 text-sm" data-testid="file-view-missing">{t("This file isn't here, or it isn't yours.")} <Link href="/app" className="underline">{t("Back to chats")}</Link></main>;
  const download = <a href={`/api/files/${id}`} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs hover:bg-hover" data-testid="file-view-download">⬇ {t("Download original")}</a>;
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6" data-testid="file-view">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold" title={p.name}>📄 {p.name} <span className="text-xs font-normal text-muted">{kb(p.size)}</span></h1>
        {download}
      </header>
      {(p.kind === "docx" || p.kind === "pptx") && <p className="mb-3 text-xs text-muted">{t("Only the words are shown — fonts, layout and pictures may differ from the original.")}</p>}
      {p.kind === "none" && <p className="text-sm">{t("This kind of file has no preview. Download it to open.")}</p>}
      {p.kind === "too_big" && <p className="text-sm">{t("This file is too big to preview. Download it to open.")}</p>}
      {p.kind === "broken" && <p className="text-sm">{t("This file couldn't be read for a preview. Download it to open.")}</p>}
      {p.kind === "xlsx" && p.sheets.map((s, i) => (
        <section key={i} className="mb-6" data-testid="file-view-sheet">
          <h2 className="mb-2 text-sm font-semibold">{s.name || t("Sheet {n}", { n: i + 1 })}</h2>
          {s.rows.length ? <div className="overflow-auto rounded-lg border border-line"><table className="text-xs"><tbody>
            {s.rows.map((r, j) => <tr key={j} className="border-b border-line last:border-0">{r.map((c, k) => <td key={k} className="whitespace-pre-wrap border-r border-line px-2 py-1 align-top last:border-0">{c}</td>)}</tr>)}
          </tbody></table></div> : <p className="text-xs text-muted">{t("(empty)")}</p>}
          {s.cut && <p className="mt-1 text-xs text-muted">{t("Only the first part is shown. Download the file to see all of it.")}</p>}
        </section>
      ))}
      {p.kind === "docx" && <article className="space-y-2 text-sm leading-relaxed">{p.paragraphs.length ? p.paragraphs.map((x, i) => <p key={i} className="whitespace-pre-wrap">{x}</p>) : <p className="text-muted">{t("(empty)")}</p>}</article>}
      {p.kind === "pptx" && p.slides.map((lines, i) => (
        <section key={i} className="mb-4 rounded-lg border border-line bg-surface p-4" data-testid="file-view-slide">
          <h2 className="mb-2 text-xs font-semibold text-muted">{t("Slide {n}", { n: i + 1 })}</h2>
          {lines.length ? lines.map((x, j) => <p key={j} className={`whitespace-pre-wrap ${j === 0 ? "text-base font-semibold" : "text-sm"}`}>{x}</p>) : <p className="text-xs text-muted">{t("(empty)")}</p>}
        </section>
      ))}
    </main>
  );
}
