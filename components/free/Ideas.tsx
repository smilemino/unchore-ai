"use client";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { ROLES } from "@/lib/free-tools/ideas";
import { ASK_KEY } from "./ToolCta";

export function Ideas() {
  const t = useT();
  const [role, setRole] = useState(ROLES[0]!.id);
  const r = ROLES.find((x) => x.id === role)!;
  const [copied, setCopied] = useState(-1);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">{ROLES.map((x) => (
        <button key={x.id} onClick={() => setRole(x.id)} className={`rounded-full border px-3 py-1 text-sm ${x.id === role ? "bg-ink text-on-ink border-ink" : "border-line hover:bg-hover"}`}>{t(x.name)}</button>))}</div>
      <ol className="flex flex-col gap-2" data-testid="ideas">{r.ideas.map((i, n) => (
        <li key={n} className="rounded-lg border border-line-soft bg-surface px-3 py-2 flex items-center gap-2">
          <span className="flex-1">{t(i.text)}</span>
          <button className="text-xs underline text-fg-2" onClick={() => { try { navigator.clipboard.writeText(t(i.text)); } catch { /* no clipboard */ } setCopied(n); }}>{copied === n ? t("Copied") : t("Copy")}</button>
          <Link href="/" onClick={() => { try { localStorage.setItem(ASK_KEY, t(i.text)); } catch { /* blocked */ } }} className="text-xs rounded-md bg-ink text-on-ink px-2 py-1">{t("Hand it off")}</Link>
        </li>))}</ol>
      <p className="text-xs text-fg-2">{t("Each line is a sentence you can say to Unchore as it is. It sets the chore up and runs it for you.")}</p>
    </section>
  );
}
