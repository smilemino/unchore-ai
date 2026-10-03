// Free tools (benchmark 2026-10-01 · owner «yes» 00:19): the cron reader, chore cost, chore type, live AI prices,
// the website check's address guard, the test-browser filter, own-domain marks, and what search engines may index.
import { describe, expect, it } from "vitest";
import { makeT } from "@/lib/i18n";
import { buildCron, describeCron, nextRuns, parseCron } from "@/lib/free-tools/cron";
import { choreCost } from "@/lib/free-tools/chore";
import { QUESTIONS, TYPES, choreType } from "@/lib/free-tools/chore-type";
import { ROLES } from "@/lib/free-tools/ideas";
import { monthlyCost, pickModels } from "@/lib/free-tools/ai-cost";
import { checkSite, cleanTarget, grade, isPrivateIp } from "@/lib/free-tools/site-check";
import { TOOLS, hlOf, toolMeta, toolPath } from "@/lib/free-tools";
import { RECIPE_TITLES } from "@/lib/recipe-titles";
import { SOFT_ERROR, hardErrors, RUN_CHECK } from "@/lib/build-run";
import { cleanDomain, dnsFor, readDomainMarks } from "@/lib/build";
import { hideMarks } from "@/lib/chat-setup";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const t = makeT(null);

describe("cron ↔ plain words", () => {
  it("reads the common shapes", () => {
    expect(describeCron("30 9 * * 1-5", t)).toBe("At 09:30 · on weekdays (Monday to Friday)");
    expect(describeCron("*/15 * * * *", t)).toBe("Every 15 minutes");
    expect(describeCron("0 * * * *", t)).toBe("Every hour at minute 0");
    expect(describeCron("0 8 1 * *", t)).toBe("At 08:00 · on day 1 of the month");
    expect(describeCron("@daily", t)).toBe("At 00:00 · every day");
    expect(describeCron("0 9 * * sat,sun", t)).toBe("At 09:00 · on weekends");
    expect(describeCron("0 9 * * 7", t)).toBe("At 09:00 · on Sunday");
  });
  it("refuses what isn't a cron line", () => {
    expect(() => parseCron("* * *")).toThrow();
    expect(() => parseCron("61 * * * *")).toThrow();
    expect(() => parseCron("5-1 * * * *")).toThrow();
    expect(() => parseCron("*/0 * * * *")).toThrow();
  });
  it("builds from plain choices and lists the next runs", () => {
    expect(buildCron({ every: "weekdays", hour: 9, minute: 30 })).toBe("30 9 * * 1-5");
    expect(buildCron({ every: "minutes", n: 99 })).toBe("*/59 * * * *");
    expect(buildCron({ every: "month", day: 40, hour: 7, minute: 5 })).toBe("5 7 31 * *");
    const from = new Date(2026, 9, 2, 10, 0);   // a Friday, local time
    const runs = nextRuns("30 9 * * 1-5", 3, from);
    expect(runs.map((d) => [d.getDay(), d.getHours(), d.getMinutes()])).toEqual([[1, 9, 30], [2, 9, 30], [3, 9, 30]]);
    expect(nextRuns("0 0 29 2 *", 1, new Date(2026, 0, 1))[0]!.getFullYear()).toBe(2028);   // next leap day
  });
});

describe("chore cost, ideas and chore type", () => {
  it("counts hours, working days and money a year", () => {
    expect(choreCost({ minutes: 10, times: 1, per: "workday" })).toEqual({ hoursYear: 41.7, daysYear: 5.2, moneyYear: null, hours5y: 208 });
    expect(choreCost({ minutes: 30, times: 2, per: "week", hourly: 50 }).moneyYear).toBe(2600);
    expect(choreCost({ minutes: -5, times: 3, per: "day" }).hoursYear).toBe(0);
  });
  it("every idea's recipe exists, and each role has six", () => {
    for (const r of ROLES) { expect(r.ideas).toHaveLength(6); for (const i of r.ideas) if (i.recipe) expect(RECIPE_TITLES[i.recipe]).toBeTruthy(); }
  });
  it("picks the type chosen most; each question offers every type once", () => {
    expect(choreType(["juggler", "collector", "juggler"])).toBe("juggler");
    for (const q of QUESTIONS) expect(new Set(q.a.map((a) => a[1]))).toEqual(new Set(Object.keys(TYPES)));
  });
});

describe("AI cost", () => {
  it("keeps the newest two priced models of each maker, no variants", () => {
    const m = pickModels([
      { id: "anthropic/claude-a", name: "Anthropic: Claude A", created: 3, pricing: { prompt: "0.000003", completion: "0.000015" } },
      { id: "anthropic/claude-b", created: 2, pricing: { prompt: "0.000001", completion: "0.000005" } },
      { id: "anthropic/claude-c", created: 1, pricing: { prompt: "0.000001", completion: "0.000005" } },
      { id: "anthropic/claude-a:batch", created: 9, pricing: { prompt: "0.000001", completion: "0.000001" } },
      { id: "openai/free-one", created: 9, pricing: { prompt: "0", completion: "0" } },
      { id: "typesafe/jev-router", created: 9, pricing: { prompt: "-1", completion: "-1" } },
    ]);
    expect(m.map((x) => x.id)).toEqual(["anthropic/claude-a", "anthropic/claude-b"]);
    expect(m[0]).toMatchObject({ name: "Claude A", inPerM: 3, outPerM: 15 });
  });
  it("a month of use", () => {
    expect(monthlyCost({ inPerM: 3, outPerM: 15 }, { perDay: 10, wordsIn: 1000, wordsOut: 1000 })).toBeCloseTo((300 * (1350 * 3 + 1350 * 15)) / 1e6, 6);
  });
});

