package ai.unchore.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Collections;
import java.util.regex.Pattern;

/**
 * The window that shows unchore.ai. Unchore pages open inside; other addresses open in the phone's browser.
 * Sign-in: Google and GitHub refuse sign-in inside an app's web view, so «Continue with …» opens in the phone's browser (Custom Tab)
 * and comes back with a one-time link only this app can receive (unchore://login · lib/app-login.ts).
 * While voice mode is on, leaving the app shrinks it to a small floating window over the other app (picture-in-picture).
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://unchore.ai";
    static final String HOME = ORIGIN + "/app";
    private static final String[] HOSTS = { "unchore.ai", "www.unchore.ai" };
    private static final Pattern LOGIN_TOKEN = Pattern.compile("[A-Za-z0-9_\\-]{20,128}");
    private static final int FILES = 7;
    private static final String PIP_STOP = VoiceService.ACT_INTERRUPT;   // the small window's «Stop and listen» = the notification's

    private boolean voiceOn;
    private LinearLayout pip;
    private TextView pipPhase, pipLine;

    // Server briefly unreachable: cover the error page with our own words and try again every 10 seconds (AI Soul 9/30).
    private static final long RETRY_MS = 10_000;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private LinearLayout down;
    private boolean failed, clearHist;
    private String retryUrl = HOME;
    private final Runnable retry = this::retryNow;
    private long backAt;

    private UcWebView web;
    private ValueCallback<Uri[]> fileCb;

    static boolean ours(Uri u) {
        if (u == null || !"https".equals(u.getScheme())) return false;
        for (String h : HOSTS) if (h.equals(u.getHost())) return true;
        return false;
    }

    /** What the page (components/native-app.ts) calls. Calls arrive on a web thread; Voice moves them to the main thread. */
    final class Bridge {
        @JavascriptInterface public void srStart(String lang) { Voice.get(MainActivity.this).srStart(lang); }
        @JavascriptInterface public void srAbort() { Voice.get(MainActivity.this).srAbort(); }
        @JavascriptInterface public void ttsSpeak(String id, String text, float rate, String lang) { Voice.get(MainActivity.this).ttsSpeak(id, text, rate, lang); }
        @JavascriptInterface public void ttsCancel() { Voice.get(MainActivity.this).ttsCancel(); }
        @JavascriptInterface public void voiceView(String phase, String line) { runOnUiThread(() -> showPip(phase, line)); }
        @JavascriptInterface public void voiceSession(boolean on) {
            runOnUiThread(() -> {
                voiceOn = on;
                pipParams();
                if (!on) showPip("off", "");
                Intent s = new Intent(MainActivity.this, VoiceService.class);
                if (!on) { stopService(s); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { askMic(); return; }
                try { startForegroundService(s); } catch (Exception ignored) { }   // voice mode still works while the app is on screen
            });
        }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new UcWebView(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#f7f6f2"));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        root.addView(buildDown(), new FrameLayout.LayoutParams(-1, -1));
        root.addView(buildPip(), new FrameLayout.LayoutParams(-1, -1));   // the page stays «visible» underneath (hiding it slows its timers)
        setContentView(root);
        edgeToEdge(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " UnchoreApp/1");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "UnchoreAndroid");
        Voice.get(this).attach(web);

        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { failed = false; }
            @Override public void onPageFinished(WebView v, String url) {
                if (failed) return;
                showDown(false);
                if (clearHist) { clearHist = false; v.clearHistory(); }
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) serverDown(r.getUrl());
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse res) {
                if (r.isForMainFrame() && ours(r.getUrl()) && res.getStatusCode() >= 500) serverDown(r.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String path = u.getPath() == null ? "" : u.getPath();
                if (ours(u) && (path.equals("/api/auth/google/start") || path.equals("/api/auth/github/start"))) {
                    signInOutside(u.buildUpon().appendQueryParameter("app", "1").appendQueryParameter("n", newNonce()).build());
                    return true;
                }
                if (ours(u) && path.startsWith("/api/connect/google")) { Toast.makeText(MainActivity.this, R.string.google_connect_browser, Toast.LENGTH_LONG).show(); return true; }
                if (ours(u)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest r) {   // microphone for the first words of voice mode (our pages only)
                runOnUiThread(() -> { if (ours(r.getOrigin())) r.grant(r.getResources()); else r.deny(); });
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = p.createIntent();
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(i, FILES); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, disposition, mime, len) -> {
            try {
                DownloadManager.Request q = new DownloadManager.Request(Uri.parse(url));
                String c = CookieManager.getInstance().getCookie(url);
                if (c != null && ours(Uri.parse(url))) q.addRequestHeader("Cookie", c);
                q.addRequestHeader("User-Agent", ua);
                String name = URLUtil.guessFileName(url, disposition, mime);
                q.setTitle(name);
                q.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                q.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                getSystemService(DownloadManager.class).enqueue(q);
                Toast.makeText(this, R.string.downloading, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
            }
        });

        askNotifications();
        String first = target(getIntent());
        web.loadUrl(first != null ? first : startUrl());
    }

    /** Android 15+ draws the app under the status and navigation bars — keep the page clear of them and of the keyboard. */
    private void edgeToEdge(View root) {
        if (Build.VERSION.SDK_INT < 30) return;
        getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) c.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        root.setOnApplyWindowInsetsListener((v, in) -> {
            Insets i = in.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    /** Where an incoming intent points: an unchore.ai link, a sign-in handed over from the browser, or text shared from another app. */
    private String target(Intent i) {
        if (i == null) return null;
        Uri u = i.getData();
        if (Intent.ACTION_SEND.equals(i.getAction())) {
            String text = i.getStringExtra(Intent.EXTRA_TEXT), title = i.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text == null || text.isEmpty()) return null;
            Uri.Builder s = Uri.parse(HOME).buildUpon().appendQueryParameter("text", text.length() > 8000 ? text.substring(0, 8000) : text);   // lib/share-in.ts fills a new chat
            if (title != null && !title.isEmpty()) s.appendQueryParameter("title", title);
            return s.build().toString();
        }
        if (u != null && "unchore".equals(u.getScheme()) && "login".equals(u.getHost())) {
            String t = u.getQueryParameter("t");
            if (t == null || !LOGIN_TOKEN.matcher(t).matches() || !takeNonce(u.getQueryParameter("n"))) return null;
            return ORIGIN + "/api/auth/email/verify?t=" + t;
        }
        return ours(u) ? u.toString() : null;
    }

    /** A fresh random number for this sign-in. The link that comes back must carry it — so a web page can't push someone else's
     *  sign-in link into the app and sign it in to their account (lib/app-login.ts). Good for 15 minutes, once. */
    private String newNonce() {
        byte[] r = new byte[18];
        new java.security.SecureRandom().nextBytes(r);
        StringBuilder n = new StringBuilder();
        for (byte x : r) n.append(String.format("%02x", x));
        getPreferences(MODE_PRIVATE).edit().putString("nonce", n.toString()).putLong("nonce_at", System.currentTimeMillis()).apply();
        return n.toString();
    }

    private boolean takeNonce(String got) {
        android.content.SharedPreferences p = getPreferences(MODE_PRIVATE);
        String want = p.getString("nonce", null);
        boolean ok = want != null && want.equals(got) && System.currentTimeMillis() - p.getLong("nonce_at", 0) < 15 * 60 * 1000L;
        if (ok) p.edit().remove("nonce").remove("nonce_at").apply();
        return ok;
    }

    /** «Continue with Google/GitHub» in the phone's browser as a Custom Tab (plain intent extras — no support library). */
    private void signInOutside(Uri u) {
        Intent i = new Intent(Intent.ACTION_VIEW, u);
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        i.putExtras(extras);
        i.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", Color.parseColor("#f7f6f2"));
        try { startActivity(i); } catch (ActivityNotFoundException e) { Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show(); }
    }

    private String startUrl() {
        String last = getPreferences(MODE_PRIVATE).getString("last", HOME);
        Uri u = Uri.parse(last);
        return ours(u) && u.getPath() != null && u.getPath().startsWith("/app") ? last : HOME;
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
    }

    /** Asked when voice mode first opens (not at start — Google Play wants rights asked when they are needed). */
    private void askMic() {
        if (shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) || !getPreferences(MODE_PRIVATE).getBoolean("mic_asked", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("mic_asked", true).apply();
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, 2);
        } else Toast.makeText(this, R.string.mic_needed, Toast.LENGTH_LONG).show();
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == 2 && res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED && voiceOn) {
            try { startForegroundService(new Intent(this, VoiceService.class)); } catch (Exception ignored) { }
        }
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String t = target(i);
        if (t != null) web.loadUrl(t);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != FILES || fileCb == null) return;
        Uri[] got = null;
        if (res == RESULT_OK && data != null) {
            ClipData c = data.getClipData();
            if (c != null) { got = new Uri[c.getItemCount()]; for (int i = 0; i < got.length; i++) got[i] = c.getItemAt(i).getUri(); }
            else if (data.getData() != null) got = new Uri[] { data.getData() };
        }
        fileCb.onReceiveValue(got);
        fileCb = null;
    }

    @Override protected void onResume() {
        super.onResume();
        InboxJob.appVisible = true;
        InboxJob.schedule(this);
    }

    @Override protected void onPause() {
        super.onPause();
        InboxJob.appVisible = false;   // the page keeps running (voice mode goes on behind other apps) — only save the sign-in and place
        CookieManager.getInstance().flush();
        String u = web.getUrl();
        if (u != null) getPreferences(MODE_PRIVATE).edit().putString("last", u).apply();
    }

    // ── small floating window (picture-in-picture) ──
    private boolean pipOk() { return getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE); }

    private View buildPip() {
        pip = new LinearLayout(this);
        pip.setOrientation(LinearLayout.VERTICAL);
        pip.setGravity(Gravity.CENTER);
        pip.setPadding(24, 16, 24, 16);
        pip.setBackgroundColor(Color.WHITE);
        pip.setVisibility(View.GONE);
        pipPhase = new TextView(this);
        pipPhase.setTextSize(18); pipPhase.setTextColor(Color.parseColor("#1f1f1f")); pipPhase.setGravity(Gravity.CENTER);
        pipPhase.setTypeface(pipPhase.getTypeface(), android.graphics.Typeface.BOLD);
        pipLine = new TextView(this);
        pipLine.setTextSize(14); pipLine.setTextColor(Color.parseColor("#374151")); pipLine.setGravity(Gravity.CENTER);
        pipLine.setMaxLines(3); pipLine.setEllipsize(android.text.TextUtils.TruncateAt.END);
        pip.addView(pipPhase); pip.addView(pipLine);
        showPip("listening", "");
        return pip;
    }

    private String phaseLabel(String p) {
        switch (p) {
            case "listening": return getString(R.string.pip_listening);
            case "thinking": return getString(R.string.pip_thinking);
            case "speaking": return getString(R.string.pip_speaking);
            case "off": return getString(R.string.pip_off);
            default: return getString(R.string.app_name);
        }
    }

    private void showPip(String phase, String line) {
        if (pip == null) return;
        pipPhase.setText(phaseLabel(phase));
        pipLine.setText(line);
        pipLine.setVisibility(line.isEmpty() ? View.GONE : View.VISIBLE);
        pip.setBackgroundColor(Color.parseColor("listening".equals(phase) ? "#FEF3C7" : "#FFFFFF"));
    }

    /** Only while voice mode is on does leaving the app shrink it (Android 12+ by itself). One button: «Stop and listen». */
    private PictureInPictureParams pipBuild() {
        PendingIntent stop = PendingIntent.getBroadcast(this, 1, new Intent(PIP_STOP).setPackage(getPackageName()), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        RemoteAction act = new RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_media_pause), getString(R.string.stop_listen), getString(R.string.stop_listen_desc), stop);
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).setActions(Collections.singletonList(act));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(voiceOn).setSeamlessResizeEnabled(false);
        return b.build();
    }

    private void pipParams() {
        if (!pipOk()) return;
        try { setPictureInPictureParams(pipBuild()); } catch (Exception ignored) { }
    }

    @Override protected void onUserLeaveHint() {   // Android 8–11: shrink when leaving (12+ does it by itself)
        super.onUserLeaveHint();
        if (!voiceOn || Build.VERSION.SDK_INT >= 31 || !pipOk()) return;
        try { enterPictureInPictureMode(pipBuild()); } catch (Exception ignored) { }
    }

    @Override public void onPictureInPictureModeChanged(boolean in, Configuration c) {
        super.onPictureInPictureModeChanged(in, c);
        pip.setVisibility(in ? View.VISIBLE : View.GONE);
    }

    // ── server unreachable ──
    private void serverDown(Uri u) {
        failed = true;
        retryUrl = ours(u) ? u.toString() : HOME;
        showDown(true);
    }

    private void showDown(boolean on) {
        if (down == null) return;
        ui.removeCallbacks(retry);
        down.setVisibility(on ? View.VISIBLE : View.GONE);
        if (on) ui.postDelayed(retry, RETRY_MS);
    }

    private void retryNow() { if (down != null && down.getVisibility() == View.VISIBLE) web.loadUrl(retryUrl); }

    private void goHome() {
        clearHist = true;
        retryUrl = HOME;
        web.loadUrl(HOME);
    }

    private static boolean atHome(String url) {
        if (url == null) return true;
        String path = Uri.parse(url).getPath();
        return path == null || path.isEmpty() || "/".equals(path) || "/app".equals(path) || path.startsWith("/login");
    }

    private View buildDown() {
        down = new LinearLayout(this);
        down.setOrientation(LinearLayout.VERTICAL);
        down.setGravity(Gravity.CENTER);
        down.setPadding(64, 64, 64, 64);
        down.setBackgroundColor(Color.parseColor("#f7f6f2"));
        down.setClickable(true);
        down.setVisibility(View.GONE);
        TextView t = new TextView(this);
        t.setText(R.string.down_title);
        t.setTextSize(20); t.setTextColor(Color.parseColor("#1f1f1f")); t.setGravity(Gravity.CENTER);
        t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        TextView d = new TextView(this);
        d.setText(R.string.down_text);
        d.setTextSize(15); d.setTextColor(Color.parseColor("#4B5563")); d.setGravity(Gravity.CENTER);
        d.setPadding(0, 24, 0, 40);
        Button again = new Button(this);
        again.setText(R.string.retry_now);
        again.setOnClickListener(x -> { ui.removeCallbacks(retry); web.loadUrl(retryUrl); ui.postDelayed(retry, RETRY_MS); });
        Button home = new Button(this);
        home.setText(R.string.go_home);
        home.setOnClickListener(x -> goHome());
        down.addView(t); down.addView(d); down.addView(again); down.addView(home);
        return down;
    }

    @Override public void onBackPressed() {
        String now = web.getUrl();
        if (down.getVisibility() == View.VISIBLE && !HOME.equals(retryUrl)) goHome();
        else if (down.getVisibility() == View.VISIBLE) { if (backTwice(R.string.back_reopening)) goHome(); }   // start page down too: stay and reconnect now (owner 2026-10-01 "back just closes the app")
        else if (web.canGoBack()) web.goBack();
        else if (!atHome(now)) goHome();
        else if (voiceOn && pipOk()) { try { enterPictureInPictureMode(pipBuild()); } catch (Exception e) { moveTaskToBack(true); } }
        else backTwice(R.string.back_again);   // two presses within 2 s to leave — voice mode goes on
    }

    /** Second press within 2 s: send the app back and return false. First press: show a hint and return true (the app stays). */
    private boolean backTwice(int say) {
        long t = SystemClock.uptimeMillis();
        if (t - backAt < 2000) { backAt = 0; moveTaskToBack(true); return false; }
        backAt = t;
        Toast.makeText(this, say, Toast.LENGTH_SHORT).show();
        return true;
    }

    @Override protected void onDestroy() {
        ui.removeCallbacks(retry);
        Voice.get(this).detach(web);
        stopService(new Intent(this, VoiceService.class));
        web.destroy();
        super.onDestroy();
    }
}
