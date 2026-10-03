// Answer claim check (AI Soul lib/claim-check.ts, general form — 2026-10-02 port). AI Soul compares «it's deployed» claims with the
// machine record (git main); here the record is the builds table. An answer that hands the member an app link (<name>.vercel.app,
// where Unchore puts members' apps) is checked against their builds: a link that is not one of their finished apps — invented,
// a build still running, or one that failed — gets a note on top of the answer, so the member is not sent to a page that isn't there.
// Plain text rules here (easy to test); the database read is lib/turn.ts.

/** App links in the text, lower-cased host only (<= 5). */
export function appLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![a-z0-9.-])((?:[a-z0-9-]+\.)+vercel\.app)(?![a-z0-9-]|\.[a-z0-9])/gi)) out.add(m[1]!.toLowerCase());
  return [...out].slice(0, 5);
}

export type BuildRow = { url: string | null; status: string };
const hostOf = (u: string | null) => (u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "");

/** Links the answer gives that are not a finished app: «unknown» (no build has it) or «not done» (its build failed or is still going). */
export function wrongLinks(links: string[], builds: BuildRow[]): Array<{ host: string; why: "unknown" | "unfinished" }> {
  return links.flatMap((host) => {
    const mine = builds.filter((b) => hostOf(b.url) === host);
    if (mine.some((b) => b.status === "done")) return [];
    return [{ host, why: mine.length ? "unfinished" as const : "unknown" as const }];
  });
}
