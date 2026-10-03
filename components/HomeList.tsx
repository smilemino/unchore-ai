"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang, useT } from "./I18n";
import { ConvLink } from "./ConvLine";
import { LIST_EVENT, foldRows, listGroups, type ListRow, type ListShare } from "@/lib/conv-line";

// Phone first screen: a search box and the chat list (pinned · in progress · your turn · chats · done) under the greeting
// (AI Soul components/HomeList.tsx — «like the Claude app: ask box, then recent chats»). The left list (Shell) loads the rows
// and shares them (LIST_EVENT), so this asks the server only while searching. Rename / delete stay in the left list's «⋯».
export function HomeList() {
  const t = useT();
  const lang = useLang();
  const shared = useSyncExternalStore(
    (cb) => { window.addEventListener(LIST_EVENT, cb); return () => window.removeEventListener(LIST_EVENT, cb); },
    () => (window as unknown as { __ucList?: ListShare }).__ucList ?? null,
    () => null,
  );
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ term: string; rows: ListRow[] } | null>(null);   // the last search answer, for its own words
  const [doneOpen, setDoneOpen] = useState(false);
  const queryRef = useRef("");
  useEffect(() => {
    queryRef.current = query;
    const term = query.trim();
    if (!term) return;
    const id = setTimeout(() => {
      fetch(`/api/conversations?q=${encodeURIComponent(term)}`).then(async (r) => {
        if (r.ok && queryRef.current.trim() === term) setFound({ term, rows: (await r.json()) as ListRow[] });
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [query]);
  if (!shared) return null;
  const hits = found && found.term === query.trim() ? found.rows : null;   // null = still asking
  const rows = query.trim() ? hits ?? [] : shared.rows;
  if (!query.trim() && rows.length === 0) return null;   // a new member sees the greeting and picks only
  return (
    <div className="mt-6 text-left" data-testid="home-list">
      <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }} type="search" placeholder={t("Search chats (titles and text)")} aria-label={t("Search chats (titles and text)")} data-testid="home-search" className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
      {listGroups(rows, query, t).map((g) => {
        const f = foldRows(g, doneOpen, null);
        return (
          <div key={g.key}>
            <div className="px-1 text-xs text-subtle mt-3 mb-1" data-testid={`home-head-${g.key}`}>{g.head}</div>
            {f.rows.map((c) => <div key={c.id} className="flex items-center rounded-md hover:bg-sel" data-testid="home-row"><ConvLink c={c} lang={lang} tz={shared.tz} current={null} tagName={c.project_id ? shared.projects[c.project_id] ?? null : null} /></div>)}
            {f.hidden || (g.key === "done" && doneOpen && g.rows.length > 5) ? <button type="button" onClick={() => setDoneOpen(!!f.hidden)} className="w-full text-left px-3 py-1 text-xs text-subtle hover:bg-sel rounded-md" data-testid="home-more-done">{f.hidden ? t("{hidden} more", { hidden: f.hidden }) : t("Fold")}</button> : null}
          </div>
        );
      })}
      {query.trim() && hits?.length === 0 ? <div className="text-sm text-faint px-2 py-2" data-testid="home-empty">{t("No chat has those words")}</div> : null}
    </div>
  );
}
