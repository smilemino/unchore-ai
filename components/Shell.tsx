"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { COPY_LAST_EVENT, SHORTCUT_LIST, menuKeyOf, shortcutOf } from "@/lib/shortcuts";
import type { Lang } from "@/lib/i18n";
import { useT } from "./I18n";
import { ProjectPick } from "./ProjectPick";
import { LIST_EVENT, dotState, foldRows, listGroups, projectColor, turnRows, type ListRow, type ListShare } from "@/lib/conv-line";
import { ConvLink } from "./ConvLine";
import { useStored } from "./useClient";
import { LogoMark } from "./LogoMark";
import { UndoBar, useDelayedDelete } from "./Undo";
import { seenToSend } from "@/lib/read-marks";
import { moveBefore } from "@/lib/drag-order";
import { useDragSort } from "./drag-sort";
import { MAIN_PATH, isAppPage, isMain, replaceOnNavigate } from "@/lib/back-nav";

// Same layout as AI Soul (components/Shell.tsx there · owner 2026-09-29 «make it look exactly like AI Soul»):
// left list = logo · ＋ New chat · search · rows with a status circle · projects (folded) · Settings / Automations;
// top of the page = «project / title ▾» on computers, ☰ · title · ＋ on phones.
type Conv = ListRow;
type Project = { id: string; name: string; instructions: string; chats: number; default_model?: string | null; archived?: boolean; files?: number };

