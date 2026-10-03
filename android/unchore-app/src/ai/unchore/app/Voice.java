package ai.unchore.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.WebView;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONObject;

/**
 * The phone's dictation (SpeechRecognizer) and voice (TextToSpeech), wired to the page (components/native-app.ts).
 * Dictation ends when the speaker goes quiet — the page listens again after the «end» news. Everything runs on the main thread
 * (dictation requires it). App → page news goes out as window.__ucNative(ev). Ported from AI Soul (android/soul-app/Voice.java);
 * here every call carries the member's language.
 */
final class Voice implements RecognitionListener {
    private static Voice one;
    static synchronized Voice get(Context c) { if (one == null) one = new Voice(c.getApplicationContext()); return one; }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private SpeechRecognizer sr;
    private boolean listening;
    private TextToSpeech tts;
    private boolean ttsReady, ttsInit;
    private String ttsLang = "";
    private final ArrayList<String[]> ttsWaiting = new ArrayList<>();   // lines that came before the voice was ready {id, text, rate, lang}

    private Voice(Context c) { ctx = c; }

    void attach(WebView w) { main.post(() -> web = w); }
    void detach(WebView w) { main.post(() -> { if (web == w) web = null; }); }

    private void emit(String type, String ev, Object... kv) {
        try {
            JSONObject o = new JSONObject().put("type", type).put("ev", ev);
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
            main.post(() -> { if (web != null) web.evaluateJavascript("window.__ucNative&&window.__ucNative(" + o + ")", null); });
        } catch (Exception ignored) { }
    }

    // ── phone calls and the app's buttons ── the page (Chat.tsx) goes quiet, listens, or ends voice mode
    void call(boolean on) { emit("call", on ? "start" : "end"); }
    void interrupt() { emit("ctl", "interrupt"); }
    void end() { emit("ctl", "end"); }

