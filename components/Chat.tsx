"use client";
import { RESEARCH_MAX_MINUTES, RESEARCH_SEARCHES } from "@/lib/research";
import { pasteFileName, shouldAttachPaste } from "@/lib/paste";
import { readDraftFiles, writeDraftFiles } from "@/lib/draft-files";
import { mergeServer } from "@/lib/conv-sync";
import { sharedText } from "@/lib/share-in";
import { hideNewText, hideReply, readFrom } from "@/lib/msg-intake";
import { NewTextCard, ReceivedBar, ReplyCard } from "./ReceivedMsg";
import { ThinkMusic } from "./think-music";
import { ding } from "./ding";
import { ANNOUNCE_KEY, VOICE_SLOW_MS, announceLine, announceOn, announceWaits, reportSpeech, slowNoteOk } from "@/lib/voice/announce";
import { splitTech } from "@/lib/answer-fold";
import { modelBlurb } from "@/lib/model-blurb";
import { enterSends, isPhoneLike } from "@/lib/composer";
import { useRouter, useSearchParams } from "next/navigation";
import { TRY_KEY } from "./SourceMark";
import { CHECKED_NIGHTLY, FOUNDER_PICKS, RECIPE_TITLES } from "@/lib/recipe-titles";
import { ASK_KEY } from "./free/ToolCta";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Lang, TFn } from "@/lib/i18n";
import { useT } from "./I18n";
import ContextNote from "./ContextNote";
import PdfFirstPage from "./PdfFirstPage";
import { isPdf } from "@/lib/pdf-preview";
import { ProjectPick } from "./ProjectPick";
import type { MemoryChange } from "@/lib/memory";
import { MAX_BIG_UPLOAD, PART_BYTES } from "@/lib/upload-limits";
import { readGoogleActions } from "@/lib/google-act";
import { readMetaActions } from "@/lib/meta-act";
import { readHfAsks } from "@/lib/hf-ask";
import { readRemember } from "@/lib/remember-mark";
import { CopyBtn, DocPreviewBtn, Markdown, PreviewSet } from "./Markdown";
import { docPreview } from "@/lib/previews";
import { screenLinks } from "@/lib/screen-links";
import Link from "next/link";
import { OfferCard, type Proposal } from "./Offer";
import { canListen, listen, speak, stopSpeaking } from "./speech";
import { Speaker } from "./voice-out";
import { recordUtterance } from "./voice-rec";
import { nativeBridge, nativeView, nativeVoiceSession, setNativeControl } from "./native-app";
import { stripVoiceMarks } from "@/lib/voice/marker";
import { voicePip } from "@/lib/voice/pip";
import { MIC_FATAL, joinSpoken, micTrouble, type MicTrouble } from "@/lib/voice/dictation";
import { missedFresh, type Missed } from "@/lib/voice/missed";
import { dropEcho } from "@/lib/voice/echo";
import { whileThinking } from "@/lib/voice/think-listen";
import { musicCrumb, musicPlan } from "@/lib/voice/job-music";
import { bargeCheck, bargeFinal, bargeReal, stopOnly, type Barge } from "@/lib/voice/barge";
import { afterTalkOver } from "@/lib/voice/goodbye";
import { useClientValue, useStored } from "./useClient";
import { DrivePick, FROM_GOOGLE } from "./DrivePick";
import { ShowTeach, canShowTeach } from "./ShowTeach";
import BuildLine from "./BuildLine";
import ConversationTasks from "./ConversationTasks";
import { PersonalUITip } from "./PersonalUITip";
import { PICKS, askName, callName, greeting, readPicks } from "@/lib/face";
import { HomeList } from "./HomeList";
import { yesNoAsk } from "@/lib/yes-no";
import { hideMarks, readSecretAsks } from "@/lib/chat-setup";
import { useSetup } from "./Setup";
import { COPY_LAST_EVENT } from "@/lib/shortcuts";
import { allowBoxOpens, enablePush, pushState, type PushState } from "./push-client";
import { Awake } from "./awake";
import { fileOpenHref } from "@/lib/office-kind";

type FileChip = { id: string; name: string; mime: string; size: number };
type Msg = { id?: string; role: "user" | "assistant"; content: string; model?: string | null; created_at?: string; proposal?: Proposal | null; status?: string; files?: FileChip[]; notes?: string[]; memory?: MemoryChange | null; summarized?: number; failed?: boolean; gdone?: number[]; mdone?: number[]; superseded?: boolean };
type Model = { id: string; label: string };
type Queued = { id?: string; text: string; files: FileChip[]; held?: boolean };   // id = kept on the server (lib/queue.ts)