export function Shell({ lang, tz, children }: { lang: Lang; tz: string; children: React.ReactNode }) {
  const t = useT();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);   // computer: chat list hidden with Ctrl/⌘+Shift+S (AI Soul Shell.tsx)
  const [help, setHelp] = useState(false);             // the shortcut table (Ctrl/⌘+/)
  const [menu, setMenu] = useState<string | null>(null);
  // «Continue in Telegram» in a chat's menu (AI Soul's title menu): shown once Telegram is linked in Settings; asked when a menu opens
  const [tg, setTg] = useState<{ linked: boolean; conversationId: string | null } | null>(null);
  useEffect(() => {
    if (!menu) return;
    let alive = true;
    void fetch("/api/settings/telegram").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.available) setTg({ linked: Boolean(j.linked), conversationId: j.conversationId ?? null }); }).catch(() => {});
    return () => { alive = false; };
  }, [menu]);
  async function continueInTelegram(id: string) {
    setMenu(null);
    const r = await fetch("/api/settings/telegram", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: id }) }).catch(() => null);
    if (r?.ok) setTg((x) => (x ? { ...x, conversationId: id } : x));
  }
  const [doneOpen, setDoneOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | "new" | null>(null);
  const [shownPref, setShownPref] = useStored("uc_projects_shown", "0");   // folded by default, like AI Soul
  const showProjects = shownPref === "1";
  const [archOpen, setArchOpen] = useState(false);
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setHelp(false); return; }
      const k = shortcutOf(e);
      if (!k) return;
      e.preventDefault();
      if (k === "search") { setCollapsed(false); setOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (k === "new") { setOpen(false); router.push("/app"); }
      else if (k === "toggle-list") { if (window.matchMedia("(min-width: 768px)").matches) setCollapsed((c) => !c); else setOpen((o) => !o); }
      else if (k === "help") setHelp((h) => !h);
      else window.dispatchEvent(new Event(COPY_LAST_EVENT));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  const cur = sp.get("c");
  const curProject = sp.get("p");
  const termRef = useRef("");
  const openRef = useRef<string | null>(null);   // the chat on screen counts as read (lib/read-marks.ts — kept on the server for every device)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<() => void>(() => {});
  const load = useCallback(() => {
    // A failed read (host hiccup) keeps the last list on screen and tries once more in 2s instead of waiting 20s (AI Soul components/Shell.tsx).
    const retry = () => { if (!retryRef.current) retryRef.current = setTimeout(() => { retryRef.current = null; loadRef.current(); }, 2_000); };
    const ok = (r: Response) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); };
    const qq = termRef.current.trim();
    fetch(`/api/conversations${qq ? `?q=${encodeURIComponent(qq)}` : ""}`).then(ok).then((rows: Conv[]) => {
      if (termRef.current.trim() !== qq) return;
      const seen = seenToSend(rows, openRef.current);
      if (seen) void fetch(`/api/conversations/${seen.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ seen: seen.seen }) }).catch(() => {});
      setConvs(seen ? rows.map((r) => (r.id === seen.id ? { ...r, seen_ai: seen.seen } : r)) : rows);
    }).catch(retry);
    fetch("/api/projects").then(ok).then(setProjects).catch(retry);
  }, []);
  useEffect(() => { loadRef.current = load; return () => { if (retryRef.current) clearTimeout(retryRef.current); retryRef.current = null; }; }, [load]);
  useEffect(() => { termRef.current = term; const id = setTimeout(load, 250); return () => clearTimeout(id); }, [term, load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener("uc:convs", on);
    const id = setInterval(load, 20_000);
    return () => { window.removeEventListener("uc:convs", on); clearInterval(id); };
  }, [load]);
  useEffect(() => { openRef.current = path === "/app" ? cur : null; if (cur) load(); }, [cur, path, load]);
  const busy = convs.some((c) => dotState(c) === "working" && c.last_role === "user");   // «⏳ In progress» waits outside — no fast refresh
  // «Your turn» count → the first screen's line (Chat TurnLine) and the app icon number (AI Soul lib/app-badge.ts). Search results are not the whole list.
  useEffect(() => {
    if (term.trim()) return;
    const waiting = turnRows(convs);
    const detail = { n: waiting.length, oldest: waiting[0]?.id ?? null };
    (window as unknown as { __ucTurn?: typeof detail }).__ucTurn = detail;
    window.dispatchEvent(new CustomEvent("uc:turn", { detail }));
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try { void (detail.n ? nav.setAppBadge?.(detail.n) : nav.clearAppBadge?.())?.catch(() => {}); } catch { /* no badge support */ }
  }, [convs, term]);
  // The phone first screen's list (components/HomeList.tsx) reads these rows instead of asking the server again. Search results are not the whole list.
  useEffect(() => {
    if (term.trim()) return;
    const detail: ListShare = { rows: convs, projects: Object.fromEntries(projects.map((p) => [p.id, p.name])), tz };
    (window as unknown as { __ucList?: ListShare }).__ucList = detail;
    window.dispatchEvent(new CustomEvent(LIST_EVENT, { detail }));
  }, [convs, projects, term, tz]);
  useEffect(() => { if (!busy) return; const id = setInterval(load, 6_000); return () => clearInterval(id); }, [busy, load]);
  const [where, setWhere] = useState(`${path}?${cur ?? ""}`);
  if (where !== `${path}?${cur ?? ""}`) { setWhere(`${path}?${cur ?? ""}`); setOpen(false); setMenu(null); }
  useEffect(() => {
    if (!menu) return;
    const f = () => setMenu(null);
    const id = setTimeout(() => window.addEventListener("click", f), 0);
    return () => { clearTimeout(id); window.removeEventListener("click", f); };
  }, [menu]);

  // Phone «back» = one step up to main (lib/back-nav, ported from AI Soul): app links are clicked in many files, so catch them here,
  // before Next's Link, and replace the history entry when leaving a screen that isn't main.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (!replaceOnNavigate(window.location, a.getAttribute("href") ?? "", window.location.origin)) return;
      e.preventDefault();
      const u = new URL(a.href);
      router.replace(u.pathname + u.search + u.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
  // Opened straight into a chat or Settings (a link, a notification)? Put main underneath once per tab, so back once lands on main.
  useEffect(() => {
    if (sessionStorage.getItem("uc_entered")) return;
    sessionStorage.setItem("uc_entered", "1");
    if (isMain(window.location.pathname, window.location.search) || !isAppPage(window.location.pathname)) return;
    const here = window.location.href, st = window.history.state;
    window.history.replaceState({ _N: 1 }, "", MAIN_PATH);   // no Next marker — coming back here loads main fresh
    window.history.pushState(st, "", here);
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setMenu(null); load();
  }
  // Delete = hide now, delete after 5 s unless «Undo» (components/Undo.tsx — replaces the confirm box, like AI Soul)
  const removal = useDelayedDelete(useCallback(() => load(), [load]));
  function del(id: string) {
    const c = convs.find((x) => x.id === id);
    setMenu(null);
    removal.schedule(`/api/conversations/${id}`, `${c?.title ? `«${c.title.slice(0, 20)}» ` : ""}${t("Chat deleted")}`);
    if (cur === id) router.push("/app");
  }
  const removing = removal.undo?.url.split("/").pop();
  const rename = (c: Conv) => { const n = prompt(t("Rename"), c.title); if (n?.trim()) void patch(c.id, { title: n.trim() }); };
  const projName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
  const shown = (curProject ? convs.filter((c) => c.project_id === curProject) : convs).filter((c) => c.id !== removing);
  const groups = listGroups(shown, term, t);
  const current = convs.find((c) => c.id === cur) ?? null;
  // A chat's menu open: P pin · R rename · D delete · Esc close — one letter, like AI Soul's title menu (lib/shortcuts menuKeyOf)
  useEffect(() => {
    const c = menu ? convs.find((x) => x.id === menu.replace(/^[mh]:/, "")) : undefined;
    if (!c) return;
    const key = (e: KeyboardEvent) => {
      const typing = Boolean((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]"));
      const m = menuKeyOf({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, typing });
      if (!m) return;
      e.preventDefault();
      if (m === "pin") { setMenu(null); void patch(c.id, { pinned: !c.pinned }); }
      else if (m === "rename") { setMenu(null); rename(c); }
      else if (m === "delete") del(c.id);
      else setMenu(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  // Drag to reorder pinned chats and projects (components/drag-sort.ts) — saved on the server, so every device shows the same order.
  const sortable = !term.trim() && !curProject;
  const pinDrag = useDragSort("pin", (id, before) => {
    const ids = moveBefore(convs.filter((c) => c.pinned).map((c) => c.id), id, before);
    const rank = new Map(ids.map((x, i) => [x, i]));
    setConvs((all) => [...all].sort((a, b) => (a.pinned && b.pinned ? rank.get(a.id)! - rank.get(b.id)! : 0)));
    void fetch("/api/conversations/order", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).then(load).catch(() => {});
  }, sortable);
  const projDrag = useDragSort("proj", (id, before) => {
    const ids = moveBefore(projects.filter((p) => !p.archived).map((p) => p.id), id, before);
    setProjects((all) => [...ids.map((x) => all.find((p) => p.id === x)!).filter(Boolean), ...all.filter((p) => p.archived)]);
    void fetch("/api/projects/order", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).then(load).catch(() => {});
  });

  const menuList = (c: Conv, cls: string) => (
    <div className={`absolute z-30 w-52 bg-surface rounded-lg border border-line-soft shadow-xl py-1 text-sm font-normal ${cls}`} onClick={(e) => e.stopPropagation()}>
      <button className="flex w-full items-center text-left px-3 py-1.5 hover:bg-hover" data-testid="conv-menu-pin" onClick={() => patch(c.id, { pinned: !c.pinned })}>📌 {c.pinned ? t("Unpin") : t("Pin")}<span className="ml-auto pl-3 text-xs text-faint">P</span></button>
      <button className="flex w-full items-center text-left px-3 py-1.5 hover:bg-hover" data-testid="conv-menu-rename" onClick={() => { setMenu(null); rename(c); }}>✏️ {t("Rename")}<span className="ml-auto pl-3 text-xs text-faint">R</span></button>
      <button className="block w-full text-left px-3 py-1.5 hover:bg-hover" onClick={() => patch(c.id, { done: !c.done })}>✅ {t("Mark done")}</button>
      {/* «Share» in AI Soul's title menu: copies this chat's link (it opens only where the member is signed in — nothing is made public) */}
      <button className="block w-full text-left px-3 py-1.5 hover:bg-hover" data-testid="conv-copy-link" title={t("Copy link")} onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/app?c=${c.id}`).catch(() => {}); setMenu(null); }}>🔗 {t("Copy link")}</button>
      {tg?.linked ? (tg.conversationId === c.id
        ? <div className="px-3 py-1.5 text-fg-2" data-testid="conv-telegram-on">📱 {t("Telegram writes into this chat")}</div>
        : <button className="block w-full text-left px-3 py-1.5 hover:bg-hover" data-testid="conv-telegram" title={t("Messages you send the Unchore bot in Telegram go into this chat, and the answers come back there.")} onClick={() => void continueInTelegram(c.id)}>📱 {t("Continue in Telegram")}</button>) : null}
      <div className="px-3 pt-1.5 text-xs text-faint">🗂️ {t("Move to project")}</div>
      <ProjectPick projects={projects} current={c.project_id} onPick={(pid) => void patch(c.id, { projectId: pid })} />
      <button className="flex w-full items-center text-left px-3 py-1.5 hover:bg-hover text-red-700 dark:text-red-400" data-testid="conv-menu-delete" onClick={() => del(c.id)}>{t("Delete")}<span className="ml-auto pl-3 text-xs text-faint">D</span></button>
    </div>
  );

  const row = (c: Conv, i: number, all: Conv[]) => {
    const pn = projName(c.project_id);
    const drag = c.pinned && sortable ? { ...pinDrag.slot(c.id), ...pinDrag.handle(c.id) } : {};
    return (
      <div key={c.id} {...drag} className={`group relative flex items-center rounded-md hover:bg-sel ${cur === c.id && path === "/app" ? "bg-sel" : ""} ${c.pinned && sortable ? pinDrag.cls(c.id, i === all.length - 1) : ""}`} data-testid="conversation-row">
        <ConvLink c={c} lang={lang} tz={tz} current={path === "/app" ? cur : null} tagName={pn && !curProject ? pn : null} />
        <button type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id); }} aria-label={t("Menu")} className={`px-2 py-1 text-sm text-muted rounded hover:bg-line md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 ${menu === c.id ? "md:opacity-100" : ""}`}>⋯</button>
        {menu === c.id ? menuList(c, "right-1 top-8") : null}
      </div>
    );
  };

  const live = projects.filter((p) => !p.archived), archived = projects.filter((p) => p.archived);
  const projectLine = (p: Project) => (
    <>
      <Link href={curProject === p.id ? "/app" : `/app?p=${p.id}`} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-sm"><span className={`size-2.5 shrink-0 rounded-full ${projectColor(p.id)}`} /><span className="flex-1 truncate">{p.name}</span>{p.files ? <span className="text-xs text-faint" title={t("Project files")}>📎{p.files}</span> : null}<span className="text-xs text-faint">{p.chats}</span></Link>
      <button onClick={() => setEditProject(p)} className="px-2 py-1 text-sm text-muted rounded hover:bg-line md:opacity-0 md:group-hover:opacity-100" aria-label={t("Edit project")}>✎</button>
    </>
  );

  const nav = (
    <nav className="flex flex-col h-full bg-panel w-72 max-w-[85vw] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" data-testid="sidebar">
      <div className="p-3 flex items-center gap-2">
        <Link href="/app" className="font-bold text-lg flex-1 flex items-center gap-2"><LogoMark className="size-7 rounded-lg" />Unchore</Link>
        <button type="button" className="md:hidden text-sm px-2 py-1" onClick={() => setOpen(false)} aria-label={t("Close")}>✕</button>
      </div>
      <Link href={curProject ? `/app?p=${curProject}` : "/app"} className="mx-3 mb-2 rounded-lg bg-surface border border-line-3 px-3 py-2 text-sm hover:bg-hover-3" data-testid="new-chat">＋ {t("New chat")}{curProject ? ` · ${projName(curProject) ?? ""}` : ""}</Link>
      <input ref={searchRef} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setTerm(""); }} type="search" placeholder={t("Search chats (titles and text)")} className="mx-3 mb-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
      <div className="flex-1 overflow-y-auto px-2 mt-2" data-testid="conversation-list">
        {curProject ? <Link href="/app" className="flex items-center gap-1 px-1 mb-2 text-xs text-subtle hover:text-fg">← 🗂 {projName(curProject)}</Link> : null}
        {groups.map((g, gi) => {
          const f = foldRows(g, doneOpen, cur);
          return (
            <div key={g.key}>
              <div className={`px-1 text-xs text-subtle mb-1 ${gi ? "mt-3" : ""}`}>{g.key === "done" ? <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-500" />{g.head}</span> : g.head}</div>
              {f.rows.map(row)}
              {f.hidden || (g.key === "done" && doneOpen && g.rows.length > 5) ? <button type="button" onClick={() => setDoneOpen(!!f.hidden)} className="w-full text-left px-3 py-1 text-xs text-subtle hover:bg-sel rounded-md">{f.hidden ? (t("{hidden} more", { hidden: f.hidden })) : (t("Fold"))}</button> : null}
            </div>
          );
        })}
        {shown.length === 0 ? <div className="text-sm text-faint px-2 py-2">{term.trim() ? (t("No chat has those words")) : (t("No chats yet"))}</div> : null}
      </div>
      <div className="shrink min-h-0 max-h-[40vh] overflow-y-auto mt-1">
        <div className="mx-2 flex items-center justify-between text-sm">
          <button type="button" onClick={() => setShownPref(showProjects ? "0" : "1")} className="rounded-md px-1 py-1.5 text-subtle hover:bg-sel">{t("Projects")} {live.length}{t("")} {showProjects ? "▾" : "▸"}</button>
          <button type="button" onClick={() => setEditProject("new")} className="rounded-md px-2 py-1.5 text-subtle hover:bg-sel">＋ {t("New project")}</button>
        </div>
        {showProjects && live.map((p, i) => (
          <div key={p.id} {...projDrag.slot(p.id)} {...projDrag.handle(p.id)} className={`group relative mx-2 flex items-center rounded-md hover:bg-sel ${curProject === p.id ? "bg-sel" : ""} ${projDrag.cls(p.id, i === live.length - 1)}`}>
            {projectLine(p)}
          </div>
        ))}
        {showProjects && archived.length ? (
          <>
            <button type="button" onClick={() => setArchOpen(!archOpen)} className="mx-2 px-1 py-1 text-xs text-subtle hover:bg-sel rounded-md" data-testid="archived-projects">🗄 {t("Archived {n}", { n: archived.length })} {archOpen ? "▾" : "▸"}</button>
            {archOpen && archived.map((p) => <div key={p.id} className={`group relative mx-2 flex items-center rounded-md hover:bg-sel opacity-70 ${curProject === p.id ? "bg-sel" : ""}`}>{projectLine(p)}</div>)}
          </>
        ) : null}
      </div>
      <div className="mx-3 my-2 flex items-center gap-1">
        <Link href="/app/settings" className={`flex-1 rounded-md px-2 py-1.5 text-sm hover:bg-sel ${path === "/app/settings" ? "bg-sel" : ""}`}>⚙ {t("Settings")}</Link>
        <Link href="/app/automations" className={`rounded-md px-2 py-1.5 text-sm hover:bg-sel ${path === "/app/automations" ? "bg-sel" : ""}`}>⚡ {t("Automations")}</Link>
        <Link href="/app/help" className={`rounded-md px-2 py-1.5 text-sm text-subtle hover:bg-sel ${path === "/app/help" ? "bg-sel" : ""}`} data-testid="how-to-open" title={t("How-to videos")} aria-label={t("How-to videos")}>▶</Link>
        {/* the shortcut table without remembering Ctrl/⌘+/ — a small button next to Settings, like AI Soul; desktop only (phones have no keyboard) */}
        <button type="button" onClick={() => setHelp(true)} className="rounded-md px-2 py-1.5 text-sm text-subtle hover:bg-sel hidden md:block" data-testid="shortcut-help-open" title={t("Keyboard shortcuts")} aria-label={t("Keyboard shortcuts")}>⌨</button>
      </div>
    </nav>
  );

  const titleText = current?.title || (path === "/app" && !cur ? "" : path === "/app/settings" ? t("Settings") : path === "/app/automations" ? t("Automations") : path === "/app/help" ? t("How-to videos") : "…");
  return (
    <div className="h-dvh flex overflow-hidden">
      <div className={`${open ? "fixed inset-0 z-40 flex" : "hidden"} md:static ${collapsed ? "md:hidden" : "md:flex"} md:h-full md:z-auto`} data-testid="chat-list-wrap">
        <div className="h-full shadow-xl md:shadow-none">{nav}</div>
        {open ? <div className="flex-1 bg-black/30 md:hidden" onClick={() => setOpen(false)} /> : null}
      </div>
      <div className="flex-1 min-w-0 h-full flex flex-col relative">
        <header className="md:hidden flex items-center gap-2 px-3 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] border-b border-line-soft bg-page">
          <button type="button" className="px-2 py-1" onClick={() => setOpen(true)} aria-label={t("Menu")}><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
          <div className="font-bold flex-1 min-w-0 flex items-center gap-1">
            <span className="truncate">{current?.title || "Unchore"}</span>{/* phone keeps the app name on Settings and Automations, like AI Soul */}
            {current ? (
              <span className="relative shrink-0">
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === `m:${current.id}` ? null : `m:${current.id}`); }} aria-label={t("Menu")} className="px-1.5 py-0.5 rounded text-muted font-normal hover:bg-hover">▾</button>
                {menu === `m:${current.id}` ? menuList(current, "left-0 top-8 font-normal") : null}
              </span>
            ) : null}
          </div>
          <Link href="/app" className="rounded-lg border border-line-3 bg-surface px-2 py-1 text-sm">＋ {t("New chat")}</Link>
        </header>
        {current ? (
          <div className="hidden md:flex items-center gap-1.5 min-w-0 py-2.5 text-sm pl-6 pr-6" data-testid="desktop-title">
            {current?.project_id && projName(current.project_id) ? <><Link href={`/app?p=${current.project_id}`} className="shrink-0 max-w-[40%] truncate text-muted hover:text-inherit hover:underline">{projName(current.project_id)}</Link><span className="shrink-0 text-faint" aria-hidden>/</span></> : null}
            {current ? <button type="button" className="min-w-0 truncate font-medium text-left rounded px-1 -mx-1 hover:bg-hover" onClick={() => rename(current)}>{current.title}</button> : <span className="font-medium">{titleText}</span>}
            {current ? (
              <div className="relative shrink-0">
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === `h:${current.id}` ? null : `h:${current.id}`); }} aria-label={t("Menu")} className="px-1.5 py-0.5 rounded text-muted hover:bg-hover">▾</button>
                {menu === `h:${current.id}` ? menuList(current, "left-0 top-8") : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex-1 min-h-0">{children}</div>
        {removal.undo && <UndoBar text={removal.undo.text} label={t("Undo")} onUndo={removal.cancel} />}
      </div>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      {editProject && <ProjectDialog project={editProject === "new" ? null : editProject} onClose={(changed) => { setEditProject(null); if (changed) load(); }} />}
    </div>
  );
}

