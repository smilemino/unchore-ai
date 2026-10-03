"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { FRAME, WORKER_BOOT } from "@/lib/personal-ui/runtime";
import { appPath, validRect, type Design, type Rect } from "@/lib/personal-ui/schema";
import type { UIState } from "@/lib/personal-ui/store";
import { useT } from "./I18n";

export function PersonalUI({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [state, setState] = useState<UIState | null>(null);
  const [safe, setSafe] = useState(false);
  const [rect, setRect] = useState<(Rect & { version: number }) | null>(null);
  const [note, setNote] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/personal-ui", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setState(await r.json());
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0); const id = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    window.addEventListener("focus", load);
    return () => { clearTimeout(first); clearInterval(id); window.removeEventListener("focus", load); };
  }, [load]);
  const version = state?.active;
  const enabled = !!state?.design && !!version && !safe;
  const active = enabled && !!rect && rect.version === version;
  const nativeStyle = active ? { "--personal-font-size": `${state?.design?.native?.fontSize ?? 14}px`,
    ...(state?.design?.native?.background ? { "--c-page": state.design.native.background } : {}),
    ...(state?.design?.native?.foreground ? { "--c-fg": state.design.native.foreground } : {}) } as CSSProperties : {};
  const failed = useCallback(() => { setSafe(true); setNote(true); }, []);
  const checked = useCallback(async (pass: boolean, v: number) => {
    const r = await fetch("/api/personal-ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "checked", version: v, pass }) });
    if (r.ok) { if (pass) { setRect(null); setSafe(false); } else setNote(true); await load(); }
  }, [load]);
  async function reset() {
    setSafe(true); // Always regain the original screen immediately, even if the network is down.
    const r = await fetch("/api/personal-ui", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore", base: state?.revision ?? 0, version: null }) });
    if (!r.ok) setNote(true);
    await load();
  }
  return <div className="h-dvh relative overflow-hidden" data-personal-active={active ? "yes" : "no"}>
    {state?.design && version ? <div className="relative z-40 h-10 flex items-center gap-3 px-3 bg-page border-b border-line text-sm" data-testid="personal-controls">
      <span className="truncate flex-1">{state.design.title}</span>
      <button onClick={() => setSafe((v) => !v)}>{safe ? t("Preview") : t("Close")}</button>
      <button onClick={() => void reset()}>{t("Restore default screen")}</button>
    </div> : null}
    {note ? <div role="status" className="absolute z-50 top-10 inset-x-0 p-3 bg-warn-bg text-warn-fg text-sm" onClick={() => setNote(false)}>{t("Something went wrong. Please try again in a moment.")}</div> : null}
    <div className="absolute inset-x-0 bottom-0" style={{ top: state?.design ? 40 : 0 }}>
      {enabled && state?.design && version ? <Screen key={version} design={state.design} version={version} onRect={(r) => setRect({ ...r, version })} onFail={failed} /> : null}
      {state?.draft && state.pending ? <DesignPreview key={`draft-${state.pending}`} design={state.draft} version={state.pending} onChecked={checked} /> : null}
      <div data-personal-native className="absolute bg-page" style={active ? { ...nativeStyle, left: rect!.x, top: rect!.y, width: rect!.width, height: rect!.height } : { inset: 0 }}>
        {children}
      </div>
    </div>
    <style>{`[data-personal-native]>div{height:100%}[data-personal-active=yes] [data-testid=chat-list-wrap]{display:none!important}[data-personal-active=yes] [data-personal-native] header{display:none}[data-personal-active=yes] [data-personal-native] .text-sm{font-size:var(--personal-font-size)}`}</style>
  </div>;
}

function DesignPreview({ design, version, onChecked }: { design: Design; version: number; onChecked: (pass: boolean, version: number) => Promise<void> }) {
  const passed = useRef(new Set<number>()), finished = useRef(false);
  const done = async (pass: boolean, width: number) => {
    if (finished.current) return;
    if (pass) passed.current.add(width);
    if (!pass || passed.current.size === 2) { finished.current = true; await onChecked(pass, version); }
  };
  return <>{[360, 1280].map((width) => <div key={width} aria-hidden style={{ position: "absolute", left: -20000, width, height: 760, visibility: "hidden", pointerEvents: "none" }}>
    <Screen design={design} version={version} preview onChecked={(pass) => done(pass, width)} />
  </div>)}</>;
}

function Screen({ design, version, preview = false, onRect, onFail, onChecked }: {
  design: Design; version: number; preview?: boolean; onRect?: (r: Rect) => void; onFail?: () => void; onChecked?: (pass: boolean, version: number) => Promise<void>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const refs = useRef({ design, onRect, onFail, onChecked });
  useEffect(() => { refs.current = { design, onRect, onFail, onChecked }; });
  useEffect(() => {
    const f = frame.current!;
    const w = {
      postMessage: (data: unknown) => f.contentWindow?.postMessage({ kind: "to-worker", data }, "*"),
      terminate: () => f.contentWindow?.postMessage({ kind: "stop-worker" }, "*"),
    };
    let dead = false, loaded = false, pong = false, rect: Rect | null = null, gotPong = Date.now();
    const started = Date.now();
    let html = refs.current.design.html, css = refs.current.design.css;
    let count = 0, requests = 0, inFlight = 0, lastTick = Date.now();
    const fail = () => { if (dead) return; dead = true; w.terminate(); if (preview) void refs.current.onChecked?.(false, version); else refs.current.onFail?.(); };
    const paint = () => { if (loaded) f.contentWindow?.postMessage({ kind: "render", html, css }, "*"); };
    const reply = (id: unknown, value?: unknown, error?: string) => { if (!dead) w.postMessage({ kind: "reply", id, value, error }); };
    const workerMessage = async (d: Record<string, unknown>) => {
      if (dead || !d || typeof d !== "object") return;
      if (++count > 100) return fail();
      if (d.kind === "pong") { pong = true; gotPong = Date.now(); }
      else if (d.kind === "error") fail();
      else if (d.kind === "render" && typeof d.html === "string" && typeof d.css === "string" && d.html.length <= 100_000 && d.css.length <= 60_000) { html = d.html; css = d.css; paint(); }
      else if (!preview && d.kind === "open") { const p = appPath(d.path); if (p) router.push(p); }
      else if (!preview && d.kind === "draft" && typeof d.text === "string" && d.text.length <= 10000) window.dispatchEvent(new CustomEvent("uc:personal-draft", { detail: d.text }));
      else if (d.kind === "request") {
        if (++requests > 20 || inFlight >= 3) return reply(d.id, undefined, "Too many requests");
        if (d.op !== "get" && d.op !== "set") return reply(d.id, undefined, "Unavailable");
        if (preview && d.op === "set") return reply(d.id, undefined, "Preview does not save data");
        const args = d.args && typeof d.args === "object" ? d.args as Record<string, unknown> : null;
        if (!args || typeof args.key !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(args.key)) return reply(d.id, undefined, "Invalid key");
        inFlight++;
        try {
          const body = JSON.stringify({ key: args.key, value: args.value, revision: args.revision });
          if (body.length > 64000) throw Error("Too large");
          const r = await fetch(`/api/personal-ui/data${d.op === "get" ? `?key=${encodeURIComponent(args.key)}` : ""}`, d.op === "get" ? {} : { method: "POST", headers: { "content-type": "application/json" }, body });
          const value = await r.json(); reply(d.id, r.ok ? value : undefined, r.ok ? undefined : "Data changed. Read it again.");
        } catch { reply(d.id, undefined, "Could not save or load data"); } finally { inFlight--; }
      }
    };
    const receive = (e: MessageEvent) => {
      if (dead || e.source !== f.contentWindow || !e.data) return;
      const d = e.data;
      if (d.kind === "ready") { loaded = true; paint(); f.contentWindow?.postMessage({ kind: "start-worker", source: WORKER_BOOT + "\n" + refs.current.design.js }, "*"); }
      if (d.kind === "worker" && d.data && typeof d.data === "object") void workerMessage(d.data);
      if (d.kind === "rect") {
        if (validRect(d.rect, f.clientWidth, f.clientHeight)) { rect = d.rect; if (!preview) refs.current.onRect?.(d.rect); }
        else { rect = null; if (Date.now() - started > 3000) fail(); }
      }
      if (!preview && d.kind === "action") w.postMessage({ kind: "action", event: d.event });
      if (d.kind === "error") fail();
    };
    window.addEventListener("message", receive);
    const timer = setInterval(() => {
      if (dead) return;
      const now = Date.now();
      if (document.hidden || now - lastTick > 3000) gotPong = now; // background tabs throttle both timers and workers
      lastTick = now;
      count = 0; requests = 0; w.postMessage({ kind: "ping" });
      if (Date.now() - started > 6000 && (!rect || !pong || Date.now() - gotPong > 5000)) fail();
      if (preview && rect && pong && Date.now() - started > 1500) { dead = true; w.terminate(); void refs.current.onChecked?.(true, version); }
    }, 1000);
    f.srcdoc = FRAME;
    return () => { dead = true; clearInterval(timer); window.removeEventListener("message", receive); w.terminate(); };
  }, [version, preview, router]);
  return <iframe ref={frame} title={design.title} sandbox="allow-scripts" className="absolute inset-0 w-full h-full border-0" style={preview ? { visibility: "hidden", pointerEvents: "none" } : undefined} data-testid={preview ? "personal-preview" : "personal-screen"} />;
}
