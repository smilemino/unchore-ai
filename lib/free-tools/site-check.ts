// Free tool «is my site locked properly» (benchmark 2026-10-01, lookup type · leads to Unchore's security check, Defend):
// one GET of a public web address, then the security headers and cookie flags read out plainly.
// Safety: only http/https on ports 80/443, the address must resolve to a public IP (checked at connect time, so a name
// can't switch to an inside address between the check and the request), at most 3 redirects, 8 s, 200 KB read.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export type Finding = { id: string; ok: boolean; weight: number };
export type SiteReport = { url: string; status: number; https: boolean; findings: Finding[]; score: number; grade: string; server?: string };

/** Loopback, private, link-local, carrier NAT, multicast, reserved and the cloud metadata address — never fetched. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const x = ip.toLowerCase();
  // An IPv4 address inside IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1, ::127.0.0.1, 64:ff9b::7f00:1) is judged as that IPv4 address.
  const tail = /^(?:::(?:ffff:)?|64:ff9b::)(.+)$/.exec(x)?.[1];
  if (tail) {
    if (isIP(tail) === 4) return isPrivateIp(tail);
    const h = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (h) { const a = parseInt(h[1]!, 16), b = parseInt(h[2]!, 16); return isPrivateIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
  }
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff") || x.startsWith("64:ff9b");
}

/** A web address a visitor typed → a URL we may fetch, or null. */
export function cleanTarget(raw: string): URL | null {
  let s = raw.trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  const h = u.hostname.toLowerCase();
  if ((!h.includes(".") && !h.startsWith("[")) || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost") return null;
  // Addresses typed as numbers skip the name lookup that checks them at connect time: only a public IPv4 number is allowed.
  const bare = h.replace(/^\[|\]$/g, "");
  if (isIP(bare) === 6 || (isIP(bare) === 4 && isPrivateIp(bare))) return null;
  return u;
}

type Got = { status: number; headers: http.IncomingHttpHeaders };

/** One request; the name is resolved inside the connection and refused if it points inside. */
function once(u: URL): Promise<Got> {
  return new Promise((ok, fail) => {
    const safeLookup = (host: string, opts: object, cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
      dnsLookup(host, { all: true }, (err, list) => {
        if (err) return cb(err, "", 4);
        const bad = (list as LookupAddress[]).find((a) => isPrivateIp(a.address));
        if (bad || !(list as LookupAddress[]).length) return cb(Object.assign(new Error("not a public address"), { code: "EPRIVATE" }), "", 4);
        const first = (list as LookupAddress[])[0]!;
        if ((opts as { all?: boolean }).all) return cb(null, list as LookupAddress[]);
        cb(null, first.address, first.family);
      });
    };
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, { method: "GET", lookup: safeLookup as never, timeout: 8000, headers: { "user-agent": "UnchoreSiteCheck/1.0 (+https://unchore.ai/tools/site-check)", accept: "text/html,*/*" } }, (res) => {
      let n = 0;
      res.on("data", (c: Buffer) => { n += c.length; if (n > 200_000) res.destroy(); });
      res.on("end", () => ok({ status: res.statusCode ?? 0, headers: res.headers }));
      res.on("close", () => ok({ status: res.statusCode ?? 0, headers: res.headers }));
      res.on("error", () => ok({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", fail);
    req.end();
  });
}

/** Follow up to 3 redirects (each hop checked again), then read the headers. */
export async function checkSite(raw: string, fetchOnce: (u: URL) => Promise<Got> = once): Promise<SiteReport | { error: "bad_address" | "unreachable" }> {
  let u = cleanTarget(raw);
  if (!u) return { error: "bad_address" };
  let got: Got | null = null;
  for (let hop = 0; hop < 4; hop++) {
    try { got = await fetchOnce(u); } catch { return { error: "unreachable" }; }
    const loc = got.headers.location;
    if (got.status >= 300 && got.status < 400 && loc && hop < 3) {
      const next = cleanTarget(new URL(String(loc), u).toString());
      if (!next) return { error: "bad_address" };
      u = next;
      continue;
    }
    break;
  }
  return grade(u, got!);
}

const has = (h: http.IncomingHttpHeaders, k: string) => h[k] !== undefined && String(h[k]).trim() !== "";

/** The headers → findings, a 0–100 score and a letter. Pure (tests feed it headers). */
export function grade(u: URL, g: Got): SiteReport {
  const h = g.headers;
  const cookies = ([] as string[]).concat(h["set-cookie"] ?? []);
  const csp = String(h["content-security-policy"] ?? "");
  const f: Finding[] = [
    { id: "https", ok: u.protocol === "https:", weight: 25 },
    { id: "hsts", ok: u.protocol === "https:" && /max-age=\d{6,}/i.test(String(h["strict-transport-security"] ?? "")), weight: 15 },
    { id: "csp", ok: csp.length > 0, weight: 15 },
    { id: "frames", ok: /frame-ancestors/i.test(csp) || /^(deny|sameorigin)$/i.test(String(h["x-frame-options"] ?? "").trim()), weight: 10 },
    { id: "nosniff", ok: /nosniff/i.test(String(h["x-content-type-options"] ?? "")), weight: 10 },
    { id: "referrer", ok: has(h, "referrer-policy"), weight: 8 },
    { id: "permissions", ok: has(h, "permissions-policy"), weight: 5 },
    { id: "cookies", ok: cookies.every((c) => /;\s*secure/i.test(c) && /;\s*httponly/i.test(c) && /;\s*samesite=/i.test(c)), weight: 7 },
    { id: "version", ok: !/\d/.test(String(h.server ?? "")) && !has(h, "x-powered-by"), weight: 5 },
  ];
  const score = f.reduce((s, x) => s + (x.ok ? x.weight : 0), 0);
  const letter = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { url: u.toString(), status: g.status, https: u.protocol === "https:", findings: f, score, grade: letter, server: h.server ? String(h.server).slice(0, 60) : undefined };
}
