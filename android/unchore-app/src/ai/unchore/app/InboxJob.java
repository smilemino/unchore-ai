package ai.unchore.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Notifications without an always-on service: every 15 minutes (and right after the app opens) the phone asks unchore.ai
 * «what was sent since last time?» (/api/push/app) with the app's own sign-in, and shows each one — reminders, finished automations,
 * «your app is ready». A web view can't get web push, and Google Play doesn't allow an app to stay awake just to wait.
 * Nothing is shown while the app itself is on screen (the page already shows it). Signed out → nothing is asked.
 * A fresh «your work is done» notice comes with «say» (lib/app-talk.ts): it is read aloud, unless the phone is on silent / vibrate /
 * do-not-disturb or in a call — then it is only shown.
 */
public class InboxJob extends JobService {
    static final String CH = "updates";
    private static final int PERIODIC = 1, NOW = 2;
    static volatile boolean appVisible;

    /** Called when the app opens: keeps the 15-minute check and asks once now (registers this phone so notices are kept for it). */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        ComponentName me = new ComponentName(c, InboxJob.class);
        if (js.getPendingJob(PERIODIC) == null)
            js.schedule(new JobInfo.Builder(PERIODIC, me).setPeriodic(15 * 60 * 1000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build());
        js.schedule(new JobInfo.Builder(NOW, me).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setOverrideDeadline(60_000).build());
    }

    static void channel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH) != null) return;
        NotificationChannel ch = new NotificationChannel(CH, c.getString(R.string.updates_channel), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.updates_channel_desc));
        nm.createNotificationChannel(ch);
    }

    @Override public boolean onStartJob(JobParameters p) {
        String cookie;   // the web view's cookie store is read on the main thread (it may start the web view engine)
        try { cookie = CookieManager.getInstance().getCookie(MainActivity.HOME); } catch (Exception e) { return false; }
        new Thread(() -> {
            boolean again = false;
            try { again = !check(cookie); } catch (Exception e) { again = true; }
            jobFinished(p, again && p.getJobId() == NOW);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }

    /** One ask. False = couldn't reach the server (tried again later). */
    private boolean check(String cookie) throws Exception {
        if (cookie == null || cookie.isEmpty()) return true;   // not signed in on this phone
        SharedPreferences sp = getSharedPreferences("inbox", MODE_PRIVATE);
        String device = sp.getString("device", null);
        if (device == null) { device = UUID.randomUUID().toString().replace("-", ""); sp.edit().putString("device", device).apply(); }
        String after = sp.getString("after", "");
        String q = "?device=" + device + "&label=" + URLEncoder.encode(Build.MANUFACTURER + " " + Build.MODEL, "UTF-8") + (after.isEmpty() ? "" : "&after=" + after);
        HttpURLConnection h = (HttpURLConnection) new URL(MainActivity.ORIGIN + "/api/push/app" + q).openConnection();
        h.setConnectTimeout(15_000);
        h.setReadTimeout(20_000);
        h.setRequestProperty("Cookie", cookie);
        h.setRequestProperty("Accept", "application/json");
        int code = h.getResponseCode();
        keepCookies(h.getHeaderFields());
        if (code == 401) return true;   // signed out — nothing to show
        if (code != 200) return false;
        JSONObject o = new JSONObject(read(h.getInputStream()));
        JSONArray items = o.optJSONArray("items");
        List<String> say = new ArrayList<>();
        if (items != null && !appVisible) for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.getJSONObject(i);
            show(it);
            String s = it.optString("say", "");
            if (!it.isNull("say") && !s.isEmpty()) say.add(s);
        }
        sp.edit().putString("after", o.optString("last", after)).apply();
        if (!say.isEmpty() && mayTalk()) speak(say, o.optString("lang", ""));
        return true;
    }

    /** The server may renew the sign-in — keep it for the page too. */
    private static void keepCookies(Map<String, List<String>> headers) {
        if (headers == null) return;
        for (Map.Entry<String, List<String>> e : headers.entrySet()) {
            if (e.getKey() == null || !"set-cookie".equalsIgnoreCase(e.getKey())) continue;
            List<String> all = e.getValue();
            new Handler(Looper.getMainLooper()).post(() -> {
                for (String c : all) CookieManager.getInstance().setCookie(MainActivity.ORIGIN, c);
                CookieManager.getInstance().flush();
            });
        }
    }

    private void show(JSONObject it) {
        channel(this);
        String url = it.optString("url", "/app");
        if (!url.startsWith("/") || url.startsWith("//")) url = "/app";
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(MainActivity.ORIGIN + url), this, MainActivity.class);
        int id = it.optString("id", "0").hashCode();
        PendingIntent pi = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CH)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(it.optString("title", "Unchore"))
            .setContentText(it.optString("body", ""))
            .setStyle(new Notification.BigTextStyle().bigText(it.optString("body", "")))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build();
        try { getSystemService(NotificationManager.class).notify(it.optString("tag", "unchore"), id, n); } catch (SecurityException ignored) { }   // notifications not allowed
    }

    /** Out loud only when the phone would ring: not silent or vibrate, not do-not-disturb, not in a call (also internet calls). */
    private boolean mayTalk() {
        AudioManager am = getSystemService(AudioManager.class);
        if (am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL || am.getMode() != AudioManager.MODE_NORMAL) return false;
        if (am.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0) return false;
        return getSystemService(NotificationManager.class).getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    /** Reads the lines with the phone's own voice in the member's language, waiting (at most a minute) so the job lives until done. */
    private void speak(List<String> lines, String lang) throws InterruptedException {
        CountDownLatch ready = new CountDownLatch(1), done = new CountDownLatch(lines.size());
        boolean[] ok = { false };
        TextToSpeech[] tts = { null };
        new Handler(Looper.getMainLooper()).post(() -> tts[0] = new TextToSpeech(this, st -> { ok[0] = st == TextToSpeech.SUCCESS; ready.countDown(); }));
        try {
            if (!ready.await(15, TimeUnit.SECONDS) || !ok[0]) return;
            TextToSpeech t = tts[0];
            t.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            if (!lang.isEmpty()) try { t.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception ignored) { }   // no voice for it → the phone's default reads
            t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { done.countDown(); }
                @Override public void onError(String id) { done.countDown(); }
            });
            for (int i = 0; i < lines.size(); i++) t.speak(lines.get(i), TextToSpeech.QUEUE_ADD, null, "talk" + i);
            done.await(60, TimeUnit.SECONDS);
        } finally {
            new Handler(Looper.getMainLooper()).post(() -> { if (tts[0] != null) tts[0].shutdown(); });
        }
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > 256_000) break; }
        in.close();
        return b.toString("UTF-8");
    }
}
