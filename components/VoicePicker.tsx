"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { VOICE_ID_KEY, defaultVoice, localeFor, mainAccent, otherAccents, voiceChoices, voiceOf, type Voice, type VoiceFilter } from "@/lib/voice/catalog";
import { useT } from "./I18n";
import { Speaker } from "./voice-out";

// Settings › voice for voice mode (AI Soul VoicePicker, 2026-10-02): besides asking in words («a calmer male voice»), the member can
// look through the voices of their language, ▶ listen to one and pick it. Kept on this device only, like the rest of voice mode.
// Listening goes through /api/voice/tts — the same daily minutes and credit as voice mode; when they're used up the phone's voice reads.
const LANG_KEY = "uc_voice_lang";
const seg = (on: boolean) => (on ? "rounded-lg bg-ink text-on-ink px-3 py-1" : "rounded-lg border border-line-2 bg-surface px-3 py-1");
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

export function VoicePicker({ lang }: { lang: string }) {
  const t = useT();
  const [locale, setLocale] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [f, setF] = useState<VoiceFilter>({ gender: "all", pitch: "all", accent: "" });
  const [playing, setPlaying] = useState("");
  const [why, setWhy] = useState<string | null | undefined>(undefined);   // undefined = asking; null = the natural voice can be heard
  const sp = useRef<Speaker | null>(null);
  useEffect(() => {
    const l = localeFor(get(LANG_KEY) ?? (navigator.language || lang));
    const saved = get(VOICE_ID_KEY);
    Promise.resolve().then(() => { setLocale(l); setPick(saved && voiceOf(saved)?.locale === l ? saved : defaultVoice(l)); });
    // ▶ Listen only while the natural voice can be used — otherwise the phone's voice would read and sound like the chosen one
    void fetch(`/api/voice?lang=${encodeURIComponent(l)}`).then((r) => (r.ok ? r.json() : null)).then((r: { google?: boolean; why?: string | null } | null) => setWhy(r?.google ? null : (r?.why ?? "off"))).catch(() => setWhy("off"));
    return () => sp.current?.stop();
  }, [lang]);
  const list = useMemo(() => (locale ? voiceChoices(locale, f) : []), [locale, f]);
  // the number after each voice stays the same whatever the filters, so «#7» can be found again
  const num = useMemo(() => new Map((locale ? voiceChoices(locale, { gender: "all", pitch: "all", accent: "" }) : []).map((v, i) => [v.id, i + 1])), [locale]);
  if (!locale) return null;
  const accents = locale === "*" ? [] : [mainAccent(locale), ...otherAccents(locale)].filter(Boolean);
  const choose = (id: string) => { try { localStorage.setItem(VOICE_ID_KEY, id); } catch { /* private mode */ } setPick(id); };
  const listen = (id: string) => {
    const s = (sp.current ??= new Speaker(id, get(LANG_KEY) ?? (navigator.language || lang), true));
    s.stop();
    if (playing === id) { setPlaying(""); return; }
    s.unlock(); s.voice = id; setPlaying(id);
    s.onLimit = (w) => { s.stop(); setPlaying(""); setWhy(w || "off"); };
    s.say(t("Hello! This is how I'll sound in voice mode."), () => setPlaying((p) => (p === id ? "" : p)));
  };
  const label = (v: Voice) => [v.gender === "m" ? t("Male#voice") : v.gender === "f" ? t("Female#voice") : t("Neutral#voice"), [t("Low#pitch"), t("Medium#pitch"), t("High#pitch")][v.pitch - 1], v.accent, `#${num.get(v.id)}`].filter(Boolean).join(" · ");
  return (
    <section className="mb-6 flex flex-col gap-2" id="voice" data-testid="voice-picker">
      <h2 className="font-bold">{t("Voice for voice mode")}</h2>
      <p className="text-xs text-subtle">{t("You can also just say it in voice mode («a calmer voice», «a male voice»). Listening uses your natural-voice minutes. This device only.")}</p>
      {why ? <p className="text-xs text-subtle" data-testid="voice-listen-off">{why === "no_credit" ? t("The free credit for the natural voice is used up — the phone's own voice reads from now on.") : why === "daily_limit" ? t("Today's 60 minutes of the natural voice are used up — the phone's own voice reads for the rest of the day.") : t("The natural voice can't be heard right now — you can still pick one.")}</p> : null}
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="voice-filter-gender">
        {([["all", t("All#voices")], ["f", t("Female#voice")], ["m", t("Male#voice")]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, gender: k })} aria-pressed={f.gender === k} className={seg(f.gender === k)} data-testid={`voice-gender-${k}`}>{l}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="voice-filter-pitch">
        {([["all", t("Any pitch")], [1, t("Low#pitch")], [2, t("Medium#pitch")], [3, t("High#pitch")]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setF({ ...f, pitch: k })} aria-pressed={f.pitch === k} className={seg(f.pitch === k)} data-testid={`voice-pitch-${k}`}>{l}</button>)}
        {accents.length > 1 ? (
          <select value={f.accent} onChange={(e) => setF({ ...f, accent: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" aria-label={t("Accent")} data-testid="voice-accent">
            <option value="">{t("Any accent")}</option>
            {accents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        ) : null}
      </div>
      <ul className="max-h-72 overflow-y-auto rounded-lg border border-line-2 divide-y divide-line-2 text-sm" data-testid="voice-list">
        {list.map((v) => (
          <li key={v.id} className="flex items-center gap-2 px-3 py-1.5" data-testid={`voice-row-${v.id}`}>
            <span className="flex-1 min-w-0">{label(v)}</span>
            {why === null ? <button type="button" onClick={() => listen(v.id)} className="shrink-0 rounded-lg border border-line-2 bg-surface px-2.5 py-1" data-testid={`voice-listen-${v.id}`}>{playing === v.id ? t("■ Stop") : t("▶ Listen")}</button> : null}
            <button type="button" onClick={() => choose(v.id)} aria-pressed={pick === v.id} className={seg(pick === v.id)} data-testid={`voice-choose-${v.id}`}>{pick === v.id ? t("✓ In use") : t("Use#voice")}</button>
          </li>
        ))}
        {list.length === 0 ? <li className="px-3 py-2 text-faint">{t("No voice matches — loosen a filter.")}</li> : null}
      </ul>
    </section>
  );
}