    // ── dictation ──
    // «Client error» (5) loop guard (Synced from AI Soul 2026-10-01: one Android 16 phone hit it 315 times in 11 minutes after the word hint
    // went in — the mic kept dying, talking over the voice wasn't heard and sentences were cut). After a 5 the recognizer is thrown away and
    // made anew; two in a row turn the word hint off; starting right after a cancel waits 0.15 s (a stop that comes meanwhile drops the start).
    private int clientErrs;
    private boolean noBias;
    private long cancelledAt;
    private int gen;
    void srStart(String lang) { main.post(() -> begin(lang, ++gen)); }
    private void begin(String lang, int g) {
        if (g != gen) return;
        if (!SpeechRecognizer.isRecognitionAvailable(ctx)) { emit("sr", "error", "error", "service-not-allowed"); emit("sr", "end"); return; }
        if (sr == null) { sr = SpeechRecognizer.createSpeechRecognizer(ctx); sr.setRecognitionListener(this); }
        if (listening) { listening = false; sr.cancel(); cancelledAt = System.currentTimeMillis(); }
        long wait = 150 - (System.currentTimeMillis() - cancelledAt);
        if (wait > 0) { main.postDelayed(() -> begin(lang, g), wait); return; }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.getPackageName());
        // hint the product name to the recognizer (Android 13+ Google recognizer; others ignore it) — AI Soul heard «언초어» as another company name (2026-10-01 record review)
        if (!noBias) i.putStringArrayListExtra("android.speech.extra.BIASING_STRINGS", new java.util.ArrayList<>(java.util.Arrays.asList("Unchore", "언초어")));
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);   // room between words (some phones ignore it)
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L);
        listening = true;
        try { sr.startListening(i); } catch (Exception e) { listening = false; emit("sr", "error", "error", "start-failed"); emit("sr", "end"); }
    }
    void srAbort() { main.post(() -> { gen++; if (sr != null && listening) { listening = false; sr.cancel(); cancelledAt = System.currentTimeMillis(); emit("sr", "end"); } }); }
    private void done() { if (listening) { listening = false; emit("sr", "end"); } }
    private static String first(Bundle b) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return r == null || r.isEmpty() ? "" : r.get(0);
    }
    @Override public void onPartialResults(Bundle b) { clientErrs = 0; String t = first(b); if (listening && !t.isEmpty()) emit("sr", "result", "text", t, "final", false); }
    @Override public void onResults(Bundle b) { clientErrs = 0; String t = first(b); if (listening && !t.isEmpty()) emit("sr", "result", "text", t, "final", true); done(); }
    @Override public void onError(int code) {
        if (!listening) return;
        switch (code) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: emit("sr", "error", "error", "not-allowed"); break;
            case 12: case 13: emit("sr", "error", "error", "language-not-supported"); break;
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: emit("sr", "error", "error", "code-" + code); sr.destroy(); sr = null; break;
            case SpeechRecognizer.ERROR_CLIENT:   // 5 — this recognizer is stuck: make a new one next time; two in a row drop the word hint
                if (++clientErrs >= 2 && !noBias) { noBias = true; emit("sr", "error", "error", "code-5-nobias"); } else emit("sr", "error", "error", "code-" + code);
                sr.destroy(); sr = null; cancelledAt = System.currentTimeMillis(); break;
            default: emit("sr", "error", "error", "code-" + code); break;   // nothing said · time up · brief drop — the page listens again
        }
        done();
    }
    @Override public void onReadyForSpeech(Bundle b) { }
    @Override public void onBeginningOfSpeech() { }
    @Override public void onRmsChanged(float v) { }
    @Override public void onBufferReceived(byte[] b) { }
    @Override public void onEndOfSpeech() { }
    @Override public void onEvent(int t, Bundle b) { }

    // ── sound turn (audio focus) while reading ── AI Soul 3b2cbdb: with a navigation app on, the answer made no sound — the app never
    // asked for a turn, and Android 12+ holds back an app's sound until it does. Ask «briefly, others quieter» while reading, let go after.
    private AudioFocusRequest focusReq;
    private void focus(boolean on) {
        AudioManager am = ctx.getSystemService(AudioManager.class);
        if (am == null) return;
        if (!on) { if (focusReq != null) am.abandonAudioFocusRequest(focusReq); return; }
        if (focusReq == null) focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .build();
        am.requestAudioFocus(focusReq);
    }
    /** After each line: when nothing is left to read, give the sound turn back. */
    private void doneLine(String id) {
        emit("tts", "end", "id", id);
        main.post(() -> { if (tts == null || !tts.isSpeaking()) focus(false); });
    }

    // ── reading aloud ──
    private void ensureTts() {
        if (tts != null) return;
        tts = new TextToSpeech(ctx, status -> main.post(() -> {
            ttsInit = true;
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            for (String[] w : ttsWaiting) say(w[0], w[1], Float.parseFloat(w[2]), w[3]);
            ttsWaiting.clear();
        }));
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { doneLine(id); }
            @Override public void onError(String id) { doneLine(id); }
            @Override public void onStop(String id, boolean interrupted) { doneLine(id); }
        });
    }
    private void say(String id, String text, float rate, String lang) {
        if (!ttsReady) { emit("tts", "end", "id", id); return; }
        if (lang != null && !lang.isEmpty() && !lang.equals(ttsLang)) {   // the member's language; if the phone has no voice for it, its default reads
            ttsLang = lang;
            try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception ignored) { }
        }
        tts.setSpeechRate(rate);
        focus(true);
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, id);
    }
    void ttsSpeak(String id, String text, float rate, String lang) {
        main.post(() -> {
            ensureTts();
            if (!ttsInit) { ttsWaiting.add(new String[] { id, text, String.valueOf(rate), lang }); return; }
            say(id, text, rate, lang);
        });
    }
    void ttsCancel() { main.post(() -> { ttsWaiting.clear(); if (tts != null) tts.stop(); focus(false); }); }
}