/** Ctrl/⌘+/ — the keyboard shortcuts, laid out like AI Soul's table. */
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30" onClick={onClose} data-testid="shortcut-help">
      <div className="bg-surface rounded-t-2xl md:rounded-2xl w-full md:w-96 p-3 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-medium px-2 py-1">{t("Keyboard shortcuts")}</div>
        {SHORTCUT_LIST.map(([keys, what]) => (
          <div key={keys} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"><span>{t(what)}</span><span className="text-xs text-muted">{mod} + {keys}</span></div>
        ))}
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"><span>{t("Send · new line")}</span><span className="text-xs text-muted">Enter · Shift + Enter</span></div>
        <button type="button" className="w-full mt-2 text-sm text-muted py-2" onClick={onClose}>{t("Close")}</button>
      </div>
    </div>
  );
}

type ModelList = { providers: string[]; models: Record<string, { id: string; label: string }[]>; keys: { provider: string }[]; computers?: { id: string; label: string }[] };
type PFile = { id: string; name: string; size: number; readable: boolean };

function ProjectDialog({ project, onClose }: { project: Project | null; onClose: (changed: boolean) => void }) {
  const t = useT();
  const [name, setName] = useState(project?.name ?? "");
  const [rules, setRules] = useState(project?.instructions ?? "");
  const [model, setModel] = useState(project?.default_model ?? "");
  const [me, setMe] = useState<ModelList | null>(null);
  const [files, setFiles] = useState<PFile[]>([]);
  const [fileMsg, setFileMsg] = useState("");
  const [changed, setChanged] = useState(false);
  useEffect(() => { fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => {}); }, []);
  const loadFiles = useCallback(() => { if (project) fetch(`/api/projects/${project.id}/files`).then((r) => (r.ok ? r.json() : [])).then(setFiles).catch(() => {}); }, [project]);
  useEffect(loadFiles, [loadFiles]);
  const has = (p: string) => Boolean(me?.keys.some((k) => k.provider === p));
  async function save() {
    if (!name.trim()) return;
    const body = JSON.stringify({ name, instructions: rules, default_model: model || null });
    const r = project
      ? await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body })
      : await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body });
    onClose(r.ok || changed);
  }
  async function archive() {
    if (!project) return;
    await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived: !project.archived }) });
    onClose(true);
  }
  async function remove() {
    if (!project || !confirm(`${t("Delete")}: ${project.name}?`)) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onClose(true);
  }
  async function upload(list: FileList | null) {
    if (!project || !list?.length) return;
    setFileMsg("");
    for (const f of Array.from(list)) {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch(`/api/projects/${project.id}/files`, { method: "POST", body: fd });
      if (!r.ok) { const j = await r.json().catch(() => ({})) as { error?: string }; setFileMsg(j.error === "too_big" ? t("{name} is over 4 MB", { name: f.name }) : j.error === "too_many" ? t("A project can hold 30 files") : t("Couldn't add {name}", { name: f.name })); }
    }
    setChanged(true); loadFiles();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => onClose(changed)}>
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold">{project ? project.name : t("New project")}</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Project name")} className="rounded-lg border border-line bg-page px-3 py-2" />
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder={t("Instructions for every chat in this project")} rows={6} className="rounded-lg border border-line bg-page px-3 py-2 text-sm" />
        <label className="flex items-center justify-between gap-3 text-sm">{t("AI for this project")}
          <select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg border border-line bg-page px-2 py-1 text-sm max-w-[60%]" data-testid="project-model">
            <option value="">{t("Same as my default")}</option>
            <option value="auto">✨ {t("Auto-pick per question")}</option>
            {me ? me.providers.filter(has).flatMap((p) => (me.models[p] ?? []).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)) : null}
            {me?.computers?.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {model.startsWith("computer:") ? <p className="text-xs text-muted -mt-1">{t("Chats in this project are answered by that computer: its own Claude Code, Codex or Hermes Agent, with its files and tools. Long work keeps going there and comes back to the chat when it's done.")}</p> : null}
        {project ? (
          <div className="flex flex-col gap-1 text-sm" data-testid="project-files">
            <div className="flex items-center justify-between"><span className="font-medium">📎 {t("Project files")}</span>
              <label className="cursor-pointer rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-hover">＋ {t("Add files")}<input type="file" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
            </div>
            <p className="text-xs text-muted">{t("Every chat in this project reads these files. Text files are read; other files are only named.")}</p>
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-2"><a href={`/api/files/${f.id}`} className="flex-1 min-w-0 truncate underline-offset-2 hover:underline">{f.name}</a>
                <span className="shrink-0 text-xs text-muted">{f.readable ? "" : `${t("not readable")} · `}{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button type="button" onClick={async () => { await fetch(`/api/projects/${project.id}/files?file=${f.id}`, { method: "DELETE" }); setChanged(true); loadFiles(); }} className="shrink-0 text-xs text-muted hover:text-fg" aria-label={t("Remove#key")}>✕</button></div>
            ))}
            {fileMsg ? <p className="text-xs text-red-600">{fileMsg}</p> : null}
          </div>
        ) : null}
        <div className="flex gap-2 justify-end">
          {project && <button onClick={remove} className="text-sm text-red-600">{t("Delete")}</button>}
          {project && <button onClick={archive} className="mr-auto text-sm text-muted underline" data-testid="project-archive">{project.archived ? t("Take out of archive") : t("Archive")}</button>}
          <button onClick={() => onClose(changed)} className="rounded-lg border border-line px-3 py-1.5 text-sm">×</button>
          <button onClick={save} className="rounded-lg bg-ink text-on-ink px-3 py-1.5 text-sm">{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}
