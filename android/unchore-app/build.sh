#!/usr/bin/env bash
# Builds the Unchore Android app without Gradle — SDK tools only (javac → d8 → aapt2 → zipalign → apksigner), like AI Soul's app.
# Makes two files: Unchore.apk (install on a phone to try) and Unchore.aab (what Google Play takes; bundletool).
# Use: bash android/unchore-app/build.sh [output folder]   (default /workspace/unchore-app)
# Signing key: /workspace/.secrets/unchore-app.jks (password UNCHORE_APP_KS_PASS in /workspace/.secrets/unchore.env · backup
#   /workspace/04_backup/20260930_unchore_app_key/). Its SHA-256 print is in lib/app-login.ts APP_CERTS (unchore.ai links open the app).
#   On Google Play this is the «upload key»; Play re-signs with its own key — add Play's print to APP_CERTS too.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/workspace/unchore-app}"
TOOLS=/workspace/tools/android
BT="$TOOLS/sdk/build-tools/36.0.0"; AJ="$TOOLS/sdk/platforms/android-36/android.jar"
BUNDLETOOL="${BUNDLETOOL:-/root/tools/bundletool.jar}"
SEC=/workspace/.secrets/unchore.env; KS=/workspace/.secrets/unchore-app.jks
VCODE="${VCODE:-$(TZ=Asia/Seoul date +%y%m%d%H)}"
PREV="$(grep -o '"version":[0-9]*' "$OUT/Unchore.json" 2>/dev/null | cut -d: -f2 || true)"
[ -n "$PREV" ] && [ "$VCODE" -le "$PREV" ] && VCODE=$((PREV + 1))   # Play and phones only take a bigger number
export JAVA_HOME="$TOOLS/jdk17" PATH="$TOOLS/jdk17/bin:$PATH"
KSP="$({ grep -m1 '^UNCHORE_APP_KS_PASS=' "$SEC" || true; } | cut -d= -f2-)"
[ -n "$KSP" ] && [ -f "$KS" ] || { echo "signing key missing ($KS · UNCHORE_APP_KS_PASS)"; exit 2; }
[ -f "$BUNDLETOOL" ] || { mkdir -p "$(dirname "$BUNDLETOOL")"; curl -sSL -o "$BUNDLETOOL" https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar; }

W="$(mktemp -d /tmp/ucapp.XXXXXX)"; trap 'rm -rf "$W"' EXIT
mkdir -p "$W/obj" "$W/dex" "$W/gen"
"$BT/aapt2" compile --dir "$HERE/res" -o "$W/res.zip"
LINK=(-I "$AJ" --manifest "$HERE/AndroidManifest.xml" "$W/res.zip" --min-sdk-version 26 --target-sdk-version 36 --version-code "$VCODE" --version-name "1.0.$VCODE")
"$BT/aapt2" link "${LINK[@]}" -o "$W/base.apk" --java "$W/gen"
javac -nowarn -Xlint:-options --release 11 -classpath "$AJ" -encoding UTF-8 -d "$W/obj" $(find "$HERE/src" "$W/gen" -name '*.java')
"$BT/d8" --lib "$AJ" --min-api 26 --release --output "$W/dex" $(find "$W/obj" -name '*.class')

# ── APK (to try on a phone) ──
(cd "$W/dex" && zip -q -j "$W/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$W/base.apk" "$W/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KSP" --ks-key-alias unchore --out "$W/signed.apk" "$W/aligned.apk"
"$BT/apksigner" verify "$W/signed.apk"

# ── AAB (Google Play) ──
"$BT/aapt2" link "${LINK[@]}" -o "$W/proto.apk" --proto-format
mkdir -p "$W/mod" && (cd "$W/mod" && unzip -q "$W/proto.apk" && mkdir -p manifest dex && mv AndroidManifest.xml manifest/ && cp "$W/dex/classes.dex" dex/ && zip -q -r "$W/base.zip" .)
java -jar "$BUNDLETOOL" build-bundle --modules="$W/base.zip" --output="$W/app.aab"
jarsigner -keystore "$KS" -storepass "$KSP" -sigalg SHA256withRSA -digestalg SHA-256 "$W/app.aab" unchore >/dev/null
jarsigner -verify "$W/app.aab" | tail -1

mkdir -p "$OUT"
cp "$W/signed.apk" "$OUT/Unchore.apk.tmp" && mv -f "$OUT/Unchore.apk.tmp" "$OUT/Unchore.apk"
cp "$W/app.aab" "$OUT/Unchore.aab.tmp" && mv -f "$OUT/Unchore.aab.tmp" "$OUT/Unchore.aab"
SRC="$(git -C "$HERE" log -1 --format=%H -- . 2>/dev/null || true)"
printf '{"version":%s,"apk_sha256":"%s","aab_sha256":"%s","commit":"%s","built":"%s"}\n' "$VCODE" "$(sha256sum "$OUT/Unchore.apk" | cut -d' ' -f1)" \
  "$(sha256sum "$OUT/Unchore.aab" | cut -d' ' -f1)" "$SRC" "$(TZ=Asia/Seoul date '+%F %T')" > "$OUT/Unchore.json"
echo "built: $OUT/Unchore.apk ($(stat -c %s "$OUT/Unchore.apk") bytes) · $OUT/Unchore.aab ($(stat -c %s "$OUT/Unchore.aab") bytes) · version $VCODE"
