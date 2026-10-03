"use client";
import { useEffect, useState } from "react";
import { useT } from "./I18n";
import type { Lang } from "@/lib/i18n";
import { howToVideo } from "@/lib/how-to-videos";
import { HowToPlayer } from "./HowToPlayer";
export function PersonalUITip({ eligible, lang, onAsk }: { eligible: boolean; lang: Lang; onAsk: (text: string) => void }) {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    const timer = setTimeout(() => {
      void fetch("/api/personal-ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "tip" }) })
        .then((r) => r.ok ? r.json() : null).then((r) => { if (live && r?.show) setShow(true); }).catch(() => {});
    }, 12000);
    return () => { live = false; clearTimeout(timer); };
  }, [eligible]);
  if (!show || !eligible) return null;
  return <aside className="rounded-xl border border-line bg-panel p-3 text-sm" data-testid="personal-tip">
    <div className="font-semibold">{t("Change my screen")}</div>
    <p className="mt-1 mb-2">{t("Ask me to change the layout or add a tool. This short video shows how.")}</p>
    <HowToPlayer v={howToVideo("personal-ui")!} lang={lang} className="w-full max-h-48 rounded-lg" />
    <div className="mt-2 flex flex-wrap gap-3">
      <button className="underline" onClick={() => { setShow(false); onAsk(t("Change my screen")); }}>{t("Change my screen")}</button>
      <button className="text-muted" onClick={() => { setShow(false); void fetch("/api/personal-ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "hide-tip" }) }); }}>{t("Don't show this again")}</button>
    </div>
  </aside>;
}