describe("website check never reaches inside", () => {
  it("private and special addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::a00:1", "::127.0.0.1", "224.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "76.76.21.21", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
  it("only public web addresses on the usual ports", () => {
    expect(cleanTarget("example.com")?.toString()).toBe("https://example.com/");
    for (const bad of ["localhost", "http://127.0.0.1", "http://[::1]/", "http://[::ffff:7f00:1]/", "http://[::ffff:127.0.0.1]/", "http://2130706433/", "http://0x7f.1/", "ftp://example.com", "https://a:b@example.com", "https://example.com:8080", "intranet", "printer.local", "http://169.254.169.254/latest"]) expect(cleanTarget(bad)).toBeNull();
  });
  it("a redirect into an inside address is refused; headers are graded", async () => {
    const hop = async (u: URL) => u.hostname === "example.com" ? { status: 301, headers: { location: "http://127.0.0.1/admin" } } : { status: 200, headers: {} };
    expect(await checkSite("example.com", hop)).toEqual({ error: "bad_address" });
    const good = grade(new URL("https://example.com/"), { status: 200, headers: {
      "strict-transport-security": "max-age=63072000", "content-security-policy": "default-src 'self'; frame-ancestors 'none'", "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin", "permissions-policy": "camera=()", "set-cookie": ["s=1; Secure; HttpOnly; SameSite=Lax"], server: "Vercel" } });
    expect(good).toMatchObject({ score: 100, grade: "A" });
    const bare = grade(new URL("http://example.com/"), { status: 200, headers: { server: "nginx/1.18.0", "x-powered-by": "PHP/7.4" } });
    expect(bare.grade).toBe("F");
    expect(bare.findings.find((f) => f.id === "version")?.ok).toBe(false);
  });
});

describe("app builds: the test browser and own domains", () => {
  it("errors only a test browser has are left out", () => {
    expect(hardErrors(["AudioContext is not defined", "TypeError: Cannot read properties of null (reading 'getContext')", "TypeError: x is not a function"])).toEqual(["TypeError: x is not a function"]);
    expect(SOFT_ERROR.test("ReferenceError: total is not defined")).toBe(false);
    expect(RUN_CHECK).toContain('await import("happy-dom")');
    expect(() => new Function(RUN_CHECK.replace(/^import .*$/m, "").replace(/await /g, ""))).not.toThrow();   // the script parses
  });
  it("reads a domain mark, refuses our own names, and says which DNS line to set", () => {
    const r = readDomainMarks('Sure.\n<<<domain {"app":"https://uc-water-abc.vercel.app","domain":"https://Water.MyShop.com/"}>>>');
    expect(r).toEqual({ text: "Sure.", asks: [{ app: "https://uc-water-abc.vercel.app", domain: "water.myshop.com" }] });
    for (const bad of ["unchore.ai", "x.vercel.app", "localhost", "no_dot", "-bad.com", "a.b"]) expect(cleanDomain(bad)).toBeNull();
    expect(dnsFor("myshop.com")).toEqual({ type: "A", name: "@", value: "76.76.21.21" });
    expect(dnsFor("myshop.co.kr")).toEqual({ type: "A", name: "@", value: "76.76.21.21" });
    expect(dnsFor("app.myshop.co.kr")).toEqual({ type: "CNAME", name: "app", value: "cname.vercel-dns.com" });
    expect(hideMarks('ok <<<domain {"app":"a","domain":"b.com"}>>>')).toBe("ok");
  });
});

describe("what search engines may index", () => {
  it("English and Korean tool pages only, each its own address", () => {
    expect(toolMeta("cron", "en", null, "T", "D").robots.index).toBe(true);
    expect(toolMeta("cron", "ko", "ko", "T", "D").robots.index).toBe(true);
    expect(toolMeta("cron", "ko", null, "T", "D").robots.index).toBe(false);   // Korean shown at the English address
    expect(toolMeta("cron", "ja", "ja", "T", "D").robots.index).toBe(false);   // other languages wait
    expect(toolMeta("cron", "ko", "ko", "T", "D").alternates.canonical).toBe("/tools/cron?hl=ko");
    expect(toolPath(null, "en")).toBe("/tools");
    expect(hlOf({ hl: "ko" })).toBe("ko");
    expect(hlOf({ hl: "xx" })).toBeNull();
  });
  it("the sitemap lists every tool twice and «What's new»; the API and signed-in screens are closed to crawlers", () => {
    const urls = sitemap().map((x) => x.url);
    expect(urls).toHaveLength((TOOLS.length + 1) * 2 + 2);
    expect(urls).toContain("https://unchore.ai/tools/site-check?hl=ko");
    expect(JSON.stringify(robots().rules)).toContain("/api/");
  });
});
