import { one } from "@/lib/db";
import { LANG_COOKIE } from "@/lib/i18n";
import { langCookie, langOfRequest } from "@/lib/i18n-server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/app-url";
import { createSession, sessionCookie, upsertUser } from "@/lib/session";
import { githubClientId, githubClientSecret, pickGithubEmail } from "@/lib/github-env";
import { TZ_COOKIE } from "@/lib/tz";
import { APP_COOKIE, appHandoff, appNonce } from "@/lib/app-login";
import { asMember, q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { hint, seal } from "@/lib/crypto";

const gh = (path: string, tok: string) =>
  fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/vnd.github+json", "User-Agent": "Unchore", "X-GitHub-Api-Version": "2022-11-28" } }).catch(() => null);

export async function GET(req: Request) {
  const base = appUrl(req);
  const url = new URL(req.url);
  const jar = await cookies();
  const state = jar.get("uc_hs")?.value;
  const verifier = jar.get("uc_hv")?.value;
  const code = url.searchParams.get("code");
  if (!code || !state || !verifier || url.searchParams.get("state") !== state) return NextResponse.redirect(`${base}/login?e=github_state`);
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code, code_verifier: verifier, client_id: githubClientId(), client_secret: githubClientSecret(),
      redirect_uri: `${base}/api/auth/github/callback`,
    }),
  }).catch(() => null);
  const tok = r?.ok ? ((await r.json().catch(() => ({}))) as { access_token?: string }).access_token : undefined;
  if (!tok) return NextResponse.redirect(`${base}/login?e=github_token`);
  // «Connect GitHub» (app/api/connect/github/start): keep the token as the signed-in member's saved secret GITHUB_TOKEN, encrypted.
  const connectFor = jar.get("uc_gc")?.value;
  if (connectFor) {
    const me = await currentUser();
    const res = NextResponse.redirect(`${base}/app?connected=github`);
    for (const c of ["uc_hs", "uc_hv", "uc_gc"]) res.cookies.delete(c);
    if (!me || me.id !== connectFor) return NextResponse.redirect(`${base}/login`);
    await asMember(me.id, () => q("insert into vault(user_id, name, enc, hint) values ($1, 'GITHUB_TOKEN', $2, $3) on conflict (user_id, name) do update set enc = excluded.enc, hint = excluded.hint, updated_at = now()",
      [me.id, seal(tok), hint(tok)]));
    return res;
  }
  // Sign-in: the token is used only here to read who signed in; it is not stored.
  const [ur, er] = await Promise.all([gh("/user", tok), gh("/user/emails", tok)]);
  const user = ur?.ok ? ((await ur.json().catch(() => null)) as { login?: string; name?: string | null; avatar_url?: string } | null) : null;
  const email = er?.ok ? pickGithubEmail(await er.json().catch(() => null)) : null;
  if (!user || !email) return NextResponse.redirect(`${base}/login?e=github_email`);
  const lang = langOfRequest(req, jar.get(LANG_COOKIE)?.value);
  const uid = await upsertUser(email, { name: user.name || user.login || null, avatar: user.avatar_url ?? null, lang, tz: jar.get(TZ_COOKIE)?.value ?? null });
  const nonce = appNonce(jar.get(APP_COOKIE)?.value);
  if (nonce) {   // started from the Android app: hand the sign-in to the app (lib/app-login.ts)
    const res = await appHandoff(email, lang, jar.get(TZ_COOKIE)?.value ?? null, nonce);
    res.cookies.delete("uc_hs"); res.cookies.delete("uc_hv");
    return res;
  }
  const sid = await createSession(uid);
  const res = NextResponse.redirect(`${base}/app`);
  res.cookies.set(sessionCookie(sid));
  const saved = await one<{ lang: string }>("select lang from users where id = $1", [uid]);
  res.cookies.set(langCookie(saved?.lang ?? lang));
  res.cookies.delete("uc_hs");
  res.cookies.delete("uc_hv");
  return res;
}
