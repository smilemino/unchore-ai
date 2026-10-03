package ai.unchore.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * The notification service that is up while voice mode is on — Android lets an app keep the mic and sound behind other apps
 * (maps, YouTube) or with the screen off only while such a service shows. Started and stopped by the page (UnchoreAndroid.voiceSession).
 * Also: a media session, so the lock screen, the notification shade and a headset button can «Stop and listen» or «End»;
 * and a phone-call watch — the page goes quiet during a call and carries on after it.
 */
public class VoiceService extends Service {
    static final String CH = "voice";
    static final String ACT_INTERRUPT = "ai.unchore.app.INTERRUPT";
    static final String ACT_END = "ai.unchore.app.END";
    private static final long CALL_POLL_MS = 500;   // the phone's sound mode is not «normal» during a call (also internet calls) — needs no extra right
    private final Handler main = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock lock;
    private MediaSession media;
    private boolean inCall;
    private final Runnable callWatch = new Runnable() {
        @Override public void run() {
            boolean now = getSystemService(AudioManager.class).getMode() != AudioManager.MODE_NORMAL;
            if (now != inCall) { inCall = now; Voice.get(VoiceService.this).call(now); }
            main.postDelayed(this, CALL_POLL_MS);
        }
    };
    private final BroadcastReceiver buttons = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (ACT_END.equals(i.getAction())) Voice.get(c).end(); else Voice.get(c).interrupt();
        }
    };

    static void channel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CH) != null) return;
        NotificationChannel ch = new NotificationChannel(CH, c.getString(R.string.voice_channel), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(c.getString(R.string.voice_channel_desc));
        nm.createNotificationChannel(ch);
    }

    private PendingIntent act(String action, int code) {
        return PendingIntent.getBroadcast(this, code, new Intent(action).setPackage(getPackageName()), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        IntentFilter f = new IntentFilter(ACT_INTERRUPT);
        f.addAction(ACT_END);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(buttons, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(buttons, f);
        media = new MediaSession(this, "unchore-voice");
        media.setCallback(new MediaSession.Callback() {   // headset button · lock screen · notification shade
            @Override public void onPlay() { Voice.get(VoiceService.this).interrupt(); }
            @Override public void onPause() { Voice.get(VoiceService.this).interrupt(); }
            @Override public void onStop() { Voice.get(VoiceService.this).end(); }
        });
        media.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
            .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build());
        media.setMetadata(new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, getString(R.string.voice_title))
            .putString(MediaMetadata.METADATA_KEY_ARTIST, getString(R.string.app_name)).build());
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        channel(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CH)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.voice_title))
            .setContentText(getString(R.string.voice_text))
            .setContentIntent(pi)
            .setOngoing(true)
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_media_pause), getString(R.string.stop_listen), act(ACT_INTERRUPT, 1)).build())
            .addAction(new Notification.Action.Builder(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), getString(R.string.end_voice), act(ACT_END, 2)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(media.getSessionToken()).setShowActionsInCompactView(0, 1))
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(1, n);
        } catch (Exception e) {   // no mic right yet: Android 14+ refuses — voice mode still works on screen, only not behind other apps
            stopSelf();
            return START_NOT_STICKY;
        }
        media.setActive(true);
        main.removeCallbacks(callWatch);
        inCall = false;   // a new voice mode — a call already on is told at the first check
        main.post(callWatch);
        if (lock == null) {
            lock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "unchore:voice");
            lock.acquire(4 * 60 * 60 * 1000L);   // keeps working with the screen off; lets go after four hours (voice mode left on by mistake)
        }
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        main.removeCallbacks(callWatch);
        if (inCall) { inCall = false; Voice.get(this).call(false); }   // closed during a call — the next voice mode must not start quiet
        try { unregisterReceiver(buttons); } catch (Exception ignored) { }
        if (media != null) { media.setActive(false); media.release(); media = null; }
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        super.onDestroy();
    }
}
