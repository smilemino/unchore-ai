"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import { createContext, memo, useContext, useState } from "react";
import { htmlDoc, isPreviewable, previewVersions } from "@/lib/previews";
import { useT } from "./I18n";

export function CopyBtn({ text, label, done, className }: { text: string; label: string; done: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      className={className ?? "absolute right-2 top-2 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-fg-2 hover:bg-hover"}>{ok ? done : label}</button>
  );
}

// remark-cjk-friendly: bold glued to a Korean/Japanese/Chinese particle («**done**로») still turns bold (ported from AI Soul).
export const MD_PLUGINS = [remarkGfm, remarkCjkFriendly];

const SMALL_BTN = "rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-fg-2 hover:bg-hover";
const BOX = { copy: /^(copy|복사)$/i, decide: /^(decide|decision|결정)$/i };

// ```copy → a paste-ready box with one Copy button · ```decide → a yellow «your decision» card (ported from AI Soul).
function MarkdownInner({ text, copyLabel = "Copy", copiedLabel = "Copied", decideLabel = "Your decision" }: { text: string; copyLabel?: string; copiedLabel?: string; decideLabel?: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={MD_PLUGINS} components={{
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
        // A wide table slides sideways inside its own box on a phone instead of stretching the whole answer (AI Soul table-scroll).
        table: ({ children }) => <div className="overflow-x-auto my-2" data-testid="table-scroll"><table>{children}</table></div>,
        pre: ({ children }) => {
          const el = children as { props?: { children?: unknown; className?: string } };
          const code = el?.props?.children;
          const body = (typeof code === "string" ? code : Array.isArray(code) ? code.join("") : "").replace(/\n$/, "");
          const lang = (el?.props?.className ?? "").replace(/^language-/, "");
          if (BOX.copy.test(lang)) return (
            <div className="box-copy"><div className="box-head"><span>📋 {copyLabel}</span><CopyBtn text={body} label={copyLabel} done={copiedLabel} className="rounded-md bg-ink text-on-ink px-2.5 py-0.5 text-xs" /></div><div className="box-body">{body}</div></div>
          );
          if (BOX.decide.test(lang)) return (
            <div className="box-decide"><div className="box-head" style={{ borderColor: "#eab308" }}><b>🟡 {decideLabel}</b></div><div className="box-body box-md"><MarkdownInner text={body} copyLabel={copyLabel} copiedLabel={copiedLabel} decideLabel={decideLabel} /></div></div>
          );
          // The code's language in the box's top-left (AI Soul Markdown.tsx code-lang) — room is made above the first line so it never covers code.
          const tag = lang ? <span data-testid="code-lang" className="pointer-events-none absolute left-3 top-1.5 select-none text-[11px] text-muted">{lang}</span> : null;
          const padTop = lang ? { paddingTop: "1.9em" } : undefined;
          // Copy and ▶ Preview side by side at the top — below a one-line block they'd sit on the answer's own buttons (live check 2026-09-30)
          if (isPreviewable(lang, body)) return <div className="relative">{tag}<pre style={padTop}>{children}</pre><div className="absolute right-2 top-2 flex gap-1"><CopyBtn text={body} label={copyLabel} done={copiedLabel} className={SMALL_BTN} /><PreviewBtn body={body} /></div></div>;
          return <div className="relative">{tag}<pre style={padTop}>{children}</pre>{body && <CopyBtn text={body} label={copyLabel} done={copiedLabel} />}</div>;
        },
      }}>{text}</ReactMarkdown>
    </div>
  );
}
export const Markdown = memo(MarkdownInner);

/** The chat's answers, so a preview can flip to the other pages made in the same chat (set by components/Chat.tsx). */
export const PreviewSet = createContext<string[]>([]);

// «▶ Preview» under an html block — a sealed box (lib/previews.ts): scripts run inside, but it can't touch this page or the internet.
function PreviewBtn({ body: clicked }: { body: string }) {
  const t = useT();
  const answers = useContext(PreviewSet);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<number | null>(null);   // null = the one that was clicked
  const { list, start } = previewVersions(answers, clicked);
  const idx = Math.min(at ?? start, list.length - 1), body = list[idx] ?? clicked;
  const save = () => {
    const url = URL.createObjectURL(new Blob([body], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "preview.html"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <button type="button" onClick={() => { setAt(null); setOpen(true); }} className={SMALL_BTN} data-testid="preview-open">▶ {t("Preview")}</button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex md:p-6" onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div className="flex-1 flex flex-col bg-surface md:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="preview-pane">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line-soft pt-[max(0.5rem,env(safe-area-inset-top))]">
              <span className="flex-1 truncate font-medium">▶ {t("Preview")}</span>
              {list.length > 1 ? (
                <span className="flex items-center gap-1 text-sm text-muted" data-testid="preview-versions">
                  <button type="button" className="rounded px-1.5 hover:bg-hover disabled:opacity-30" disabled={idx === 0} onClick={() => setAt(idx - 1)} aria-label={t("Previous version")} data-testid="preview-prev">◀</button>
                  <span data-testid="preview-version">{idx + 1}/{list.length}</span>
                  <button type="button" className="rounded px-1.5 hover:bg-hover disabled:opacity-30" disabled={idx === list.length - 1} onClick={() => setAt(idx + 1)} aria-label={t("Next version")} data-testid="preview-next">▶</button>
                </span>
              ) : null}
              <CopyBtn text={body} label={t("Copy")} done={t("Copied")} className={SMALL_BTN} />
              <span className="hidden md:inline text-xs text-muted">{t("Runs sealed off — it can't reach this page or the internet")}</span>
              <button type="button" onClick={save} className="rounded-md border border-line px-2 py-0.5 text-xs hover:bg-hover">⬇ {t("Download")}</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-0.5 text-sm hover:bg-hover" aria-label={t("Close")}>✕</button>
            </div>
            <iframe title={t("Preview")} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={htmlDoc(body)} className="flex-1 w-full bg-white" />
          </div>
        </div>
      ) : null}
    </>
  );
}

// «⤢ Preview: Table / Document» under an answer with a table or a long document (AI Soul components/Preview.tsx markdown pane):
// the answer opens on its own page-sized sheet, with Copy and a .md download.
export function DocPreviewBtn({ text, kind, className }: { text: string; kind: "Table" | "Document"; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const name = kind === "Table" ? t("Table") : t("Document");   // literal keys, so the translation script finds them
  const save = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name}.md`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} data-testid="doc-preview-open">⤢ {t("Preview")}: {name}</button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex md:p-6" onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div className="flex-1 flex flex-col bg-surface md:rounded-2xl overflow-hidden text-fg text-base" onClick={(e) => e.stopPropagation()} data-testid="doc-preview-pane">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line-soft pt-[max(0.5rem,env(safe-area-inset-top))]">
              <span className="flex-1 truncate font-medium">⤢ {t("Preview")}: {name}</span>
              <CopyBtn text={text} label={t("Copy")} done={t("Copied")} className={SMALL_BTN} />
              <button type="button" onClick={save} className={SMALL_BTN} data-testid="doc-preview-download">⬇ {t("Download")} (.md)</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-0.5 text-sm hover:bg-hover" aria-label={t("Close")}>✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4 md:px-8"><Markdown text={text} copyLabel={t("Copy")} copiedLabel={t("Copied")} decideLabel={t("Your decision")} /></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
