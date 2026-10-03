"use client";
import { useEffect, useState } from "react";
import { useT } from "./I18n";

// «Google Drive» next to ＋: Google's own file picker. With the drive.file scope Unchore can open only the files picked here
// (no «read all of Drive» — that scope is restricted and needs a yearly security audit; owner 2026-10-01). Each picked file
// comes through /api/connect/google/drive-file and is attached like an upload.
type Picked = { id: string };
type PickerNS = {
  PickerBuilder: new () => PickerB;
  DocsView: new (id?: string) => { setIncludeFolders(b: boolean): unknown; setSelectFolderEnabled(b: boolean): unknown };
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string };
  Response: { ACTION: string; DOCUMENTS: string };
};
type PickerB = Record<"addView" | "enableFeature" | "setOAuthToken" | "setDeveloperKey" | "setAppId" | "setLocale" | "setCallback" | "setOrigin", (x: unknown) => PickerB> & { build(): { setVisible(b: boolean): void } };
type G = { gapi?: { load(n: string, cb: () => void): void }; google?: { picker?: PickerNS } };

const KEY = process.env.NEXT_PUBLIC_UNCHORE_PICKER_KEY ?? "";

function loadPicker(): Promise<PickerNS> {
  const w = window as unknown as G;
  if (w.google?.picker) return Promise.resolve(w.google.picker);
  return new Promise((ok, no) => {
    const done = () => w.gapi!.load("picker", () => (w.google?.picker ? ok(w.google.picker) : no(new Error("picker"))));
    if (w.gapi) return done();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js"; s.async = true; s.onload = done; s.onerror = () => no(new Error("load"));
    document.head.appendChild(s);
  });
}

/** Files that came from Google Drive: the upload says so, and the chat is kept out of improvement copies (lib/privacy.ts). */
export const FROM_GOOGLE = new WeakSet<File>();

export function DrivePick({ lang, onFiles, item, onPicked }: { lang: string; onFiles: (files: File[]) => void; item?: boolean; onPicked?: () => void }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!KEY) return;
    let live = true;
    fetch("/api/connect/google").then((r) => (r.ok ? r.json() : null)).then((d: { connected?: { services?: string[] } | null } | null) => {
      if (live) setOn(Boolean(d?.connected?.services?.includes("drive")));
    }).catch(() => null);
    return () => { live = false; };
  }, []);
  if (!on) return null;

  async function fetchPicked(docs: Picked[]) {
    const out: File[] = [];
    for (const d of docs) {
      const r = await fetch(`/api/connect/google/drive-file?id=${encodeURIComponent(d.id)}`).catch(() => null);
      if (!r?.ok) { alert(t("Couldn't open that Drive file — try again")); continue; }
      const name = decodeURIComponent(r.headers.get("X-File-Name") ?? "drive-file");
      const file = new File([await r.blob()], name, { type: r.headers.get("Content-Type") ?? "application/octet-stream" });
      FROM_GOOGLE.add(file);
      out.push(file);
    }
    if (out.length) onFiles(out);
  }

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const [p, tok] = await Promise.all([loadPicker(), fetch("/api/connect/google/picker").then((r) => (r.ok ? r.json() : null))]);
      if (!tok?.token) { alert(t("Connect Google again in Settings to pick Drive files")); return; }
      const view = new p.DocsView(p.ViewId.DOCS); view.setIncludeFolders(true); view.setSelectFolderEnabled(false);
      new p.PickerBuilder().addView(view).enableFeature(p.Feature.MULTISELECT_ENABLED).setOAuthToken(tok.token).setDeveloperKey(KEY)
        .setAppId(tok.appId).setLocale(lang).setOrigin(window.location.origin)
        .setCallback((data: unknown) => {
          const d = data as Record<string, unknown>;
          if (d[p.Response.ACTION] === p.Action.PICKED) void fetchPicked((d[p.Response.DOCUMENTS] as Picked[]) ?? []);
        }).build().setVisible(true);
    } catch { alert(t("Couldn't open Google Drive — try again")); } finally { setBusy(false); }
  }
  return (
    <button type="button" onClick={() => { onPicked?.(); void open(); }} title={t("Google Drive")} aria-label={t("Google Drive")} data-testid="drive-pick"
      className={item ? "block w-full text-left px-3 py-1.5 hover:bg-hover" : "h-9 px-2 rounded-full hover:bg-hover-2 text-xs whitespace-nowrap"}>{busy ? "…" : `△ ${t("Google Drive")}`}</button>
  );
}
