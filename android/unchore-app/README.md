# Unchore Android app (ai.unchore.app)

Owner decision 2026-09-30: put Unchore on Google Play with YouTube-style conveniences — keep talking over the maps app, notifications.
The app shows unchore.ai in a web view and adds what a web page can't do on a phone.

| What | Where |
|---|---|
| Voice mode keeps listening and answering behind other apps / screen off — phone dictation + voice in a notification service | `VoiceService`, `Voice`, page side `components/native-app.ts` |
| Small floating window over other apps (picture-in-picture) while voice mode is on, «Stop and listen» button | `MainActivity` pip… |
| Goes quiet during a phone call (also internet calls), carries on after it | `VoiceService` call watch → `Chat.tsx` nativeCtl |
| Lock screen / notification shade / headset button: «Stop and listen», «End» | `VoiceService` media session + actions |
| Notifications (reminders, finished automations, «your app is ready») — checked every 15 min and on opening | `InboxJob` ↔ `/api/push/app`, `lib/push.ts` → `app_inbox` (DB 020) |
| Speaks first: a «your work is done» notice under 10 min old is read aloud — not when silent / vibrate / do-not-disturb / in a call | `InboxJob.mayTalk`/`speak` ↔ `say` from `lib/app-talk.ts` |
| Sign-in with Google/GitHub: opens in the phone's browser, handed back with a one-time link + the app's nonce | `MainActivity.signInOutside` ↔ `lib/app-login.ts` |
| unchore.ai links open the app | manifest App Links ↔ `/.well-known/assetlinks.json` |
| «Share → Unchore» (text, links) fills a new chat · long-press icon: New chat, Automations | manifest, `res/xml/shortcuts.xml` |
| Server unreachable: our own page, retries every 10 s | `MainActivity` down… |

Built for Google Play: no self-update, no «install other apps», no battery-optimisation request, no always-on service.
Foreground service types to declare in Play Console: **microphone** and **mediaPlayback** (voice mode only, started by the user).

- Build: `bash android/unchore-app/build.sh [out]` (≈10 s) → `Unchore.apk` (install to try) and `Unchore.aab` (upload to Play). Target API 36, min 26.
- Key: `/workspace/.secrets/unchore-app.jks` (upload key · backup `/workspace/04_backup/20260930_unchore_app_key/`). After Play App Signing, add Play's SHA-256 to `lib/app-login.ts` APP_CERTS.
- UI strings: `res/values` (English) and `res/values-ko`. The page itself follows the member's language (58).
- Not yet: FCM push (instant notifications — needs a Firebase project), sharing images/files into a chat, home-screen widget, fingerprint lock.
