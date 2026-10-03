"use client";
import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { useT } from "./I18n";
import { DOT, dotState, projectColor, projectTag, timeText, type ListRow } from "@/lib/conv-line";
import { unreadOf } from "@/lib/read-marks";

/** One chat line — status circle · title · time · preview · unread number. The left list (Shell) and the phone first screen (HomeList)
 *  draw the same line (AI Soul components/ConvItem.tsx). `tagName` = the project tag to show under the title, or null. */
export function ConvLink({ c, lang, tz, current, tagName }: { c: ListRow; lang: Lang; tz: string; current: string | null; tagName: string | null }) {
  const t = useT();
  const st = dotState(c), dot = DOT[st], pc = projectColor(c.project_id);
  return (
    <Link href={`/app?c=${c.id}${c.hit ? `#m-${c.hit.id}` : ""}`} className="relative flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5">
      {pc ? <span className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${pc}`} aria-hidden /> : null}
      <span className={`shrink-0 w-9 h-9 rounded-full ${dot.bg} text-[11px] font-extrabold tracking-tighter flex items-center justify-center`} data-state={st} title={t(dot.en)}>{dot.quiet ? null : t(dot.en)}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline gap-2">
          <span className="flex-1 min-w-0 truncate text-sm">{c.title}</span>
          <span className="shrink-0 text-[11px] text-faint">{timeText(c.updated_at, { lang, t }, tz)}</span>
        </span>
        <span className="flex items-center gap-2">
          {tagName ? <span className={`shrink-0 -mr-1 rounded px-1.5 text-[11px] leading-4 font-bold text-white ${pc}`}>{projectTag(tagName)}</span> : null}
          {c.hit ? <span className="flex-1 min-w-0 truncate text-xs text-subtle" data-testid="search-hit" title={c.hit.text}>{t("Found in a message")}: {c.hit.text}</span>
            : <span className="flex-1 min-w-0 truncate text-xs text-subtle">{st === "working" ? (c.last_role === "assistant" && c.hold ? t("Waiting: {what}", { what: c.hold }) : t("Writing an answer…")) : c.last_text || " "}</span>}
          {unreadOf(c, current) > 0 ? <span className="shrink-0 rounded-full bg-blue-600 text-white text-[11px] leading-4 px-1.5 font-bold" data-testid="unread" aria-label={t("{n} unread", { n: unreadOf(c) })}>{unreadOf(c)}</span> : null}
        </span>
      </span>
    </Link>
  );
}
