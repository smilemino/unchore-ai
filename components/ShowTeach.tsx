"use client";
import { useRef, useState } from "react";
import { canListen, listen } from "./speech";
import { useT } from "./I18n";

// «Show and teach» (benchmark 2026-09-30: a founder teaches a skill by recording the screen and talking over it).
// Screen share + the member's voice → a few screenshots (only when the screen changed) and what they said → sent to chat,
// where the AI turns it into steps and a recipe. Nothing is recorded as video and nothing leaves until they press «Stop and send».
const EVERY_MS = 2500, MAX_SHOTS = 12, WIDTH = 1280;

export const canShowTeach = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

/** How different two tiny grey thumbnails are (0..255 average) — a new shot only when the screen really changed. */
export function diff(a: Uint8ClampedArray | null, b: Uint8ClampedArray): number {
  if (!a || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < b.length; i += 4) s += Math.abs(a[i]! - b[i]!);
  return s / (b.length / 4);
}

export function ShowTeach({ lang, onDone }: { lang: string; onDone: (shots: File[], words: string) => void }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const [n, setN] = useState(0);
  const [heard, setHeard] = useState("");
  const stopAll = useRef<() => void>(() => {});

  async function start() {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); } catch { return; }   // they cancelled
    const video = document.createElement("video");
    video.muted = true; video.srcObject = stream; await video.play().catch(() => {});
    const small = document.createElement("canvas"); small.width = 64; small.height = 36;
    const big = document.createElement("canvas");
    const shots: File[] = [];
    let last: Uint8ClampedArray | null = null;
    let words = "", listening = true, stopEar = () => {};
    const ear = () => { if (!listening || !canListen()) return; stopEar = listen(lang, (x) => setHeard((words + " " + x).trim()), (x, error) => { if (x) words = `${words} ${x}`.trim(); setHeard(words); if (error) listening = false; else ear(); }); };
    ear();
    const grab = () => {
      if (!video.videoWidth || shots.length >= MAX_SHOTS) return;
      const sx = small.getContext("2d")!; sx.drawImage(video, 0, 0, 64, 36);
      const px = sx.getImageData(0, 0, 64, 36).data;
      if (diff(last, px) < 6) return;
      last = px;
      const w = Math.min(WIDTH, video.videoWidth), h = Math.round(video.videoHeight * (w / video.videoWidth));
      big.width = w; big.height = h; big.getContext("2d")!.drawImage(video, 0, 0, w, h);
      big.toBlob((b) => { if (b) { shots.push(new File([b], `step-${String(shots.length + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" })); setN(shots.length); } }, "image/jpeg", 0.72);
    };
    const timer = setInterval(grab, EVERY_MS);
    setTimeout(grab, 600);
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      clearInterval(timer); listening = false; stopEar();
      stream.getTracks().forEach((x) => x.stop());
      setOn(false);
      setTimeout(() => onDone(shots, words), 400);   // the last toBlob lands
    };
    stream.getVideoTracks()[0]?.addEventListener("ended", finish);   // «Stop sharing» in the browser bar
    stopAll.current = finish;
    setN(0); setHeard(""); setOn(true);
  }

  if (!on) return <button type="button" onClick={() => void start()} title={t("Show and teach — share your screen and talk me through a task; I'll turn it into a recipe")} aria-label={t("Show and teach")} className="h-9 px-2 rounded-full text-xs hover:bg-hover-2 whitespace-nowrap" data-testid="show-teach">🎬 {t("Show and teach")}</button>;
  return (
    <div className="basis-full order-first rounded-lg bg-accent-bg px-3 py-2 text-sm flex flex-col gap-1" data-testid="show-teach-on">
      <div className="flex items-center gap-2">
        <span>🔴 {t("Recording your screen — do the task and say what you're doing and why")} · {t("{n} steps caught", { n })}</span>
        <button type="button" onClick={() => stopAll.current()} className="ml-auto rounded-lg bg-ink text-on-ink px-3 py-1">{t("Stop and send")}</button>
      </div>
      <div className="text-xs text-muted">{t("Keep passwords and other people's details off the screen — the screenshots go to your AI.")}</div>
      {heard ? <div className="text-xs text-fg-2 line-clamp-2">🎤 {heard}</div> : null}
    </div>
  );
}