// Voice mode memory on this device: the language heard in the user's first words, the Google voice, and the two one-time questions.
const VK = { lang: "uc_voice_lang", sure: "uc_voice_lang_sure", id: "uc_voice_id", asked: "uc_voice_asked", offered: "uc_voice_offered" } as const;
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
/** Does this Google voice belong to the locale the server named («ko-KR», or «*» = language without its own voices)? */
const fits = (id: string, locale: string) => (locale === "*" ? !id.includes("-") : id.toLowerCase().startsWith(`${locale.toLowerCase()}-`));

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Chat({ lang, hasKey, models, face = null, onboarded = true, defaultModel = null, name = null }: { lang: Lang; hasKey: boolean; models: Model[]; face?: string | null; onboarded?: boolean; defaultModel?: string | null; name?: string | null }) {
  const t = useT();
  // First chat, step 1 «what should I call you?» (lib/face.ts askName): "" = not asked yet, "-" = answered with a sentence, else the name.
  const [called, setCalled] = useStored("uc_called", "");
  const browser = useClientValue(() => true, false);
  const sp = useSearchParams();
  const router = useRouter();
  const convId = sp.get("c");
  const projectId = sp.get("p");
  const shared = convId ? "" : sharedText({ title: sp.get("title"), text: sp.get("text"), url: sp.get("url") });   // phone «Share → Unchore»
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // Ctrl/⌘+Shift+C (lib/shortcuts.ts) copies the last answer — same words as the answer's own Copy button.
  useEffect(() => {
    const onCopy = () => { const last = [...msgs].reverse().find((m) => m.role === "assistant" && m.content); if (last) navigator.clipboard?.writeText(plain(last.content)).catch(() => {}); };
    window.addEventListener(COPY_LAST_EVENT, onCopy);
    return () => window.removeEventListener(COPY_LAST_EVENT, onCopy);
  }, [msgs]);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const phone = useClientValue(() => isPhoneLike(navigator.userAgent, navigator.maxTouchPoints), false);   // browser-only — Enter adds a line on phones
  const [title, setTitle] = useState("");   // the title now shows in Shell («project / title ▾»), kept so a fresh title still triggers a list refresh
  const [model, setModel] = useState<string>("");
  const [text, setText] = useState("");
  useEffect(() => {
    const draft = (e: Event) => { const value = (e as CustomEvent<unknown>).detail; if (typeof value === "string") setText((old) => old.trim() ? old : value.slice(0, 10000)); };
    window.addEventListener("uc:personal-draft", draft);
    return () => window.removeEventListener("uc:personal-draft", draft);
  }, []);
  // «Edit and ask again» (AI Soul): the question being replaced — its answers and everything after it are set aside when this is sent.
  const [editOf, setEditOf] = useState<string | null>(null);
  const [sharedTaken, setSharedTaken] = useState("");
  if (shared && shared !== sharedTaken) { setSharedTaken(shared); setText(shared); }   // fill once per share, never sent by itself
  // A friend's «send to a friend» link (components/SourceMark.tsx kept the recipe): fill the ask once, never sent by itself.
  const friendTry = useClientValue(() => (convId || shared ? null : (sp.get("try") ?? (() => { try { return localStorage.getItem(TRY_KEY); } catch { return null; } })())), null);
  const [tryTaken, setTryTaken] = useState(false);
  if (friendTry && RECIPE_TITLES[friendTry] && !tryTaken) {
    setTryTaken(true);
    setText(t("My friend set up «{recipe}» on Unchore. Set up the same for me.", { recipe: t(RECIPE_TITLES[friendTry]!) }));
    try { localStorage.removeItem(TRY_KEY); } catch { /* blocked storage */ }
  }
  // A free tool's «make it run by itself» (components/free/ToolCta.tsx): its sentence fills the first chat once, never sent by itself.
  const toolAsk = useClientValue(() => (convId || shared || friendTry ? null : (() => { try { return localStorage.getItem(ASK_KEY); } catch { return null; } })()), null);
  const [askTaken, setAskTaken] = useState(false);
  if (toolAsk && !askTaken) {
    setAskTaken(true);
    setText(toolAsk.slice(0, 500));
    try { localStorage.removeItem(ASK_KEY); } catch { /* blocked storage */ }
  }
  const [files, setFiles] = useState<FileChip[]>([]);
  const [uploading, setUploading] = useState(0);
  // Attachments like AI Soul's composer (10/1 owner «why isn't the attaching part synced?»): ＋ menu, a progress bar, the drop target lit while dragging
  const [plusOpen, setPlusOpen] = useState(false);
  // ＋ «Move to project» (AI Soul AddToProject): this chat into a project — or, on a new chat, start it in that project
  const [projPick, setProjPick] = useState<{ id: string; name: string; archived?: boolean }[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [upProg, setUpProg] = useState<{ name: string; sent: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const askingName = msgs.length === 0 && hasKey && !onboarded && browser && called === "";
  const [queue, setQueue] = useState<Queued[]>([]);
  const [hearing, setHearing] = useState(false);
  const [voice, setVoice] = useState(false);
  // Voice mode «⏸ Take a break» / «🔇 Sound off» (AI Soul VoiceMode voice-pause · voice-mute): a break stops listening and reading
  // until «▶ Listen again» without leaving voice mode; sound off shows answers without reading them and keeps listening.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  // Voice mode keeps the phone screen on — a dark screen stops listening and reading aloud (AI Soul voice-client Awake)
  useEffect(() => { if (!voice) return; const a = new Awake(); void a.on(); return () => a.off(); }, [voice]);
  const [reading, setReading] = useState<number | null>(null);
  const [voiceNote, setVoiceNote] = useState("");
  const [micNote, setMicNote] = useState("");   // why the microphone gave nothing (AI Soul speech.ts) — shown for 8 s
  const [micDead, setMicDead] = useState(false);   // pressing 🎤 again won't help this visit — the button hides
  const micNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<"" | "google" | "phone">("");   // which voice reads right now (AI Soul 10/1 «is that really the natural voice?»)
  const [otherFor, setOtherFor] = useState<number | null>(null);
  const [sbs, setSbs] = useState<number | null>(null);   // «Side by side» open under this answer (AI Soul «나란히 보기»: the answer from «Ask another AI» next to the one it replaced)   // «Ask another AI» list open under this answer (AI Soul: you pick the AI)
  const [reportFor, setReportFor] = useState<string | null>(null);   // «Report» under an answer (Google Play AI rule) — which answer's reasons are open
  const [reported, setReported] = useState<string[]>([]);
  const report = (id: string, reason: "harmful" | "false" | "other") => {
    setReportFor(null); setReported((r) => [...r, id]);
    void fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: id, reason }) }).catch(() => {});
  };
  const speaker = useRef<Speaker | null>(null);
  const abort = useRef<AbortController | null>(null);
  const turnNo = useRef<string | null>(null);   // the answer being made — ■ Stop names it (closing the page doesn't stop it)
  const [waitMs, setWaitMs] = useState<number | null>(null);   // a chat opened while its answer is still being made (ms so far)
  const [draft, setDraft] = useState("");   // that answer as written so far (another tab or device is making it — lib/conv-sync.ts)
  const stopEar = useRef<(() => void) | null>(null);
  // «🎙 Hold to talk» (AI Soul addc605): while held, pauses don't send; letting go sends what was heard. null = not holding.
  const ptt = useRef<{ on: boolean; said: string } | null>(null);
  const sentAt = useRef(0);   // when the answer being made was asked (voice mode listens while thinking — lib/voice/think-listen.ts)
  const readLater = useRef<(() => void) | null>(null);
  const missed = useRef<Missed | null>(null);   // voice mode was closed while this answer was on the way — read it when it opens again (lib/voice/missed.ts)
  // Talking over the voice (lib/voice/barge.ts): the ear that listens while an answer is read, and mishears this session (2 → only «stop»-words or 8+ new letters count — it used to turn off, Synced from AI Soul 2026-10-01).
  const bargeEar = useRef<(() => void) | null>(null);
  const bargeMiss = useRef(0);   // an answer that came while the user was still talking
  const bottom = useRef<HTMLDivElement>(null);
  // Follow new text only while the reader is at the bottom; scrolling up to read stops it and shows «Jump to the latest» (ported from AI Soul).
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastTop = useRef(0);
  const [showDown, setShowDown] = useState(false);
  const skipLoad = useRef<string | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const voiceRef = useRef(false);
  voiceRef.current = voice;
  const music = useRef<ThinkMusic | null>(null);
  const [jobs, setJobs] = useState<string[]>([]);   // jobs left running in this chat (a build, «🖥 <name>») — their result is still to come
  const jobsRef = useRef(0);
  jobsRef.current = jobs.length;
  // Voice mode must not stay stuck after the phone was away (maps, another app, a dropped connection): coming back starts listening
  // again when nothing is listening, thinking or reading. A web page can't use the mic while hidden, so a listen that ends with
  // nothing heard waits for the return; on screen it listens again (3 s apart if the mic keeps failing) — AI Soul 9/30.
  const busyRef = useRef(false);
  busyRef.current = busy;
  const saying = useRef(false);
  // A finished job's «ding» that came while Unchore was talking, answering or the member held «🎙» — read at the next pause (AI Soul 0b9715f).
  const announcePend = useRef<string | null>(null);
  const slowSaid = useRef("");   // the «taking longer» line, if said for this question — dropped if the mic hears it back
  const textNow = useRef("");
  textNow.current = text;
  // soft piano while the answer is being made in voice mode (AI Soul 9/29), and on while a job left running is still at work —
  // turned down, not off, while Unchore speaks or the member talks (lib/voice/job-music.ts · AI Soul 31c841c)
  const tuneMusic = useRef(() => {});
  tuneMusic.current = () => {
    const m = music.current; if (!m) return;
    const plan = musicPlan({ voice: voiceRef.current, busy: busyRef.current, jobs: jobsRef.current, saying: saying.current, talking: Boolean(ptt.current) || (hearing && textNow.current.trim() !== ""), hidden: typeof document !== "undefined" && document.hidden && !nativeBridge(), call: inCall.current });
    if (plan === "off") { if (m.playing) m.stop(); return; }
    if (!m.playing) m.start();
    m.duck(plan === "low");
  };
  useEffect(() => {
    tuneMusic.current();
    if (!voice || !jobs.length) return;
    const id = setInterval(() => tuneMusic.current(), 500);   // reading and the ear switch often while a job runs — follow them
    return () => clearInterval(id);
  }, [voice, busy, jobs.length, hearing, text]);
  // An answer still not here after 15 s in voice mode: say so once (the music alone read as «it broke» — AI Soul fd7234df6)
  useEffect(() => {
    if (!voice || !busy) return;
    const at = sentAt.current;
    const id = setTimeout(() => {
      const sp = speaker.current;
      if (!sp || !slowNoteOk({ voice: voiceRef.current, busy: busyRef.current, sameTurn: sentAt.current === at, saying: saying.current, holding: Boolean(ptt.current), typed: textNow.current })) return;
      const line = t("It's taking a little longer than usual. I'll read the answer as soon as it comes.");
      slowSaid.current = line; music.current?.stop();
      sp.say(line, () => { if (voiceRef.current && busyRef.current && sentAt.current === at) music.current?.start(); });
    }, VOICE_SLOW_MS);
    return () => clearTimeout(id);
  }, [voice, busy, t]);
  const lastEar = useRef(0);
  const reviveRef = useRef(() => {});
  const inCall = useRef(false);   // Android app: a phone call is ringing or on — voice mode stays quiet until it ends
  reviveRef.current = () => {
    if (!voiceRef.current || ptt.current || inCall.current || typeof document === "undefined" || document.hidden) return;
    if (saying.current && speaker.current?.stuck()) { saying.current = false; speaker.current.stop(); }
    if (!stopEar.current && !saying.current && (!busyRef.current || ls.get(VK.sure) === "1")) startHearing(true);
  };
  useEffect(() => {
    const back = () => reviveRef.current();
    document.addEventListener("visibilitychange", back); window.addEventListener("focus", back); window.addEventListener("pageshow", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); window.removeEventListener("pageshow", back); };
  }, []);
  // Android app (components/native-app.ts): keep the mic and sound alive behind other apps, show the state in the small floating
  // window, go quiet during a phone call and carry on after it, and obey «Stop and listen» / «End» from the app's buttons.
  const nativeCtl = useRef<{ call: (on: boolean) => void; interrupt: () => void; end: () => void }>({ call: () => {}, interrupt: () => {}, end: () => {} });
  nativeCtl.current = {
    call: (on) => {
      inCall.current = on;
      if (on) { stopEar.current?.(); stopEar.current = null; stopBarge(); speaker.current?.stop(); music.current?.stop(); stopSpeaking(); saying.current = false; setHearing(false); return; }
      if (!voiceRef.current) return;
      const later = readLater.current; readLater.current = null;
      if (later) later(); else startHearing(true);
    },
    interrupt: () => { if (voiceRef.current && !inCall.current) startHearing(true); },
    end: () => { if (voiceRef.current) toggleVoice(); },
  };
  useEffect(() => {
    setNativeControl({ call: (on) => nativeCtl.current.call(on), interrupt: () => nativeCtl.current.interrupt(), end: () => nativeCtl.current.end() });
    return () => setNativeControl(null);
  }, []);
  useEffect(() => { nativeVoiceSession(voice); }, [voice]);
  useEffect(() => {
    const view = voicePip({ voice, hearing, busy, heard: text, note: voiceNote, messages: msgs });
    nativeView(view.phase, view.line);
  }, [voice, hearing, busy, msgs, text, voiceNote]);
  const listenAgain = () => { setTimeout(() => reviveRef.current(), Math.max(0, 3000 - (Date.now() - lastEar.current))); };
  const draftKey = `uc_draft:${convId ?? "new"}`;
  const micOk = useClientValue(() => { try { return canListen(); } catch { return false; } }, false);
  const teachOk = useClientValue(() => canShowTeach() && !isPhoneLike(navigator.userAgent, navigator.maxTouchPoints), false);   // screen share is a computer thing
  // Connect an AI, paste a key, reconnect Claude — all inside the chat, never the Settings page (components/Setup.tsx).
  const sendRef = useRef<(q: string) => void>(() => {});
  const setup = useSetup(hasKey, (q) => sendRef.current(q), msgs.length);

  const [shownConv, setShownConv] = useState(convId);
  const convNow = useRef(convId);
  convNow.current = convId;
  if (shownConv !== convId) {
    setShownConv(convId);
    if (!convId || skipLoad.current !== convId) { setMsgs([]); setTitle(""); setModel(""); setup.reset(); }
    setWaitMs(null); setDraft("");
    setText(typeof window !== "undefined" ? localStorage.getItem(`uc_draft:${convId ?? "new"}`) ?? "" : "");
    setFiles(typeof window !== "undefined" ? readDraftFiles(localStorage, convId) : []);   // unsent attachments come back too
  }
  useEffect(() => {
    if (!convId || skipLoad.current === convId) return;
    fetch(`/api/conversations/${convId}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setMsgs(d.messages); setTitle(d.conversation.title); setModel(d.conversation.model ?? "");
      if (d.conversation.answeringMs != null && d.messages.at(-1)?.role === "user") setWaitMs(d.conversation.answeringMs);
    });
    // Waiting messages kept on the server (closing the window doesn't lose them — lib/queue.ts)
    fetch(`/api/chat/queue?c=${convId}`).then((r) => (r.ok ? r.json() : [])).then((rows: Queued[]) => { if (rows.length) setQueue(rows); }).catch(() => {});
  }, [convId]);
  // The answer was asked from a page that has since closed (or another device): show «thinking», the answer as written so far,
  // and the saved answer when it's done. The same chat changed in another tab or on another device (a question, an answer, a
  // rename, a deletion) shows up without reloading (AI Soul Chat.tsx · lib/conv-sync.ts): a small stamp every 8 s — every 2 s
  // while an answer is being made elsewhere — and at once when the page comes back; the whole chat only when the stamp changed.
  const waiting = waitMs !== null && !busy;
  const msgsNow = useRef(msgs);
  msgsNow.current = msgs;
  const waitingNow = useRef(waiting);
  waitingNow.current = waiting;
  const titleNow = useRef(title);
  titleNow.current = title;
  useEffect(() => {
    if (!convId || busy) return;
    let alive = true, running = false, seen = "", timer: ReturnType<typeof setTimeout> | undefined;
    const look = async (): Promise<void> => {
      if (running || !alive) return;
      running = true; clearTimeout(timer);
      try {
        if (document.visibilityState !== "visible") return;
        const r = await fetch(`/api/conversations/${convId}?v=1`);
        if (!alive || busyRef.current) return;
        if (r.status === 404) { alive = false; window.dispatchEvent(new Event("uc:convs")); router.replace("/app"); return; }   // deleted on the other device
        if (!r.ok) return;
        const s = (await r.json()) as { v: string; answeringMs: number | null; draft: string | null };
        if (!alive) return;
        setDraft(s.answeringMs != null ? s.draft ?? "" : "");
        const first = !seen;
        if (s.v === seen) return;
        seen = s.v;
        if (first) return;   // the chat was just loaded (opened, or this page's own answer just ended)
        const d = await fetch(`/api/conversations/${convId}`).then((x) => (x.ok ? x.json() : null)) as { conversation: { title: string; answeringMs: number | null }; messages: Msg[] } | null;
        if (!alive || !d || busyRef.current || convNow.current !== convId) return;
        const next = mergeServer(d.messages, msgsNow.current);
        if (next) setMsgs(next);
        if (d.conversation.title !== titleNow.current) { setTitle(d.conversation.title); window.dispatchEvent(new Event("uc:convs")); }
        const ans = d.conversation.answeringMs != null && d.messages.at(-1)?.role === "user";
        if (waitingNow.current && !ans) { setDraft(""); if (document.visibilityState === "visible") gotIt(convId); }
        setWaitMs((w) => (ans ? w ?? d.conversation.answeringMs : null));
      } catch { /* the next look tries again */ } finally {
        running = false;
        if (alive) timer = setTimeout(() => void look(), waitingNow.current ? 2000 : 8000);
      }
    };
    const wake = () => void look();
    void look();
    document.addEventListener("visibilitychange", wake); window.addEventListener("focus", wake); window.addEventListener("online", wake);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); };
  }, [convId, busy, router]);
  useEffect(() => { atBottom.current = true; }, [convId]);   // another chat opens at the bottom
  useEffect(() => { if (atBottom.current) bottom.current?.scrollIntoView({ block: "end" }); }, [msgs, draft]);
  // Opened from a search hit (#m-<message>): go to that message and outline it for a moment (AI Soul Chat.tsx jump to the found message).
  // every answer's text, for the preview window's ◀ n/N ▶ (components/Markdown.tsx PreviewSet)
  const previewAnswers = useMemo(() => msgs.filter((m) => m.role === "assistant").map((m) => m.content), [msgs]);
  const jumped = useRef("");
  useEffect(() => {
    const h = typeof window === "undefined" ? "" : window.location.hash;
    if (!h.startsWith("#m-") || jumped.current === h) return;
    const el = document.getElementById(h.slice(1));
    if (!el) return;
    jumped.current = h; atBottom.current = false;
    el.scrollIntoView({ block: "center" });
    el.classList.add("ring-2", "ring-accent", "rounded-xl");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent", "rounded-xl"), 2500);
  }, [msgs]);
  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < 80) atBottom.current = true; else if (el.scrollTop < lastTop.current - 2) atBottom.current = false;
    lastTop.current = el.scrollTop;
    setShowDown(!atBottom.current && gap >= 80);
  };
  const jumpBottom = () => { atBottom.current = true; setShowDown(false); bottom.current?.scrollIntoView({ block: "end" }); };
  // The draft (typed text + unsent files) is read back after the page arrives, and only then written — before, the empty first
  // render wiped the saved draft on every reload (AI Soul components/draft.ts has the same guard).
  const [draftReady, setDraftReady] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const savedText = localStorage.getItem(draftKey) ?? "", savedFiles = readDraftFiles(localStorage, convId);
        if (savedText) setText((cur) => cur || savedText);
        if (savedFiles.length) setFiles((cur) => (cur.length ? cur : savedFiles));
      } catch { /* private mode */ }
      setDraftReady(draftKey);
    }, 0);
    return () => clearTimeout(id);
  }, [draftKey, convId]);
  useEffect(() => {
    if (draftReady !== draftKey) return;
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); writeDraftFiles(localStorage, convId, files); } catch { /* private mode */ }
  }, [draftReady, draftKey, text, files, convId]);

  async function upload(list: FileList | File[]) {
    for (const f of Array.from(list)) {
      if (f.size > MAX_BIG_UPLOAD) { alert(`${f.name}: ${t("Too big (max 500 MB)")}`); continue; }
      setUploading((n) => n + 1);
      setUpProg({ name: f.name, sent: 0, total: f.size });
      const fd = new FormData(); fd.append("file", f); if (convId) fd.append("conversationId", convId);
      if (FROM_GOOGLE.has(f)) fd.append("source", "google");
      const r = f.size > 4 * 1024 * 1024 ? await uploadBig(f, convId, (sent) => setUpProg({ name: f.name, sent, total: f.size }))   // in pieces (app/api/files/upload)
        : await fetch("/api/files", { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (r === "big_quota") alert(`${f.name}: ${t("Files over 50 MB can take up 1 GB in all, and this one doesn't fit. Delete some in Settings → My files, then attach it again.")}`);
      else if (r === "stopped") alert(`${f.name}: ${t("The upload stopped. Attach the same file again and it goes on from where it stopped.")}`);
      else if (!r?.id) alert(`${f.name}: ${t("Couldn't upload — try again")}`);
      setUpProg(null);
      setUploading((n) => n - 1);
      if (typeof r === "object" && r?.id) setFiles((fs) => [...fs, r]);
    }
  }

  // «Show and teach» (components/ShowTeach.tsx): the screenshots go up as attachments, then one message asks for the recipe.
  async function teach(shots: File[], words: string) {
    if (!shots.length) { alert(t("Nothing on the screen changed — try again and do the task while sharing.")); return; }
    const chips: FileChip[] = [];
    setUploading((n) => n + 1);
    for (const f of shots) {
      const fd = new FormData(); fd.append("file", f); if (convId) fd.append("conversationId", convId);
      const r = await fetch("/api/files", { method: "POST", body: fd }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as FileChip | null;
      if (r?.id) chips.push(r);
    }
    setUploading((n) => n - 1);
    const ask = t("🎬 I showed you a task on my screen ({n} screenshots, in order). Turn it into a recipe: the steps, what each one is for, which ones you can run for me now and which not yet, and what you'd need from me (a login, a time). Then offer to switch on the part you can do.", { n: chips.length });
    void send(words ? `${ask}\n\n${t("What I said while showing it")}: «${words.slice(0, 3000)}»` : ask, chips);
  }

  // replaceOf: «Ask again» / «Ask another AI» on any answer — that question and what follows are set aside, so it isn't asked twice (AI Soul Chat.tsx:509-519).
  const send = useCallback(async (qText?: string, qFiles?: FileChip[], useModel?: string, research?: boolean, replaceOf?: string) => {
    const att = qFiles ?? files;
    const q = (qText ?? text).trim() || att.map((f) => `📎 ${f.name}`).join("\n");   // files alone can be sent (AI Soul) — their names stand in for the question
    if (!q) return;
    if (qText === undefined) setText("");
    if (await setup.handle(q)) return;   // a key, Claude's code, or a question before any AI is connected — never sent to the AI
    if (askingName) {   // step 1's answer is their name: the server keeps the name alone, and step 2 shows at once — no AI call
      const guess = callName(q, lang);   // Korean/English right away — a cold server can take ~3 s; its answer (every language) replaces it
      if (guess) setCalled(guess);
      const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ call: q }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null) as { name?: string | null } | null;
      const n = r?.name || guess;
      setCalled(n || "-");
      if (n) return;
    }
    if (busy && !att.length && stopOnly(q)) { setText(""); stopRef.current(); return; }   // «stop» typed alone stops the answer (AI Soul) — a sentence still waits in the queue
    if (busy) {
      setText(""); setFiles([]);
      const saved = convId ? await fetch("/api/chat/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: convId, text: q, fileIds: att.map((f) => f.id) }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id: string } | null : null;
      setQueue((x) => [...x, { id: saved?.id, text: q, files: att }]);
      return;
    }
    const eo = replaceOf ?? (qText === undefined ? editOf : null);
    if (qText === undefined) { setText(""); setFiles([]); setEditOf(null); }
    setBusy(true);
    atBottom.current = true;   // sending always brings the latest into view
    setMsgs((m) => { const at = eo ? m.findIndex((x) => x.id === eo) : -1; const kept = at < 0 ? m : m.map((x, j) => (j >= at ? { ...x, superseded: true } : x)); return [...kept, { role: "user", content: q, files: att, created_at: new Date().toISOString() }, { role: "assistant", content: "" }]; });
    const sp = voiceRef.current ? speaker.current : null;
    const vs = sp ? { lang: sp.lang, current: sp.google ? sp.voice : "", askVoice: sp.google && ls.get(VK.asked) !== "1", offerAccent: ls.get(VK.offered) !== "1" } : undefined;
    const ctl = new AbortController();
    abort.current = ctl;
    const turn = crypto.randomUUID();
    turnNo.current = turn;
    setWaitMs(null);
    sentAt.current = Date.now(); slowSaid.current = "";
    if (voiceRef.current && !stopEar.current && !saying.current && ls.get(VK.sure) === "1") setTimeout(() => reviveRef.current(), 0);   // keep listening while thinking
    const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ conversationId: convId, projectId, text: q, model: (useModel ?? model) || null, fileIds: att.map((f) => f.id), turn, ...(eo ? { editOf: eo } : {}), ...(vs ? { voice: vs } : {}), ...(research ? { research: true } : {}) }) }).catch(() => null);
    if (!r || !r.ok || !r.body) {
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = r?.status === 400 ? { role: "assistant", content: t("Connect an AI first — type {cmd} here, or paste an AI key (Claude, ChatGPT or OpenRouter) in this box.", { cmd: `«${t("connect Claude")}»` }) } : { role: "assistant", content: t("Couldn't send this. Your question is kept — press «Send again»."), failed: true }; return c; });
      setBusy(false);
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let all = "";
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done) break;
      all += dec.decode(value, { stream: true });
      const head = all.split("\u0000")[0] ?? "";
      const statuses = [...head.matchAll(/\u0001([^\u0001]*)\u0001/g)].map((x) => x[1] ?? "");
      const shown0 = head.replace(/\u0001[^\u0001]*\u0001?/g, "");
      const shown = vs ? stripVoiceMarks(shown0) : shown0;   // app marks are hidden when drawn (the saved-login box needs its mark)
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: shown, status: statuses[statuses.length - 1] }; return c; });
    }
    setBusy(false);
    const metaRaw = all.split("\u0000")[1];
    if (!metaRaw) {   // the connection dropped mid-answer (not the ■ stop button): keep what came and offer to send again
      // voice mode was closed meanwhile: say it failed when it's opened again (AI Soul 3b2cbdb — a failed answer stayed silent)
      if (vs && convId && !voiceRef.current && !ctl.signal.aborted) missed.current = { text: t("Couldn't send this. Your question is kept — press «Send again»."), conv: convId, at: Date.now() };
      if (!ctl.signal.aborted) setMsgs((m) => { const c = [...m]; const last = c[c.length - 1]!; c[c.length - 1] = { ...last, content: last.content ? `${last.content}\n\n${t("Couldn't send this. Your question is kept — press «Send again».")}` : t("Couldn't send this. Your question is kept — press «Send again»."), failed: true }; return c; });
      return;
    }
    const meta = JSON.parse(metaRaw) as { text?: string; settings?: Record<string, string>; conversationId: string; messageId: string; questionId?: string; model?: string; title?: string; files?: FileChip[]; reminders?: string[]; memory?: MemoryChange | null; error?: string; voice?: { id?: string; offered?: boolean; end?: boolean }; build?: string; later?: true; context?: { summarized?: number; dropped?: number } };
    if (meta.error) { setMsgs((m) => { const c = [...m]; c[c.length - 1] = meta.error === "no_key" ? { role: "assistant", content: t("Connect an AI first — type {cmd} here, or paste an AI key (Claude, ChatGPT or OpenRouter) in this box.", { cmd: `«${t("connect Claude")}»` }) } : { role: "assistant", content: `⚠ ${meta.error}\n\n${t("Couldn't send this. Your question is kept — press «Send again».")}`, failed: true }; return c; }); return; }
    const notes = [...(meta.reminders ?? []),
      ...(meta.context?.dropped ? [`⚠ ${t("Long chat: the first {n} messages couldn't be summarized and weren't sent to the AI", { n: String(meta.context.dropped) })}`] : [])];
    // The saved answer has file blocks replaced by «📎 name»; reload the final text from the server copy.
    setMsgs((m) => { const c = [...m]; const last = c[c.length - 1]!; if (meta.questionId && c[c.length - 2]?.role === "user") c[c.length - 2] = { ...c[c.length - 2]!, id: meta.questionId }; c[c.length - 1] = { ...last, id: meta.messageId, files: meta.files, notes, summarized: meta.context?.summarized, memory: meta.memory ?? null, created_at: new Date().toISOString(), model: meta.model ?? (useModel ?? model) ?? null, content: meta.text ?? last.content.replace(/```(?:unchore-file|soul-file)[\s\S]*?(```|$)/g, "").replace(/<<<remind[\s\S]*?(<<<end>>>|$)/g, "").replace(/<<<remind-stop>>>/g, "").replace(/<<<nudge[^>]*>>>/g, "").trim() }; return c; });
    if (meta.settings) applyHere(meta.settings);
    if (meta.title) setTitle(meta.title);
    if (meta.conversationId !== convId) { skipLoad.current = meta.conversationId; try { localStorage.removeItem("uc_draft:new"); writeDraftFiles(localStorage, null, []); } catch { /* */ } router.replace(`/app?c=${meta.conversationId}`); }
    window.dispatchEvent(new Event("uc:convs"));
    if (document.visibilityState === "visible") gotIt(meta.conversationId);   // on screen → no «it's ready» notification (a hidden tab gets one)
    // «Make me an app» (lib/build.ts): the link comes as a new message a minute or two later — look for it while this chat stays open.
    // «🖥 <name>» still working (lib/computers.ts): its result comes the same way, often much later (a deploy takes most of an hour).
    if (meta.build || meta.later) {
      const cid = meta.conversationId, t0 = Date.now(), until = meta.later ? 90 * 60_000 : 12 * 60_000, job = meta.messageId, byVoice = Boolean(vs);   // left running from voice mode: its report is read in full
      const jobOver = () => setJobs((j) => j.filter((x) => x !== job));
      setJobs((j) => [...j, job]);
      const look = (): void => { if (convNow.current !== cid && convNow.current !== null) { jobOver(); return; } void fetch(`/api/conversations/${cid}`).then((r) => (r.ok ? r.json() : null)).then((d: { messages?: Msg[] } | null) => {
        const last = d?.messages?.[d.messages.length - 1];
        if (last && last.role === "assistant" && last.id !== meta.messageId && convNow.current === cid) { jobOver(); setMsgs(d!.messages!); window.dispatchEvent(new Event("uc:convs")); announceDone(last.content, byVoice ? cid : null); }
        else if (Date.now() - t0 < until) setTimeout(look, 8000);
        else jobOver();
      }).catch(jobOver); };
      setTimeout(look, 15_000);
    }
    const finalAnswer = hideMarks(readPicks(stripVoiceMarks(all.split("\u0000")[0]?.replace(/\u0001[^\u0001]*\u0001?/g, "") ?? "")).text);   // app marks (build, stop, nudge…) are never read aloud
    if (vs?.askVoice) ls.set(VK.asked, "1");
    if (meta.voice?.offered) ls.set(VK.offered, "1");
    if (meta.voice?.id && sp) { sp.voice = meta.voice.id; ls.set(VK.id, meta.voice.id); }
    // «I'll stop here» in any language — the AI marked <<<voice-end>>>: read the goodbye, then close voice mode as «End voice mode» does.
    // The ear stays on while the goodbye is read: talking over it calls off closing and goes on (lib/voice/goodbye.ts · AI Soul 624168d)
    const endVoice = () => { voiceRef.current = false; setVoice(false); stopEar.current?.(); stopBarge(); music.current?.stop(); stopSpeaking(); };
    const readIt = () => { if (!speaker.current || !voiceRef.current) return; saying.current = true; speaker.current.say(finalAnswer, () => { saying.current = false; stopBarge(); if (!voiceRef.current) return; if (meta.voice?.end) endVoice(); else startHearing(true); }); hearOver(finalAnswer, meta.voice?.end ? endVoice : undefined); };
    if (voiceRef.current && speaker.current && (stopEar.current || inCall.current)) readLater.current = readIt;   // still talking (see startHearing) or on a phone call (read after it)
    else if (voiceRef.current && speaker.current) readIt();
    else if (meta.voice?.end && voiceRef.current) endVoice();
    else if (vs && !voiceRef.current && !meta.voice?.end) missed.current = { text: finalAnswer, conv: meta.conversationId, at: Date.now() };
    const p = await fetch("/api/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: meta.messageId }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (p) setMsgs((m) => m.map((x) => (x.id === meta.messageId ? { ...x, proposal: p } : x)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startHearing is stable enough; re-creating send per keystroke is fine
  }, [text, files, busy, convId, projectId, model, t, router, lang, setup, askingName, setCalled, editOf]);
  sendRef.current = (q: string) => void send(q, []);
  /** «Send again» on a failed answer: drop the failed pair and send the same question with the same files. */
  const resend = (i: number) => {
    const q = msgs[i - 1];
    if (busy || q?.role !== "user") return;
    setMsgs((m) => m.slice(0, i - 1));
    void send(q.content, q.files ?? []);
  };

  /** A setting changed by asking: brightness lives on this device; language, AI list and names come back with a refresh. */
  function applyHere(ch: Record<string, string>) {
    if (ch.theme) { try { localStorage.setItem("uc_theme", ch.theme); } catch { /* private mode */ } const e = document.documentElement; const dark = ch.theme === "dark" || ch.theme === "night" || (ch.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); e.classList.toggle("dark", dark); e.classList.toggle("night", ch.theme === "night"); }
    if (ch.lang) document.cookie = `uc_lang=${encodeURIComponent(ch.lang)};path=/;max-age=31536000;samesite=lax`;   // the page's lang/dir follow at once
    if (ch.lang || ch.model || ch.keys || ch.name) router.refresh();
  }

  // Send the next waiting message when the current answer finishes (held ones wait for «Send»). A server copy is taken first,
  // so the minute timer (lib/queue.ts drainQueue) never sends the same one too.
  useEffect(() => {
    const next = queue.find((x) => !x.held);
    if (busy || !next) return;
    const id = setTimeout(async () => {
      setQueue((x) => x.filter((y) => y !== next));
      const mine = next.id ? await fetch(`/api/chat/queue?id=${next.id}`, { method: "DELETE" }).then((r) => (r.ok ? r.json() : { taken: false })).then((j: { taken: boolean }) => j.taken).catch(() => false) : true;
      if (mine) void send(next.text, next.files);
      else {
        window.dispatchEvent(new Event("uc:convs"));
        // Taken by someone else — often the answer itself (lib/interject.ts): show the chat as saved, with that message in its place.
        if (convId) void fetch(`/api/conversations/${convId}`).then((r) => (r.ok ? r.json() : null)).then((d: { messages: Msg[] } | null) => { if (d && !busyRef.current) setMsgs(d.messages); }).catch(() => {});
      }
    }, 0);
    return () => clearTimeout(id);
  }, [busy, queue, send, convId]);
  const patchQueued = (qq: Queued, body: { text?: string; held?: boolean }) => {
    setQueue((x) => x.map((y) => (y === qq ? { ...y, ...body } : y)));
    if (qq.id) void fetch(`/api/chat/queue?id=${qq.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };
  const dropQueued = (qq: Queued) => {
    setQueue((x) => x.filter((y) => y !== qq));
    if (qq.id) void fetch(`/api/chat/queue?id=${qq.id}`, { method: "DELETE" }).catch(() => {});
  };
  /** ■ Stop: the answer stops, and what was waiting stays but isn't sent until «Send» (AI Soul: held after stop). */
  /** Stop the answer being made: the server keeps answering after the page lets go, so it is told which turn to stop. */
  const halt = () => {
    const ctl = abort.current, turn = turnNo.current;
    if (!turn) { ctl?.abort(); return; }
    // the stop goes first, so the server — which looks again the moment the page lets go — stops at once (lib/turn.ts watchStop)
    void fetch("/api/chat/stop", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ turn }) })
      .catch(() => null).finally(() => ctl?.abort());
  };
  const stopAnswer = () => { for (const qq of queue) if (!qq.held) patchQueued(qq, { held: true }); halt(); };
  const stopRef = useRef(stopAnswer);
  stopRef.current = stopAnswer;
  /** «Send now»: stop the answer being written and send this one right away. */
  const sendNow = (qq: Queued) => { setQueue((x) => [{ ...qq, held: false }, ...x.filter((y) => y !== qq)]); if (qq.held) patchQueued(qq, { held: false }); halt(); };
  /** «Send all» (AI Soul QueueBar): the held messages go as one question, in the order they were written. */
  const sendAllHeld = () => {
    const held = queue.filter((x) => x.held);
    if (held.length < 2) return;
    for (const qq of held) if (qq.id) void fetch(`/api/chat/queue?id=${qq.id}`, { method: "DELETE" }).catch(() => {});
    const one: Queued = { text: held.map((x) => x.text).join("\n\n"), files: held.flatMap((x) => x.files) };
    if (busy) { setQueue((x) => [one, ...x.filter((y) => !y.held)]); halt(); }
    else { setQueue((x) => x.filter((y) => !y.held)); void send(one.text, one.files); }
  };

  /** Why the natural (Google) voice stopped: the welcome credit pays for it (owner 2026-10-01), and there are daily minutes. */
  const voiceLimitNote = (why: string) => why === "no_credit"
    ? t("The free credit for the natural voice is used up — the phone's own voice reads from now on.")
    : t("Today's 60 minutes of the natural voice are used up — the phone's own voice reads for the rest of the day.");
  /** Which Google voice to use for this language, and whether today's allowance is left (/api/voice). */
  async function prepareVoice(l: string) {
    const r = (await fetch(`/api/voice?lang=${encodeURIComponent(l)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null)) as { google: boolean; why: string | null; locale: string; voice: string } | null;
    const sp = speaker.current;
    if (!sp || !r) return;
    sp.google = r.google;
    if (!r.google && (r.why === "daily_limit" || r.why === "no_credit")) setVoiceNote(voiceLimitNote(r.why));
    if (!sp.voice || !fits(sp.voice, r.locale)) { sp.voice = r.voice; ls.set(VK.id, r.voice); }
  }
  /** What Unchore said last (voice mode) — to drop it if the microphone picked it up from the speaker. */
  function lastSaid(): string {
    const m = [...msgsRef.current].reverse().find((x) => x.role === "assistant");
    return `${m ? stripVoiceMarks(m.content) : ""} ${slowSaid.current}`.trim();
  }
  /** Tells the member why nothing was heard and what to do; hides 🎤 when pressing it again can't help. */
  function tellMic(why: MicTrouble | null) {
    if (!why) return;
    if (MIC_FATAL.has(why)) setMicDead(true);
    const line = why === "denied" ? t("Unchore isn't allowed to use the microphone. Allow it in your browser's site settings, or use your keyboard's microphone.")
      : why === "blocked" ? t("This browser can't turn speech into text. Use your keyboard's microphone instead.")
      : why === "no-mic" ? t("No microphone was found. Connect one, or use your keyboard's microphone.")
      : why === "offline" ? t("Speech-to-text needs the internet. Check your connection and press 🎤 again.")
      : why === "no-lang" ? t("This browser can't take dictation in this language. Use your keyboard's microphone instead.")
      : why === "silent" ? t("Nothing was heard. Press 🎤 and speak again.")
      : t("The microphone stopped. Press 🎤 to try again.");
    setMicNote(line);
    if (micNoteTimer.current) clearTimeout(micNoteTimer.current);
    micNoteTimer.current = setTimeout(() => setMicNote(""), 8000);
  }
  /** A rejected/broken microphone is not silence: don't repeatedly start it again. */
  function hearingFailed(autoSend: boolean, error: string) {
    setHearing(false); stopEar.current = null;
    tellMic(micTrouble(error, ""));
    if (!autoSend) return;
    voiceRef.current = false; setVoice(false); readLater.current = null; announcePend.current = null;
    stopBarge(); speaker.current?.stop(); music.current?.stop(); stopSpeaking(); saying.current = false;
  }
  function startHearing(autoSend: boolean) {
    if (autoSend && pausedRef.current && !ptt.current) { setHearing(false); return; }   // on a break: wait for «▶ Listen again»
    const pend = announcePend.current;
    if (pend && autoSend && voiceRef.current && speaker.current && !ptt.current && !busyRef.current) { announcePend.current = null; sayAnnounce(pend); return; }
    speaker.current?.stop(); stopSpeaking(); saying.current = false; lastEar.current = Date.now();
    setHearing(true);
    // Voice mode, language not known yet: record the first words and let the server tell the language — nobody picks one.
    if (autoSend && voiceRef.current && ls.get(VK.sure) !== "1") {
      const rec = recordUtterance(speaker.current?.audio());
      stopEar.current = rec.stop;
      void rec.done.then(async (w) => {
        if (ptt.current) return;   // «hold to talk» took over the ear
        stopEar.current = null;
        if (pausedRef.current) { setHearing(false); return; }   // «⏸ Take a break» cut it off — don't send the scrap
        if (!w) { setHearing(false); if (autoSend) listenAgain(); return; }
        const r = (await fetch("/api/voice/hear", { method: "POST", headers: { "content-type": "audio/wav" }, body: w as BodyInit }).then((x) => (x.ok ? x.json() : null)).catch(() => null)) as { lang: string; text: string } | null;
        setHearing(false);
        if (!voiceRef.current) return;
        ls.set(VK.sure, "1");   // heard or not, from now on the browser listens (free) in the best language we know
        if (r?.lang) { ls.set(VK.lang, r.lang); if (speaker.current) speaker.current.lang = r.lang; await prepareVoice(r.lang); }
        const heard = r?.text ? dropEcho(r.text, lastSaid()) : "";   // our own last words picked up by the mic
        if (heard) sendRef.current(heard); else startHearing(true);
      });
      return;
    }
    const draft = autoSend ? "" : text;
    stopEar.current = listen(ls.get(VK.lang) ?? lang, (heard) => setText(joinSpoken(draft, heard)), (final, error) => {
      if (ptt.current) return;   // «hold to talk» took over the ear (its own listener holds stopEar now)
      setHearing(false);
      stopEar.current = null;
      if (autoSend && pausedRef.current) return;   // «⏸ Take a break» cut it off — don't send the scrap
      if (!autoSend && final.trim()) setText(joinSpoken(draft, final.trim()));
      if (error) { hearingFailed(autoSend, error); return; }
      if (!autoSend && !final.trim()) tellMic("silent");
      const heard = autoSend && final ? dropEcho(final, lastSaid()) : final;   // our own last words picked up by the mic
      const later = readLater.current; readLater.current = null;
      if (autoSend && later && !heard) { later(); return; }   // the answer came while they were talking and they said no more — read it now
      if (autoSend && final && (!heard || musicCrumb(heard, jobsRef.current > 0))) { startHearing(true); return; }   // our own words, or a scrap of the music
      if (autoSend && !final) { listenAgain(); return; }   // nothing heard (silence, or the page went away) — listen again on screen
      if (autoSend && heard) {
        setText("");
        if (busyRef.current) {   // said while the answer is being made (AI Soul «listen while thinking»)
          const join = whileThinking(sentAt.current, Date.now()) === "merge";
          sendRef.current(heard);   // waits in the queue …
          if (join) halt();   // … or, right after asking, stops this answer so the added words go at once
          else startHearing(true);
          return;
        }
        sendRef.current(heard);
      }
    });
  }
  /** A job left running (an app build) finished while voice mode is on: a «ding» and its first sentence, then listening again
   *  (AI Soul VoiceMode «띵» + one sentence). Not over the member's own words — it waits for the pause, like an answer does;
   *  if something else is already waiting to be read, the message just shows on screen. */
  /** A job left running from voice mode (`byVoice` = its chat) reads its whole report, whether or not the switch is on (AI Soul
   *  f5febae); «🎙 Hold to talk» or talking over it stops it. Voice mode closed meanwhile: read when it's opened again here. */
  function announceDone(text: string, byVoice: string | null = null) {
    const report = byVoice ? reportSpeech(text) : "";
    if (report) {
      const line = `${t("Here's what came back from the job you left running.")}\n${report}`;
      if (!voiceRef.current || !speaker.current) { missed.current = { text: line, conv: byVoice!, at: Date.now() }; return; }
      if (announceWaits({ saying: saying.current, holding: !!ptt.current, busy: busyRef.current })) { announcePend.current = line; return; }
      sayAnnounce(line);
      return;
    }
    const line = announceLine(text);
    if (!voiceRef.current || !speaker.current || !line || !announceOn(ls.get(ANNOUNCE_KEY))) return;
    if (announceWaits({ saying: saying.current, holding: !!ptt.current, busy: busyRef.current })) { announcePend.current = line; return; }   // not dropped: read when this ends
    sayAnnounce(line);
  }
  function sayAnnounce(line: string) {
    const say = () => {
      if (!speaker.current || !voiceRef.current) return;
      ding(); saying.current = true;
      setTimeout(() => { speaker.current?.say(line, () => { saying.current = false; stopBarge(); if (voiceRef.current) startHearing(true); }); hearOver(line); }, 450);
    };
    if (stopEar.current || inCall.current) { if (!readLater.current) readLater.current = say; }
    else say();
  }
  /** «🎙 Hold to talk»: pressing stops what is being read or answered and listens; a pause while held doesn't send. */
  function pttDown() {
    if (!voiceRef.current || ptt.current?.on) return;
    stopEar.current?.(); stopEar.current = null; stopBarge(); speaker.current?.stop(); music.current?.stop(); stopSpeaking();
    saying.current = false; readLater.current = null;
    if (busyRef.current) halt();
    ptt.current = { on: true, said: "" };
    pttListen();
  }
  function pttListen() {
    const p = ptt.current; if (!p) return;
    setHearing(true);
    stopEar.current = listen(ls.get(VK.lang) ?? lang, (heard) => setText(joinSpoken(p.said, heard)), (final, error) => {
      stopEar.current = null;
      if (final.trim()) p.said = joinSpoken(p.said, final.trim());
      if (error) { p.on = false; tellMic(micTrouble(error, "")); }   // a broken microphone ends the hold instead of retrying while held
      if (ptt.current === p && p.on) { pttListen(); return; }   // still held: the recogniser stopped on a pause — keep listening
      ptt.current = null; setHearing(false); setText("");
      const heard = dropEcho(p.said, lastSaid());
      if (heard) sendRef.current(heard); else if (voiceRef.current) startHearing(true);
    }, { rest: false });   // held: listen at once — no app rest between ears (it would drop the first words)
  }
  /** Letting go: the ear stops and what was heard is sent at once (no guessing the end from silence). */
  function pttUp() { const p = ptt.current; if (!p?.on) return; p.on = false; stopEar.current?.(); }
  /** Stop the ear that listens while reading (its last words are dropped). */
  function stopBarge() { const s = bargeEar.current; bargeEar.current = null; s?.(); }
  /** While `spoken` is read aloud, keep listening: if the user talks over it (not our own voice coming back), stop reading and
   *  take what they say as their next message. Not on iPhones (the mic hears the speaker too much); after two mishears the bar goes up instead of off.
   *  `close`: `spoken` is the goodbye — a mishear that stopped it closes voice mode instead of listening again. */
  function hearOver(spoken: string, close?: () => void) {
    // Not on iPhones (the mic hears the speaker too much), nor in the app: its dictation running while it talks was 45% of its
    // «error 5» lock-ups (AI Soul 808fccd) — there «🎙 Hold to talk» or a tap stops the reading instead.
    if (!micOk || ls.get(VK.sure) !== "1" || /iPhone|iPad|iPod/.test(navigator.userAgent) || nativeBridge()) return;
    let at: Barge | null = null;
    const counts = (b: Barge) => b.hit && (bargeMiss.current < 2 || b.stop || b.novel >= 8);
    const me = listen(ls.get(VK.lang) ?? lang, (heard) => {
      if (at || bargeEar.current !== me) return;
      const b = bargeCheck(heard, spoken);
      if (counts(b)) { at = b; speaker.current?.stop(); saying.current = false; setHearing(true); }
    }, (final, error) => {
      if (bargeEar.current !== me) return;   // stopped by us — reading ended or voice mode closed
      bargeEar.current = null;
      if (error) { hearingFailed(true, error); return; }
      if (!at) {
        // no partial words came (some phones) — the finished piece decides: the user's words at its end stop the reading and go on as the next question
        const f = bargeFinal(final, spoken);
        if (counts(f) && f.user && voiceRef.current) { speaker.current?.stop(); saying.current = false; sendRef.current(f.user); return; }
        if (saying.current && voiceRef.current) hearOver(spoken, close);   // silence ended the ear — keep listening while reading
        return;
      }
      setHearing(false);
      const end = bargeCheck(final, spoken);
      const next = afterTalkOver(Boolean(close), bargeReal(at, end), end.user);
      if (next === "send") { sendRef.current(end.user); return; }
      bargeMiss.current++;   // the speaker was misheard as the user
      if (voiceRef.current) { if (next === "close") close?.(); else startHearing(true); }
    });
    bargeEar.current = me;
  }
  // Started typing / voice mode on: have the member's own Claude or ChatGPT plan program started on the worker, so the first words
  // come sooner (app/api/chat/warm). At most once a minute per kind — the worker keeps one for 3 minutes.
  const warmAt = useRef({ text: 0, voice: 0 });
  function warmUp(voiceOn: boolean) {
    const k = voiceOn ? "voice" : "text";
    if (Date.now() - warmAt.current[k] < 60_000) return;
    warmAt.current[k] = Date.now();
    void fetch("/api/chat/warm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: convId, projectId, model: model || null, voice: voiceOn }) }).catch(() => {});
  }
  function togglePause() {
    if (pausedRef.current) { pausedRef.current = false; setPaused(false); startHearing(true); return; }
    pausedRef.current = true; setPaused(true);
    stopEar.current?.(); stopEar.current = null; stopBarge(); speaker.current?.stop(); stopSpeaking(); saying.current = false; setHearing(false);
  }
  function toggleMute() {
    const on = !muted; setMuted(on);
    if (speaker.current) speaker.current.muted = on;
    // reading now: cut it off and go back to listening (a stopped reading doesn't call its own «done»)
    if (on && saying.current) { speaker.current?.stop(); stopSpeaking(); saying.current = false; stopBarge(); if (voiceRef.current) startHearing(true); }
  }
  function toggleVoice() {
    if (voice) { pausedRef.current = false; setPaused(false); setVoice(false); announcePend.current = null; stopEar.current?.(); stopBarge(); speaker.current?.stop(); music.current?.stop(); stopSpeaking(); return; }
    const sp = (speaker.current ??= new Speaker(ls.get(VK.id) ?? "", ls.get(VK.lang) ?? (navigator.language || lang), false));
    sp.muted = muted;
    sp.unlock();   // inside the tap — iPhones only play sound unlocked by a tap
    (music.current ??= new ThinkMusic()).unlock();
    sp.onLimit = (why) => setVoiceNote(voiceLimitNote(why));
    sp.onEngine = setVoiceEngine;
    voiceRef.current = true;
    setVoice(true);
    warmUp(true);
    void prepareVoice(sp.lang);
    const m = missed.current; missed.current = null;
    if (m && missedFresh(m, convNow.current, Date.now())) { saying.current = true; sp.say(m.text, () => { saying.current = false; stopBarge(); if (voiceRef.current) startHearing(true); }); hearOver(m.text); return; }
    startHearing(true);
  }
  async function changeModel(v: string) {
    setModel(v);
    if (convId) await fetch(`/api/conversations/${convId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: v || null }) });
  }
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const modelLabel = (id: string) => models.find((x) => x.id === id)?.label ?? id;
  /** The earlier answer this one replaced through «Ask another AI» (same question, set aside, a different AI) — AI Soul Chat.tsx pairOf. */
  const pairOf = (i: number): number | null => {
    const m = msgs[i], q = msgs[i - 1];
    if (!m || m.role !== "assistant" || m.superseded || !m.content || !m.model || q?.role !== "user") return null;
    for (let j = i - 2; j >= 1; j--) {
      const o = msgs[j]!, oq = msgs[j - 1]!;
      if (o.role === "assistant" && o.superseded && o.content && oq.role === "user" && oq.content === q.content) return o.model && o.model !== m.model ? j : null;
    }
    return null;
  };
  // Empty first screen on a computer: greeting and input box sit together in the middle (AI Soul 158a09a); phones keep the box at the bottom.
  const first = msgs.length === 0 && hasKey && onboarded && !setup.before && !setup.after;
  const hour = useClientValue(() => new Date().getHours(), 12);
  const hello = t(hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

  return (
    <div className={`h-full flex flex-col${first ? " md:justify-center" : ""}`} onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}>
      <div ref={scroller} onScroll={onScroll} className={`flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-4 ${first ? "md:flex-initial md:min-h-0" : ""}`}>
        <div className={`w-full mx-auto max-w-3xl flex flex-col gap-4${face === "senior" ? " text-lg" : ""}`}>
          {setup.before}
          {askingName && (
            <div className="max-w-full">
              <Markdown text={askName(t)} copyLabel={t("Copy")} copiedLabel={t("Copied")} decideLabel={t("Your decision")} />
              {name && <Picks items={[name]} onPick={(x) => void send(x, [])} />}
            </div>
          )}
          {msgs.length === 0 && hasKey && !onboarded && browser && called !== "" && (
            <div className="max-w-full">
              <Markdown text={greeting(t, called === "-" ? "" : called)} copyLabel={t("Copy")} copiedLabel={t("Copied")} decideLabel={t("Your decision")} />
              <Picks items={PICKS.map((p) => t(p.en))} onPick={(x) => void send(x, [])} />
            </div>
          )}
          {msgs.length === 0 && hasKey && onboarded && (
            <div className="pt-16 md:pt-0 text-center px-6 pb-2">
              <div className="text-2xl md:text-3xl font-semibold min-h-[2.5rem]">{hello}</div>
              <div className="text-subtle mt-1">{t("Ask anything")}</div>
              <div className="text-sm text-faint mt-2">{t("If it's worth repeating, I'll offer to handle it from now on.")}</div>
              <TurnLine />
              <FounderPicks onPick={(x) => void send(x, [])} />
              {projectId ? null : <div className="md:hidden"><HomeList /></div>}
            </div>
          )}
          <PreviewSet.Provider value={previewAnswers}>
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} id={m.id ? `m-${m.id}` : undefined} className={`self-end max-w-[85%] flex flex-col items-end gap-1${m.superseded ? " opacity-40" : ""}`} data-superseded={m.superseded ? "1" : undefined}>
              {m.files?.length ? <FileRow files={m.files} /> : null}
              <div className="rounded-2xl bg-bubble px-4 py-2 whitespace-pre-wrap break-words">{m.content.startsWith("⏰") ? m.content.split("\n\n")[0] : m.content}</div>
              {!m.content.startsWith("⏰") && (
                <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted opacity-70 group-hover:opacity-100">
                  {m.created_at && <span className="px-1">{whenShort(m.created_at, lang)}</span>}
                  <CopyBtn text={m.content} label={t("Copy")} done={t("Copied")} className={pill} />
                  {!m.superseded && <button className={pill} onClick={() => { setText(m.content); setEditOf(m.id ?? null); }} data-testid="edit-question">{t("Edit")}</button>}
                </div>
              )}
            </div>
          ) : (
            <div key={i} id={m.id ? `m-${m.id}` : undefined} className={`max-w-full group${m.superseded ? " opacity-40" : ""}`} data-superseded={m.superseded ? "1" : undefined}>
              {m.summarized ? <ContextNote conversationId={convId} summarized={m.summarized} /> : null}
              {m.status && <div className="mb-2 w-fit max-w-full rounded-lg bg-panel px-3 py-1.5 text-xs text-fg-2">⚡ {m.status}</div>}
              {m.model && m.content && <div className="mb-1 w-fit rounded-md bg-panel px-2 py-0.5 text-[11px] text-muted">{t("Answered by {model}", { model: modelLabel(m.model) })}</div>}
              {m.content ? <Answer text={plain(m.content)} folded={m.role === "assistant" && !(busy && i === msgs.length - 1)} labels={{ copy: t("Copy"), copied: t("Copied"), decide: t("Your decision"), details: t("Show details") }} /> : <Thinking />}
              {readSecretAsks(m.content).names.map((n) => <SecretBox key={n} name={n} />)}
              {m.role === "assistant" && m.content && !(busy && i === msgs.length - 1) && <ReplyCard content={m.content} from={readFrom(msgs.slice(0, i).findLast((x) => x.role === "user")?.content ?? "")} />}
              {m.role === "assistant" && m.content && !(busy && i === msgs.length - 1) && <NewTextCard content={m.content} received={msgs.some((x) => x.role === "user" && readFrom(x.content ?? "") !== null)} />}
              {m.files?.length ? <div className="mt-2"><FileRow files={m.files} /></div> : null}
              {m.notes?.map((n, j) => <div key={j} className="mt-1 text-xs text-muted">{n}</div>)}
              {m.memory && <MemoryLine mem={m.memory} />}
              {m.content && !(busy && i === msgs.length - 1) && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted opacity-70 group-hover:opacity-100">
                  {m.created_at && <span className="px-1">{whenShort(m.created_at, lang)}{took(msgs, i, t) ? ` · ${took(msgs, i, t)}` : ""}</span>}
                  <CopyBtn text={plain(m.content)} label={t("Copy")} done={t("Copied")} className={pill} />
                  {m.role === "assistant" && (() => { const k = docPreview(plain(m.content)); return k ? <DocPreviewBtn text={plain(m.content)} kind={k} className={pill} /> : null; })()}
                  <button className={pill} onClick={() => { if (reading === i) { stopSpeaking(); setReading(null); } else { setReading(i); speak(plain(m.content), lang, () => setReading(null)); } }}>{reading === i ? `■ ${t("Stop reading")}` : `🔊 ${t("Read aloud")}`}</button>
                  {m.failed && <button className="rounded-md bg-ink text-on-ink px-2.5 py-0.5" disabled={busy} onClick={() => resend(i)} data-testid="resend-failed">↻ {t("Send again")}</button>}
                  {m.role === "assistant" && m.id && !m.failed && (reported.includes(m.id) ? <span className="px-1">{t("Thanks — we'll look at it.")}</span>
                    : <button className={pill} onClick={() => setReportFor(reportFor === m.id ? null : m.id!)} data-testid="report">⚑ {t("Report")}</button>)}
                  {i === msgs.length - 1 && lastUser && !m.failed && <button className={pill} onClick={() => void send(t("Please explain your last answer again in simpler words, for someone new to this."), [])}>{t("Simpler")}</button>}
                  {!m.failed && !m.superseded && msgs[i - 1]?.role === "user" && (i === msgs.length - 1 || msgs[i - 1]?.id) && (() => { const q = msgs[i - 1]!; const again = (mid?: string) => void send(q.content, q.files ?? [], mid, undefined, q.id); return <>
                    <button className={pill} disabled={busy} onClick={() => again()} data-testid="ask-again">↻ {t("Ask again")}</button>
                    {pairOf(i) !== null && <button className={pill} aria-expanded={sbs === i} onClick={() => setSbs(sbs === i ? null : i)} data-testid="side-by-side-open">⇆ {t("Side by side")}</button>}
                    {models.length > 1 && (() => {
                      // The member picks which AI answers (AI Soul Chat.tsx «다른 AI 에게» opens the picker) — with only one other, it goes straight there.
                      // On a phone the list is a full-width sheet above the box: hung from the button it ran off the right edge (live photo 10/2 09:54).
                      const cur = m.model ?? model; const others = models.filter((x) => x.id !== cur);
                      const ask = (id: string) => { setOtherFor(null); void changeModel(id); again(id); };
                      return <span className="relative">
                        <button className={pill} disabled={busy} aria-expanded={otherFor === i} onClick={() => (others.length === 1 ? ask(others[0]!.id) : setOtherFor(otherFor === i ? null : i))} data-testid="ask-other">{t("Ask another AI")}{others.length > 1 ? " ▾" : ""}</button>
                        {otherFor === i && others.length > 1 && (
                          <span className="fixed inset-x-3 bottom-24 z-30 md:absolute md:inset-x-auto md:left-0 md:bottom-full md:mb-1 md:w-64 max-h-64 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl text-sm text-fg" data-testid="ask-other-list">
                            {others.map((x) => <button key={x.id} type="button" className="block w-full text-left px-3 py-1.5 hover:bg-hover truncate" onClick={() => ask(x.id)}>{x.label}</button>)}
                          </span>
                        )}
                      </span>;
                    })()}
                  </>; })()}
                </div>
              )}
              {sbs === i && pairOf(i) !== null && (() => { const pair = [msgs[pairOf(i)!]!, m]; return (
                <div className="mt-2" data-testid="side-by-side">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted"><span className="font-medium">⇆ {t("Side by side")}</span><button className={`ml-auto ${pill}`} onClick={() => setSbs(null)} data-testid="side-by-side-close">{t("Close")}</button></div>
                  {/* computer: two columns · phone: one at a time, swipe sideways (AI Soul SideBySide) */}
                  <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory md:overflow-visible">
                    {pair.map((x, k) => (
                      <div key={k} className="snap-start shrink-0 w-[85%] md:w-auto md:flex-1 md:min-w-0 rounded-lg border border-line p-3" data-testid="side-by-side-col">
                        {x.model && <div className="mb-1 w-fit rounded-md bg-panel px-2 py-0.5 text-[11px] text-muted">{t("Answered by {model}", { model: modelLabel(x.model) })}</div>}
                        <Answer text={plain(x.content)} folded={false} labels={{ copy: t("Copy"), copied: t("Copied"), decide: t("Your decision"), details: t("Show details") }} />
                      </div>
                    ))}
                  </div>
                </div>
              ); })()}
              {m.id && reportFor === m.id && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs" data-testid="report-reasons">
                  <span className="px-1 text-muted">{t("What's wrong with this answer?")}</span>
                  <button className={pill} onClick={() => report(m.id!, "harmful")}>{t("Harmful or offensive")}</button>
                  <button className={pill} onClick={() => report(m.id!, "false")}>{t("False or misleading")}</button>
                  <button className={pill} onClick={() => report(m.id!, "other")}>{t("Something else")}</button>
                  <button className={pill} onClick={() => setReportFor(null)}>{t("Cancel")}</button>
                </div>
              )}
              {m.role === "assistant" && m.content && !(busy && i === msgs.length - 1) && (() => { const ls = screenLinks(m.content); return ls.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="screen-links">
                  {ls.map((l) => <Link key={l.href} href={l.href} className="rounded-full border border-line-2 px-3 py-1 text-sm hover:bg-hover">{t("Go to {screen}", { screen: l.label })} →</Link>)}
                </div>
              ) : null; })()}
              {i === msgs.length - 1 && !busy && readPicks(m.content).picks.length > 0 && <Picks items={readPicks(m.content).picks} onPick={(x) => void send(x, [])} />}
              {i === msgs.length - 1 && !busy && m.role === "assistant" && !m.failed && yesNoAsk(m.content, lang) && <Picks items={[t("Yes"), t("No")]} onPick={(x) => void send(x, [])} testId="quick-yes-no" />}
              {m.id && !(busy && i === msgs.length - 1) ? <GoogleCards messageId={m.id} content={m.content} done={m.gdone ?? []} /> : null}
              {m.id && !(busy && i === msgs.length - 1) ? <MetaCards messageId={m.id} content={m.content} done={m.mdone ?? []} /> : null}
              {m.id && !(busy && i === msgs.length - 1) ? <HfCards messageId={m.id} content={m.content} /> : null}
              {m.id && !(busy && i === msgs.length - 1) ? <RememberCard content={m.content} /> : null}
              {m.proposal && <OfferCard p={m.proposal} />}
            </div>
          ))}
          </PreviewSet.Provider>
          {waiting && <div className="max-w-full">
            {draft && <Answer text={plain(draft)} folded={false} labels={{ copy: t("Copy"), copied: t("Copied"), decide: t("Your decision"), details: t("Show details") }} />}
            <Thinking ms={waitMs ?? 0} />
          </div>}
          {setup.after}
          <div ref={bottom} />
        </div>
      </div>
      <div className={`bg-page px-3 md:px-6 pb-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${first ? "md:pb-[10vh]" : "border-t border-line pt-3"}`}>
        <div className="relative mx-auto max-w-3xl flex flex-col gap-1">
          {showDown && <button type="button" onClick={jumpBottom} aria-label={t("Jump to the latest")} title={t("Jump to the latest")} data-testid="scroll-bottom" className="absolute -top-14 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full border border-line bg-surface shadow text-lg hover:bg-hover">↓</button>}
          <BuildLine conversationId={convId} version={`${msgs.length}:${busy}:${jobs.length}`} sending={busy} onSay={(x) => void send(x)} />
          <ConversationTasks conversationId={convId} version={`${msgs.length}:${busy}`} onSay={(x) => void send(x)} />
          <PersonalUITip lang={lang} onAsk={setText} eligible={onboarded && !busy && !voice && !text.trim() && !queue.length && msgs.at(-1)?.role === "assistant" && !msgs.at(-1)?.failed && !!msgs.at(-1)?.content?.trim() && !/```(?:decide|decision|secret|결정|비밀값)|<<<|\[\[(?:approve|confirm)/i.test(msgs.at(-1)?.content ?? "")} />
          {queue.length > 0 && (
            <div className="flex flex-col gap-1">
              {queue.filter((x) => x.held).length > 1 && <button type="button" onClick={sendAllHeld} className="self-end rounded-md bg-ink text-on-ink px-2 py-0.5 text-xs" data-testid="queued-send-all">{t("Send all as one")}</button>}
              {queue.map((qq, i) => (
                <div key={qq.id ?? i} className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-fg-2" data-testid="queued">
                  <button type="button" className="flex-1 min-w-0 truncate text-left" title={t("Edit")} onClick={() => { const n = prompt(t("Edit"), qq.text); if (n?.trim() && n.trim() !== qq.text) patchQueued(qq, { text: n.trim() }); }}>{qq.held ? "⏸" : "⏳"} {qq.text}{qq.files.length ? ` · 📎${qq.files.length}` : ""}</button>
                  <span className="hidden md:inline text-xs text-muted">{qq.held ? t("Held after Stop") : t("Queued — sends when this answer finishes")}</span>
                  {qq.held
                    ? <button type="button" onClick={() => (busy ? sendNow(qq) : patchQueued(qq, { held: false }))} className="shrink-0 rounded-md bg-ink text-on-ink px-2 py-0.5 text-xs" data-testid="queued-send">{t("Send")}</button>
                    : busy ? <button type="button" onClick={() => sendNow(qq)} className="shrink-0 rounded-md border border-line-2 px-2 py-0.5 text-xs hover:bg-hover" title={t("Stop this answer and send this now")}>{t("Send now")}</button> : null}
                  <button onClick={() => dropQueued(qq)} className="text-muted hover:text-fg" aria-label={t("Remove")}>×</button>
                </div>
              ))}
            </div>
          )}
          {(files.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the member's own upload, a 20 px thumbnail served by our API */}
              {files.map((f) => <span key={f.id} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs" data-testid="attachment-chip"><a href={fileOpenHref(f)} target="_blank" rel="noreferrer" title={f.name} className="flex items-center gap-1 min-w-0 hover:underline" data-testid="attachment-chip-open">{f.mime.startsWith("image/") ? <img src={`/api/files/${f.id}?view=1`} alt="" className="w-5 h-5 rounded object-cover" /> : "📎"} <span className="truncate max-w-[180px]">{f.name}</span></a> <span className="text-muted">{kb(f.size)}</span><button onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} className="text-muted hover:text-fg" aria-label={t("Remove")}>×</button></span>)}
              {uploading > 0 && (upProg && upProg.total > 0
                ? <div className="basis-full text-xs text-muted" data-testid="upload-progress"><div className="flex justify-between gap-2"><span className="truncate">📤 {upProg.name}</span><span className="whitespace-nowrap">{(upProg.sent / 1048576).toFixed(1)} / {(upProg.total / 1048576).toFixed(1)}MB · {Math.round((upProg.sent / upProg.total) * 100)}%</span></div><div className="h-1.5 rounded-full bg-line mt-0.5 overflow-hidden" role="progressbar" aria-label={t("Uploading…")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((upProg.sent / upProg.total) * 100)}><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round((upProg.sent / upProg.total) * 100)}%` }} /></div></div>
                : <span className="text-xs text-muted animate-pulse">{t("Uploading…")}</span>)}
            </div>
          )}
          {voice && <div data-voice-on className="rounded-lg bg-accent-bg px-3 py-1.5 text-sm flex flex-wrap items-center gap-2">🎧 {paused ? t("Paused") : hearing ? t("Listening…") : busy ? t("Thinking…") : "…"}{!hearing && voiceEngine && <span data-testid="voice-engine" data-engine={voiceEngine} className="text-xs text-muted">{voiceEngine === "google" ? t("Reading with the natural voice") : t("Reading with the device's own voice")}</span>}<button type="button" data-testid="voice-ptt" className="ml-auto rounded-md border border-line bg-surface px-2 py-0.5 select-none touch-none" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* holding still works */ } pttDown(); }} onPointerUp={pttUp} onPointerCancel={pttUp} onContextMenu={(e) => e.preventDefault()} title={t("While you hold it, Unchore stops and only listens — let go to send at once")}>🎙 {t("Hold to talk")}</button>{/* ■ while Unchore reads aloud: cut it off and listen now (AI Soul «■ 멈추고 듣기» · same as the app's own «Stop and listen» control) */}<button type="button" data-testid="voice-pause" aria-pressed={paused} onClick={togglePause} className="rounded-md border border-line bg-surface px-2 py-0.5">{paused ? `▶ ${t("Listen again")}` : `⏸ ${t("Take a break")}`}</button><button type="button" data-testid="voice-mute" aria-pressed={muted} onClick={toggleMute} className="rounded-md border border-line bg-surface px-2 py-0.5">{muted ? `🔇 ${t("Sound off")}` : `🔊 ${t("Sound on")}`}</button>{!hearing && !busy && !paused && <button type="button" data-testid="voice-stop" onClick={() => startHearing(true)} className="rounded-md border border-line bg-surface px-2 py-0.5">■ {t("Stop")}</button>}<button onClick={toggleVoice} className="underline">{t("End voice mode")}</button></div>}
          {voice && voiceNote && <div className="text-xs text-muted">{voiceNote}</div>}
          {micNote && <div role="status" data-testid="mic-note" className="text-xs text-muted">🎤 {micNote}</div>}
          {!convId && !msgs.length && !busy && !editOf && (shared || text.trim().length >= 20) && <ReceivedBar text={text} onNew={(qq) => { setText(""); void send(qq); }} />}
          {editOf && <div className="rounded-lg bg-panel px-3 py-1.5 text-sm flex items-center gap-2" data-testid="editing-bar">✎ <span className="flex-1">{t("Editing an earlier question — the replies after it will be set aside.")}</span><button type="button" className="text-muted" onClick={() => { setEditOf(null); setText(""); }} aria-label={t("Cancel")}>✕</button></div>}
          <div className={`relative rounded-2xl border bg-surface ${dragging ? "border-accent border-dashed" : "border-line"} flex flex-wrap items-center gap-1 p-1.5`}>
            <input ref={fileIn} type="file" multiple hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }} />
            <textarea value={text} onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) warmUp(voiceRef.current); }} rows={1} placeholder={hearing ? t("Listening…") : setup.placeholder ?? (phone ? t("Ask anything#phone") : t("Ask anything (Enter = send, Shift+Enter = new line)"))}
              onPaste={(e) => { const fl = Array.from(e.clipboardData.files); if (fl.length) { e.preventDefault(); void upload(fl); return; } const pasted = e.clipboardData.getData("text/plain"); if (shouldAttachPaste(pasted)) { e.preventDefault(); void upload([new File([pasted], pasteFileName(files.map((f) => f.name), t), { type: "text/plain" })]); } }}
              onKeyDown={(e) => { if (enterSends({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.keyCode }, phone)) { e.preventDefault(); void send(); } }}
              className="flex-1 min-w-0 basis-full order-first resize-none bg-transparent outline-none px-2 py-2 max-h-48 min-h-[40px] leading-6" />
            <button onClick={() => setPlusOpen((o) => !o)} title={t("Attach files")} aria-label={t("Attach files")} aria-expanded={plusOpen} className="w-9 h-9 rounded-full hover:bg-hover-2 text-xl" data-testid="attach-button">＋</button>
            {/* ＋ menu like AI Soul's — files and photos, then Google Drive when it's connected */}
            {plusOpen && (
              <div className="absolute left-1 bottom-full mb-1 z-20 w-56 bg-surface rounded-lg border border-line shadow-xl py-1 text-sm" data-testid="plus-menu">
                <button type="button" className="block w-full text-left px-3 py-1.5 hover:bg-hover" onClick={() => { setPlusOpen(false); fileIn.current?.click(); }} data-testid="attach-file">📎 {t("Attach files")}</button>
                <DrivePick lang={lang} item onPicked={() => setPlusOpen(false)} onFiles={(fl) => void upload(fl)} />
                <button type="button" className="block w-full text-left px-3 py-1.5 hover:bg-hover" aria-expanded={projPick !== null} data-testid="add-to-project" onClick={() => {
                  if (projPick) { setProjPick(null); return; }
                  setProjPick([]); void fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).then(setProjPick).catch(() => {});
                }}>🗂️ {t("Move to project")} {projPick ? "▴" : "▾"}</button>
                {projPick && <ProjectPick projects={projPick} current={projectId} onPick={(pid) => {
                  setPlusOpen(false); setProjPick(null);
                  if (!convId) { router.push(pid ? `/app?p=${pid}` : "/app"); return; }
                  void fetch(`/api/conversations/${convId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: pid }) })
                    .then(() => window.dispatchEvent(new Event("uc:convs"))).catch(() => {});
                }} />}
              </div>
            )}
            {teachOk && !busy ? <ShowTeach lang={lang} onDone={(shots, words) => void teach(shots, words)} /> : null}
            {models.length > 0 ? (
              // The AI name takes only the room that is left (basis 0) and shortens with «…» — otherwise on a phone with large text
              // the row wrapped and Send (↑) dropped under ＋ (AI Soul, owner's phone photo 10/2 07:11)
              <div className="flex-1 basis-0 min-w-0 flex justify-end" data-testid="ai-pick-slot">
              <label className="relative min-w-0 max-w-full h-9 px-2 rounded-full text-xs hover:bg-hover-2 whitespace-nowrap flex items-center" title={t("AI")}>
                <span className="truncate">{model === "auto" ? (t("✨ Auto-pick")) : (models.find((m) => m.id === (model || defaultModel)) ?? models[0])?.label} ▾</span>
                <select value={model} onChange={(e) => { if (e.target.value === "+connect") setup.showConnect(); else void changeModel(e.target.value); }} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={t("AI")} data-testid="ai-pick">
                  <option value="">{t("Default AI")} ({(models.find((m) => m.id === defaultModel) ?? models[0])?.label})</option>
                  <option value="auto">✨ {t("Auto-pick (per question)")}</option>
                  {models.map((m) => { const b = modelBlurb(m.id); return <option key={m.id} value={m.id}>{b ? `${m.label} — ${t(b)}` : m.label}</option>; })}
                  <option value="+connect">＋ {t("Connect my own AI (ChatGPT · Claude · API key)")}</option>
                </select>
              </label>
              </div>
            ) : <span className="ml-auto" />}
            {micOk && !micDead && <button onClick={() => (hearing ? stopEar.current?.() : startHearing(false))} title={t("Speak")} aria-label={t("Speak")} className={`w-9 h-9 rounded-full hover:bg-hover-2 ${hearing && !voice ? "bg-warn-bg" : ""}`}>🎤</button>}
            {micOk && <button onClick={toggleVoice} title={t("Voice mode (talk back and forth)")} aria-label={t("Voice mode (talk back and forth)")} className={`w-9 h-9 rounded-full hover:bg-hover-2 ${voice ? "bg-warn-bg" : ""}`}>🎧</button>}
            {busy && !text.trim()
              ? <button onClick={stopAnswer} aria-label={t("Stop")} className="w-9 h-9 rounded-full bg-ink text-on-ink active:scale-90 transition-transform">■</button>
              : <>
                {text.trim() && !busy ? <button onClick={() => void send(undefined, undefined, undefined, true)} title={t("Deep research — plans, searches the web up to {n} times, writes a report with sources, and stops after {min} minutes at most (uses more of your AI)", { n: String(RESEARCH_SEARCHES), min: String(RESEARCH_MAX_MINUTES) })} aria-label={t("Deep research")} className="h-9 px-2 rounded-full text-xs hover:bg-hover-2 whitespace-nowrap" data-testid="research">🔎 {t("Research")} <span className="text-faint">· {t("{min} min", { min: String(RESEARCH_MAX_MINUTES) })}</span></button> : null}
                <button onClick={() => void send()} disabled={(!text.trim() && files.length === 0) || uploading > 0} aria-label={t("Send")} className="w-9 h-9 rounded-full bg-ink text-on-ink disabled:opacity-30 active:scale-90 transition-transform">↑</button></>}
          </div>
          <div className="text-[11px] text-faint px-1 min-h-4">{hearing ? t("Listening…") : first ? (t("＋ button, drag and drop, or paste (images) all work")) : ""}</div>
        </div>
      </div>
    </div>
  );
}

/** A file over 4 MB, in 3.5 MB pieces (Vercel takes at most 4.5 MB per request); each piece is tried up to 6 times. The upload's id is
 *  kept in this browser, so attaching the same file again after a break goes on from the pieces already sent (GET ?id). */
async function uploadBig(f: File, convId: string | null, onSent?: (bytes: number) => void): Promise<FileChip | "big_quota" | "stopped" | null> {
  const key = `uc:upload:${f.name}:${f.size}:${f.lastModified}:${convId ?? ""}`;
  const saved = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
  const was = saved ? await fetch(`/api/files/upload?id=${saved}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { parts: number; have: number[] } | null : null;
  let start: { id: string; partBytes: number; parts: number } | null = was && saved ? { id: saved, partBytes: PART_BYTES, parts: was.parts } : null;
  if (!start) {
    const r = await fetch("/api/files/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, mime: f.type, size: f.size, conversationId: convId, ...(FROM_GOOGLE.has(f) ? { source: "google" } : {}) }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) as { id?: string; partBytes?: number; parts?: number; error?: string } | null : null;
    if (j?.error === "big_quota") return "big_quota";
    if (!r?.ok || !j?.id) return null;
    start = { id: j.id, partBytes: j.partBytes!, parts: j.parts! };
    try { localStorage.setItem(key, j.id); } catch { /* private mode */ }
  }
  const have = new Set(was?.have ?? []);
  for (let i = 0; i < start.parts; i++) {
    if (have.has(i)) { onSent?.(Math.min(f.size, (i + 1) * start.partBytes)); continue; }
    const piece = f.slice(i * start.partBytes, (i + 1) * start.partBytes);
    let ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++) {
      ok = await fetch(`/api/files/upload?id=${start.id}&i=${i}`, { method: "PUT", body: piece }).then((r) => r.ok).catch(() => false);
      if (!ok) await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** tries, 15_000)));
    }
    if (!ok) return "stopped";
    onSent?.(Math.min(f.size, (i + 1) * start.partBytes));
  }
  const r = await fetch(`/api/files/upload?id=${start.id}&done=1`, { method: "POST" }).catch(() => null);
  const j = r ? await r.json().catch(() => null) as (FileChip & { error?: string }) | null : null;
  if (r?.ok) { try { localStorage.removeItem(key); } catch { /* private mode */ } }
  return r?.ok && j ? j : j?.error === "big_quota" ? "big_quota" : j?.error === "incomplete" ? "stopped" : null;
}

/** An answer as a person sees it: no pick block, no app marks, no [done] line (lib/turn-mark.ts — hidden while it streams too). */
const plain = (content: string) => readSecretAsks(hideNewText(hideReply(hideMarks(readPicks(content).text)))).text.replace(/\n\s*\[(done|완료)\]\s*$/i, "");

// «Your turn N — open the one waiting longest» on the empty first screen (AI Soul components/OwnerTurn.tsx). The list (Shell) counts;
// this only listens, so the first screen makes no request of its own.
function TurnLine() {
  const t = useT();
  const turn = useSyncExternalStore(
    (cb) => { window.addEventListener("uc:turn", cb); return () => window.removeEventListener("uc:turn", cb); },
    () => (window as unknown as { __ucTurn?: { n: number; oldest: string | null } }).__ucTurn ?? null,
    () => null,
  );
  if (!turn?.n || !turn.oldest) return null;
  return <a href={`/app?c=${turn.oldest}`} className="mt-4 inline-block rounded-full border border-orange-300 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 px-3 py-1 text-sm text-orange-800 dark:text-orange-200" data-testid="your-turn">🟠 {t("Your turn: {n} — open the one waiting longest", { n: turn.n })}</a>;
}

// Our team's picks (plan v11 §13 D) on the empty first screen: tap one and it starts in chat with its first sentence.
function FounderPicks({ onPick }: { onPick: (x: string) => void }) {
  const t = useT();
  return (
    <div className="mt-6 flex flex-col items-center gap-2" data-testid="founder-picks">
      <div className="text-xs text-muted">{t("Our team's picks — ✓ runs for real in our nightly check")}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {FOUNDER_PICKS.map((p) => (
          <button key={p.recipe} type="button" onClick={() => onPick(t(p.ask))} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:bg-hover" data-testid="founder-pick">
            {CHECKED_NIGHTLY.has(p.recipe) ? "✓ " : ""}{t(p.title)}
          </button>
        ))}
        {/* The security check as a first-screen feature (plan v11 §13 E) — it lives in Settings › AI, where personal data is masked first. */}
        <a href="/app/settings?tab=ai#security-check" className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:bg-hover" data-testid="founder-defend">🛡 {t("Security check")}</a>
      </div>
    </div>
  );
}

// A Google action the answer proposed (lib/google-act.ts) — nothing happens until «Yes»; each card runs once.
function GoogleCards({ messageId, content, done }: { messageId: string; content: string; done: number[] }) {
  const t = useT();
  const acts = readGoogleActions(content);
  const [state, setState] = useState<Record<number, string>>({});
  if (!acts.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {acts.map((a, j) => {
        const st = state[j] ?? (done.includes(j) ? "done" : "");
        return (
          <div key={j} className="rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-1" data-testid="google-card">
            <div className="font-medium">{a.do === "calendar.add" ? `📅 ${t("Add to Google Calendar")}` : `✉️ ${t("Send from Gmail")}`}</div>
            {a.do === "calendar.add"
              ? <div className="text-fg-2">{a.title} · {a.start.replace("T", " ").slice(0, 16)}{a.end ? ` – ${a.end.replace("T", " ").slice(11, 16)}` : ""}{a.where ? ` · ${a.where}` : ""}</div>
              : <div className="text-fg-2"><div>{t("To")}: {a.to}</div><div>{t("Subject")}: {a.subject}</div><div className="mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto rounded bg-surface p-2 text-xs">{a.body}</div></div>}
            <div className="flex items-center gap-2">
              {st === "done" ? <span className="text-emerald-700 dark:text-emerald-400">✓ {t("Done")}</span>
                : <button type="button" disabled={st === "busy"} onClick={async () => {
                    setState((x) => ({ ...x, [j]: "busy" }));
                    const r = await fetch("/api/connect/google/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, i: j }) }).then((x) => x.json()).catch(() => ({ error: "failed" })) as { ok?: boolean; already?: boolean; error?: string };
                    setState((x) => ({ ...x, [j]: r.ok || r.already ? "done" : r.error === "api_off" ? t("This Google service isn't switched on for Unchore yet") : r.error === "not_connected" ? t("Connect Google in Settings first") : t("Couldn't do it — try again") }));
                  }} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="google-yes">{a.do === "calendar.add" ? t("Yes, add it") : t("Yes, send it")}</button>}
              {st && st !== "done" && st !== "busy" ? <span className="text-xs text-red-600">{st}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A Meta ad-budget raise the answer proposed (lib/meta-act.ts) — spends money, so nothing happens until «Yes»; each card runs once.
function MetaCards({ messageId, content, done }: { messageId: string; content: string; done: number[] }) {
  const t = useT();
  const acts = readMetaActions(content);
  const [state, setState] = useState<Record<number, string>>({});
  if (!acts.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {acts.map((a, j) => {
        const st = state[j] ?? (done.includes(j) ? "done" : "");
        return (
          <div key={j} className="rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-1" data-testid="meta-card">
            <div className="font-medium">📈 {t("Raise a Meta ad set's daily budget")}</div>
            <div className="text-fg-2">{a.name ?? a.adset} · {a.from ? `${a.from.toLocaleString()} → ` : ""}<b>{a.daily.toLocaleString()}</b> {t("per day")}</div>
            <div className="text-xs text-muted">{t("This spends more of your money. It changes only this ad set, only once.")}</div>
            <div className="flex items-center gap-2">
              {st === "done" ? <span className="text-emerald-700 dark:text-emerald-400">✓ {t("Done")}</span>
                : <button type="button" disabled={st === "busy"} onClick={async () => {
                    setState((x) => ({ ...x, [j]: "busy" }));
                    const r = await fetch("/api/connect/meta/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, i: j }) }).then((x) => x.json()).catch(() => ({ error: "failed" })) as { ok?: boolean; already?: boolean; error?: string };
                    setState((x) => ({ ...x, [j]: r.ok || r.already ? "done" : r.error === "too_big" ? t("More than double today's budget — ask for a smaller step") : r.error === "not_connected" ? t("Save your Meta token first") : r.error === "not_this_account" ? t("That ad set isn't in your saved ad account") : t("Couldn't do it — try again") }));
                  }} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="meta-yes">{t("Yes, raise it")}</button>}
              {st && st !== "done" && st !== "busy" ? <span className="text-xs text-red-600">{st}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// «Remember this?» under a night answer (lib/night-retry.ts): the line is saved to their memories only when they press «Remember».
function RememberCard({ content }: { content: string }) {
  const t = useT();
  const text = readRemember(content);
  const [st, setSt] = useState("");
  if (!text) return null;
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-1" data-testid="remember-card">
      <div className="font-medium">🧠 {t("Remember this for next time?")}</div>
      <div className="text-fg-2">{text}</div>
      <div className="flex items-center gap-2">
        {st === "done" ? <span className="text-emerald-700 dark:text-emerald-400">✓ {t("Remembered")}</span>
          : <button type="button" disabled={st === "busy"} onClick={async () => {
              setSt("busy");
              const r = await fetch("/api/memories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
              setSt(r?.ok ? "done" : r?.status === 400 ? t("This looks private, so it wasn't saved") : t("Couldn't do it — try again"));
            }} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="remember-yes">{t("Remember")}</button>}
        {st && st !== "done" && st !== "busy" ? <span className="text-xs text-red-600">{st}</span> : null}
      </div>
    </div>
  );
}

// An image/video the answer proposed on the member's own Higgsfield account (lib/higgsfield.ts): the card shows the price on their
// Higgsfield balance, makes it only after «Yes» (once), then shows it here when it's done (the minute tick also tells their phone).
type HfJob = { status: string; url: string | null; usd: number | null; error: string | null; provider?: string; draft?: boolean };
type HfView = { usd?: number | null; needKey?: boolean; error?: string; provider?: string; draft?: boolean; job?: HfJob; final?: HfJob | null; finalUsd?: number | null; up?: HfJob | null; upUsd?: number | null };
function HfCards({ messageId, content }: { messageId: string; content: string }) {
  const asks = readHfAsks(content);
  if (!asks.length) return null;
  return <div className="mt-2 flex flex-col gap-2">{asks.map((a, j) => <HfCard key={j} messageId={messageId} i={j} kind={a.kind} what={a.prompt} spec={a.kind === "video" ? `${a.res} · ${a.seconds}s · ${a.aspect}` : a.aspect} />)}</div>;
}
function HfFile({ kind, job, fal }: { kind: "video" | "image"; job: HfJob; fal: boolean }) {
  const t = useT();
  return <>
    {kind === "video" ? <video src={job.url!} controls playsInline className="mt-1 max-h-80 rounded-lg border border-line" />
      // eslint-disable-next-line @next/next/no-img-element -- Higgsfield's own file address
      : <img src={job.url!} alt="" className="mt-1 max-h-80 rounded-lg border border-line" />}
    <div className="flex items-center gap-2 text-xs text-muted"><a href={job.url!} target="_blank" rel="noreferrer" className="underline">{t("Download")}</a> · {fal ? t("Download it to keep it — the link may not last.") : t("Higgsfield keeps it for 7 days — download it to keep it.")}</div>
  </>;
}
// A video card can run on fal (they saved a fal key, lib/fal-video.ts): 480p is then a draft, and the card offers that exact shot in 1080p.
function HfCard({ messageId, i, kind, what, spec }: { messageId: string; i: number; kind: "video" | "image"; what: string; spec: string }) {
  const t = useT();
  const [v, setV] = useState<HfView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => fetch(`/api/connect/higgsfield/act?messageId=${messageId}&i=${i}`).then((x) => x.json()).then((x: HfView) => setV(x)).catch(() => {}), [messageId, i]);
  useEffect(() => { void load(); }, [load]);
  const making = v?.job?.status === "sent" || v?.final?.status === "sent" || v?.up?.status === "sent";
  useEffect(() => { if (!making) return; const id = setInterval(() => void load(), 10_000); return () => clearInterval(id); }, [making, load]);
  const job = v?.job;
  const fal = (job?.provider ?? v?.provider) === "fal";
  const why = (e?: string | null) => e === "bad_key" ? (fal ? t("fal didn't accept your key — save a new one") : t("Higgsfield didn't accept your key — save a new one"))
    : e === "no_balance" ? (fal ? t("Your fal balance is too low — add funds at fal.ai") : t("Your Higgsfield balance is too low — add funds at console.higgsfield.ai"))
    : e === "price_unknown" ? t("Higgsfield didn't say the price, so it wasn't made (nothing was charged)") : e === "too_big" ? t("Over $25 for one card — ask for a shorter or smaller one")
    : e === "nsfw" ? t("Higgsfield refused this prompt") : e === "no_video" ? t("Couldn't make it — try again") : e === "draft_gone" || e === "no_draft" ? t("This draft can't be finished any more (drafts last 7 days) — ask for a new one")
    : e ? t("Couldn't make it — try again") : "";
  const press = async (what?: "final" | "upscale") => {
    setBusy(true); setErr("");
    const r = await fetch("/api/connect/higgsfield/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, i, ...(what ? { [what]: true } : {}) }) }).then((x) => x.json()).catch(() => ({ error: "failed" })) as { ok?: boolean; already?: boolean; error?: string };
    if (!r.ok && !r.already) setErr(why(r.error)); await load(); setBusy(false);
  };
  const draft = job?.draft || (!job && v?.draft);
  const title = kind === "image" ? t("Make an image on your Higgsfield account") : fal ? (draft ? t("Make a 480p draft video on your fal account") : t("Make a video on your fal account")) : t("Make a video on your Higgsfield account");
  return (
    <div className="rounded-xl border border-line bg-panel p-3 text-sm flex flex-col gap-1" data-testid="hf-card">
      <div className="font-medium">{kind === "video" ? "🎬" : "🖼"} {title} <span className="text-xs text-muted">{spec}</span></div>
      <div className="text-fg-2 line-clamp-3">{what}</div>
      {job?.status === "done" && job.url ? <HfFile kind={kind} job={job} fal={fal} />
        : job?.status === "sent" ? <div className="text-muted">⏳ {fal ? t("Making it on fal… a video takes a few minutes. You can close this; we'll tell you when it's ready.") : t("Making it on Higgsfield… a video takes a few minutes. You can close this; we'll tell you when it's ready.")}</div>
        : job?.status === "failed" ? <div className="text-xs text-red-600">{why(job.error)}</div>
        : v?.needKey ? <div className="text-xs text-muted">🔑 {t("Connect your Higgsfield account first: ask me «how do I connect Higgsfield?»")}</div>
        : <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-2">{v?.usd != null ? (fal ? t("About ${usd} from your fal balance", { usd: v.usd.toFixed(2) }) : t("About ${usd} from your Higgsfield balance", { usd: v.usd.toFixed(2) })) : v?.error ? why(v.error) : v ? why("price_unknown") : "…"}</span>
            {v?.usd != null && <button type="button" disabled={busy} onClick={() => void press()} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="hf-yes">{t("Yes, make it")}</button>}
          </div>}
      {v?.final ? <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2" data-testid="hf-final">
          <div className="font-medium">🎞 {t("The same shot in 1080p")}</div>
          {v.final.status === "done" && v.final.url ? <HfFile kind="video" job={v.final} fal />
            : v.final.status === "sent" ? <div className="text-muted">⏳ {t("Making this exact shot in 1080p… it takes a few minutes. We'll tell you when it's ready.")}</div>
            : <div className="text-xs text-red-600">{why(v.final.error)}</div>}
        </div>
        : v?.finalUsd != null ? <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          <div className="text-xs text-muted">{t("Like this draft? It can be made again in 1080p as this exact shot (same seed and prompt), within 7 days. That costs the full 1080p price, not the difference.")}</div>
          <div><button type="button" disabled={busy} onClick={() => void press("final")} className="rounded-lg bg-ink text-on-ink px-3 py-1 disabled:opacity-40" data-testid="hf-final-yes">{t("Same shot in 1080p — about ${usd}", { usd: v.finalUsd.toFixed(2) })}</button></div>
        </div> : null}
      {v?.up ? <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2" data-testid="hf-up">
          <div className="font-medium">🔍 {t("Sharper, same video (1080p)")}</div>
          {v.up.status === "done" && v.up.url ? <HfFile kind="video" job={v.up} fal />
            : v.up.status === "sent" ? <div className="text-muted">⏳ {t("Making this video sharper… it takes a few minutes. We'll tell you when it's ready.")}</div>
            : <div className="text-xs text-red-600">{why(v.up.error)}</div>}
        </div>
        : v?.upUsd != null ? <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          <div className="text-xs text-muted">{t("Or keep this exact video and only make it sharper (1080p, nothing redrawn). Much cheaper, but less crisp than a real 1080p.")}</div>
          <div><button type="button" disabled={busy} onClick={() => void press("upscale")} className="rounded-lg border border-line px-3 py-1 disabled:opacity-40" data-testid="hf-up-yes">{t("Make it sharper — about ${usd}", { usd: v.upUsd.toFixed(2) })}</button></div>
        </div> : null}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

function FileRow({ files }: { files: FileChip[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f) => f.mime.startsWith("video/") || f.mime.startsWith("audio/")
        // a video Unchore made (lib/video.ts) plays right here; the chip under it still downloads it
        ? <span key={f.id} className="flex flex-col items-start gap-1">{f.mime.startsWith("video/") ? <video src={`/api/files/${f.id}?view=1`} controls playsInline preload="metadata" className="max-h-80 max-w-full rounded-lg border border-line bg-black" /> : <audio src={`/api/files/${f.id}?view=1`} controls preload="metadata" />}<a href={`/api/files/${f.id}`} className="text-xs text-muted hover:underline">⬇ {f.name} · {kb(f.size)}</a></span>
        : f.mime.startsWith("image/")
        // eslint-disable-next-line @next/next/no-img-element -- user's own uploads, served by our API
        ? <a key={f.id} href={`/api/files/${f.id}?view=1`} target="_blank" rel="noreferrer"><img src={`/api/files/${f.id}?view=1`} alt={f.name} className="max-h-40 rounded-lg border border-line" /></a>
        : isPdf(f)
        // a PDF shows its first page (components/PdfFirstPage.tsx); the chip under it still opens the whole file
        ? <span key={f.id} className="flex flex-col items-start gap-1"><PdfFirstPage name={f.name} size={f.size} href={`/api/files/${f.id}?view=1`} /><a href={fileOpenHref(f)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-hover">📎 {f.name} <span className="text-xs text-muted">{kb(f.size)}</span></a></span>
        : <a key={f.id} href={fileOpenHref(f)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-hover">📎 {f.name} <span className="text-xs text-muted">{kb(f.size)}</span></a>)}
    </div>
  );
}

/** Tap-to-answer buttons (plan 10판 §4 «pick, don't recall»). Typing still works. */
function Picks({ items, onPick, testId }: { items: string[]; onPick: (x: string) => void; testId?: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2" data-testid={testId}>
      {items.map((x) => <button key={x} onClick={() => onPick(x)} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm hover:bg-hover">{x}</button>)}
    </div>
  );
}

/** A saved login asked for by the AI («<<<secret name=…>>>»): typed here, it goes straight to the vault — never into the chat or to the AI. */
function SecretBox({ name }: { name: string }) {
  const t = useT();
  const [v, setV] = useState("");
  const [state, setState] = useState<"" | "saving" | "ok" | "bad">("");
  async function save() {
    setState("saving");
    const r = await fetch("/api/vault", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, value: v }) }).catch(() => null);
    setState(r?.ok ? "ok" : "bad"); if (r?.ok) setV("");
  }
  if (state === "ok") return <div className="mt-2 text-sm text-muted">🔐 {t("Saved «{name}». It didn't go to the AI.", { name })}</div>;
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface p-3 flex flex-col gap-2 max-w-md">
      <div className="text-sm">🔐 <b>{name}</b> — {t("Stored encrypted. It never goes into the chat or to the AI.")}</div>
      <div className="flex gap-2">
        <input type="password" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" className="flex-1 min-w-0 rounded-lg border border-line bg-page px-3 py-2 outline-none" aria-label={name} />
        <button onClick={() => void save()} disabled={!v || state === "saving"} className="rounded-lg bg-ink text-on-ink px-3 py-2 text-sm disabled:opacity-40">{t("Save")}</button>
      </div>
      {state === "bad" && <div className="text-xs text-warn-fg">{t("Couldn't save. Please try again.")}</div>}
    </div>
  );
}

/** The answer is on screen: the server then doesn't send «your answer is ready» (app/api/chat/route.ts). */
function gotIt(conversationId: string): void {
  void fetch("/api/chat/got", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId }) }).catch(() => {});
}

/** While an answer is being made: «Unchore is thinking… · 12s» (seconds waited, redrawn every second — ported from AI Soul
 *  components/Elapsed.tsx), and under it that the window can be closed (2026-10-01 owner: the answer goes on without the page —
 *  app/api/chat/route.ts). With notifications on it says it will tell them; otherwise it offers to turn them on. */
function Thinking({ ms = 0 }: { ms?: number }) {
  const t = useT();
  const [s, setS] = useState(Math.floor(ms / 1000));
  const [push, setPush] = useState<PushState | "busy" | null>(null);
  const [asking, setAsking] = useState(false);   // the browser's Allow box is open
  useEffect(() => { const t0 = Date.now() - ms; const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 1000); return () => clearInterval(id); }, [ms]);
  useEffect(() => { void pushState().then(setPush); }, []);
  const m = Math.floor(s / 60), r = s % 60;
  return (
    <div data-testid="thinking">
      <span className="text-muted animate-pulse">{t("Unchore is thinking…")}{s >= 2 && <span className="tabular-nums"> · {m ? t("{m}m {s}s#wait", { m, s: r }) : t("{s}s#wait", { s: r })}</span>}</span>
      {s >= 3 && push && <div className="mt-1 text-xs text-muted">
        {push === "on" ? t("You can close this window or go to another site. Unchore keeps working and lets you know when it's done.")
          : t("You can close this window or go to another site. Unchore keeps working, and the answer will be here when you come back.")}
        {(push === "off" || push === "busy") && <> <button className="underline" disabled={push === "busy"} onClick={() => { setPush("busy"); setAsking(allowBoxOpens()); void enablePush().then((st) => { setAsking(false); setPush(st); }); }} data-testid="thinking-notify">{t("Notify me when it's done")}</button></>}
        {push === "busy" && asking && <div className="mt-1 font-medium text-ink" role="status" data-testid="thinking-allow-hint">👆 {t("Click «Allow» in the box your browser just opened (top left on a computer).")}</div>}
      </div>}
    </div>
  );
}

/** An answer with its «Details» end part folded (while it is still streaming nothing is folded). */
function Answer({ text, folded, labels }: { text: string; folded: boolean; labels: { copy: string; copied: string; decide: string; details: string } }) {
  const parts = folded ? splitTech(text) : null;
  if (!parts) return <Markdown text={text} copyLabel={labels.copy} copiedLabel={labels.copied} decideLabel={labels.decide} />;
  return (
    <>
      <Markdown text={parts.head} copyLabel={labels.copy} copiedLabel={labels.copied} decideLabel={labels.decide} />
      <details className="mt-2 text-sm text-fg-2"><summary className="cursor-pointer select-none text-muted">{labels.details}</summary>
        <Markdown text={parts.tech} copyLabel={labels.copy} copiedLabel={labels.copied} decideLabel={labels.decide} />
      </details>
    </>
  );
}

const pill = "rounded-md border border-line px-2 py-0.5 hover:bg-hover";

/** «9/29 오후 11:15» in the viewer's clock (AI Soul shows the time under every message). */
function whenShort(iso: string, lang: Lang): string {
  const d = new Date(iso), today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(lang, { ...(today ? {} : { month: "numeric", day: "numeric" }), hour: "numeric", minute: "2-digit" });
}

/** How long the answer took — from the question just before it to the answer (AI Soul «1분 17초»). */
function took(msgs: Msg[], i: number, t: TFn): string | null {
  const a = msgs[i], q = msgs[i - 1];
  if (!a?.created_at || !q?.created_at || q.role !== "user") return null;
  const s = Math.round((Date.parse(a.created_at) - Date.parse(q.created_at)) / 1000);
  if (!(s > 0) || s > 6 * 3600) return null;
  const m = Math.floor(s / 60);
  return m ? t("{m}m {s}s", { m, s: s % 60 }) : t("{s}s", { s });
}

// «🧠 Memory updated (+1 · ✎0 · −0)» under an answer (AI Soul MemoryNote): press it to see the words that were added, changed or
// removed — kept with the answer, so it is still there after reopening. Fixing or forgetting is in Settings › Memory.
function MemoryLine({ mem }: { mem: MemoryChange }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const items = mem.items ?? [];
  return (
    <div className="mt-1 text-xs text-muted" data-testid="memory-note">
      <button type="button" className="hover:underline disabled:no-underline" aria-expanded={open} disabled={!items.length} onClick={() => setOpen(!open)} data-testid="memory-note-toggle">🧠 {t("Memory updated")} (+{mem.added} · ✎{mem.updated} · −{mem.removed}){items.length ? (open ? " ▴" : " ▾") : ""}</button>
      {open && <ul className="mt-1 space-y-0.5 pl-4" data-testid="memory-note-list">
        {items.map((x, i) => <li key={i} className={x.op === "−" ? "line-through" : ""}>{x.op} {x.text}</li>)}
        <li><a className="underline" href="/app/settings?tab=memory">⚙ {t("Memory")} →</a></li>
      </ul>}
    </div>
  );
}
