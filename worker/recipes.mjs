// Browser recipes (ported from the 2026-09-29 overnight test that scored 8/8 with 0 wrong values).
// Rule: return a value only when the matching line is found; otherwise ok:false with the reason.

const ACC = ["케이스", "필름", "거치대", "충전기", "케이블", "커버", "스트랩", "렌탈", "중고", "리퍼", "액세서리", "보호", "기기변경", "번호이동", "완납", "공시", "요금제", "개통", "약정", "SKT", "KT", "LG U", "해외", "이어버드 단품", "이어팁", "한쪽"];
const ALIAS = { "에어팟": "airpods", "c타입": "usbc", "타입c": "usbc", "아이패드": "ipad", "에어": "air", "프로": "pro", "맥북": "macbook", "아이폰": "iphone", "갤럭시": "galaxy", "울트라": "ultra", "애플워치": "applewatch", "미니": "mini" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Night 2026-10-01 round 14: «USB C», «USBC», «C타입», «AirPods Pro 2» found nothing on a page listing «에어팟 프로2 … USB-C»
// (the AI names the product its own way) — spaces, hyphens and dots are dropped and both sides go through the aliases.
const norm = (s) => String(s).replace(/[\s\-_.·]/g, "").toLowerCase();
const aliased = (s) => { let e = s; for (const [k, v] of Object.entries(ALIAS)) e = e.split(k).join(v); return e; };
export function has(word, name) {
  const w = norm(word), n = norm(name);
  return n.includes(w) || aliased(n).includes(aliased(w));
}

/** The lowest price among the listed [name, price] pairs that match every word and aren't accessories. */
export function pickLowest(items, must_words, min_price = 0) {
  const ok = [];
  for (const [name, price] of items) {
    const v = Number(String(price).replace(/\D/g, "") || 0);
    if (v < min_price || ACC.some((a) => name.includes(a) && !must_words.some((w) => w.includes(a)))) continue;
    if (must_words.every((w) => has(w, name))) ok.push([v, name.trim()]);
  }
  return ok.sort((a, b) => a[0] - b[0]);
}

export async function danawa_lowest(page, { query, must_words, min_price = 0 }) {
  await page.goto("https://search.danawa.com/dsearch.php?query=" + encodeURIComponent(query), { timeout: 60000, waitUntil: "domcontentloaded" });
  await sleep(7000);
  const items = await page.$$eval("li.prod_item", (els) => els.map((e) => [e.querySelector(".prod_name a")?.innerText, e.querySelector(".price_sect strong")?.innerText]).filter((x) => x[0] && x[1]));
  const ok = pickLowest(items, must_words, min_price);
  if (!ok.length) return { ok: false, why: `no matching product (${items.length} on page)` };
  const [v, name] = ok[0];
  return { ok: true, value: v, line: `${name} | ${v.toLocaleString("ko-KR")}원 (Danawa)`, url: "https://search.danawa.com/dsearch.php?query=" + encodeURIComponent(query), items: ok.slice(1, 3).map(([p, n]) => `${n.slice(0, 40)} ${p.toLocaleString("ko-KR")}원`) };
}

/** Lowest fare on the Google Flights page text. KRW = Google Flights Korea (Korean page, proven 2026-09-29);
 * any other currency = the English page in that currency — only a price in that very currency after «Cheapest»/«from» counts,
 * so a stop count or a date is never read as a fare. Pure, so it can be tested on saved page text. */
export function parseFare(text, curr = "KRW") {
  if (curr === "KRW") {
    const m = text.match(/최저가\s*₩([\d,]+)/) || text.match(/₩([\d,]+)부터/);
    return m ? { value: Number(m[1].replace(/,/g, "")), quote: m[0].replace(/\s+/g, " ").trim() } : null;
  }
  const sym = new Intl.NumberFormat("en", { style: "currency", currency: curr }).formatToParts(0).find((p) => p.type === "currency")?.value || curr;
  const money = `(?:${[sym, curr].map((x) => x.replace(/[$.*+?^()[\]{}|\\]/g, "\\$&")).join("|")})\\s?([\\d,]+(?:\\.\\d{1,2})?)`;
  const m = text.match(new RegExp(`Cheapest\\s*(?:from\\s*)?${money}`)) || text.match(new RegExp(`\\bfrom\\s*${money}`, "i"));
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  return value > 0 ? { value, quote: m[0].replace(/\s+/g, " ").trim(), sym } : null;
}

export async function google_flights(page, { frm, to, date, ret, curr }) {
  const c = String(curr || "KRW").toUpperCase();
  const q = `Flights to ${to} from ${frm} on ${date}` + (ret ? ` through ${ret}` : " one way");
  const url = "https://www.google.com/travel/flights?q=" + encodeURIComponent(q) + (c === "KRW" ? "&curr=KRW&hl=ko&gl=KR" : `&curr=${c}&hl=en`);
  await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
  await sleep(10000);
  let t = await page.innerText("body");
  const reject = ["모두 거부", "Reject all"].find((w) => t.includes(w));
  if (reject) {
    await page.getByRole("button", { name: reject }).first().click().catch(() => {});
    await sleep(8000);
    t = await page.innerText("body");
  }
  const f = parseFare(t, c);
  if (!f) return { ok: false, why: "lowest-fare text not found" };
  const shown = c === "KRW" ? `₩${f.value.toLocaleString("ko-KR")}` : `${f.sym}${f.value.toLocaleString("en-US")} ${c}`;
  return { ok: true, value: f.value, line: `${frm}→${to} ${date}${ret ? "~" + ret : " one-way"} lowest ${shown} (Google Flights «${f.quote}»)`, url };
}

/** Meta Ad Library page text (browser locale ko-KR) → ads. Pure, so it can be tested on a saved page. */
export function parseAdLibrary(text) {
  const total = Number((text.match(/결과\s*~?\s*([\d,]+)\s*개/) || text.match(/~?([\d,]+)\s*results?/i) || [])[1]?.replace(/,/g, "") || 0);
  const ads = [];
  for (const chunk of text.split(/라이브러리 ID:|Library ID:/).slice(1)) {
    const lines = chunk.split("\n").map((l) => l.replace(/​/g, "").trim()).filter(Boolean);
    const id = (lines[0] || "").replace(/\D/g, "");
    const d = chunk.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.에 게재 시작함/) || chunk.match(/Started running on ([A-Za-z]{3,9} \d{1,2}, \d{4})/);
    const since = d ? (d.length === 4 ? `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}` : d[1]) : "";
    const at = lines.findIndex((l) => l === "광고 상세 정보 보기" || l === "See ad details" || l === "See summary details");
    if (!id || at < 0) continue;
    const who = (lines[at + 1] || "").split(" 페이지는 ")[0];
    const body = lines.slice(at + 2).find((l) => l !== "광고" && l !== "Sponsored" && l.replace(/[.\s…]/g, "").length > 3) || "";
    ads.push({ id, since, who, first: body.slice(0, 80) });
  }
  return { total, ads };
}

export async function meta_ad_library(page, { query, country = "KR" }) {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(country.toUpperCase())}&is_targeted_country=false&media_type=all&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
  await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
  await sleep(9000);
  const { total, ads } = parseAdLibrary(await page.innerText("body"));
  if (!ads.length) return { ok: false, why: `no ads read for «${query}» (page changed or login wall)` };
  const who = [...new Set(ads.map((a) => a.who))];
  return { ok: true, value: total || ads.length, line: `«${query}» ${country.toUpperCase()} live ads ${total ? "~" + total.toLocaleString("en-US") : ads.length}: ${who.slice(0, 4).join(", ")}${who.length > 4 ? " …" : ""} (Meta Ad Library)`, url,
    items: ads.slice(0, 6).map((a) => `${a.who} — ${a.first}${a.since ? ` (since ${a.since})` : ""}`) };
}

export const RECIPES = { danawa_lowest, google_flights, meta_ad_library };
// The worldwide fare (other currencies) is checked every night under its own name before it is opened to members outside Korea
// (FLIGHTS_WORLD in lib/recipes/index.ts) — a route 45 days out, so the date never goes stale.
const inDays = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
export const CANARIES = [
  ["danawa_lowest", { query: "에어팟 프로 3", must_words: ["에어팟프로3"], min_price: 250000 }],
  ["google_flights", () => ({ frm: "JFK", to: "LHR", date: inDays(45), ret: null, curr: "USD" }), "google_flights_world"],
];
