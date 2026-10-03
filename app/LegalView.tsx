import { k } from "@/lib/i18n";
import Link from "next/link";
import { LEGAL, SUPPORT_EMAIL, UPDATED } from "@/lib/legal";
import { requestLang, trFor } from "@/lib/i18n-server";

const LINKS = [["about", k("About")], ["pricing", k("Pricing")], ["terms", k("Terms")], ["refund", k("Refunds")], ["privacy", k("Privacy")], ["contact", k("Contact")]] as const;

// One layout for all six public pages (about · pricing · terms · refund · privacy · contact) — plain text, public, no login.
// The page frame follows the visitor's language; the policy text itself stays in English, the version that counts
// (a machine translation of a legal text would be a promise nobody checked — 2026-09-30).
export default async function LegalView({ page }: { page: keyof typeof LEGAL }) {
  const p = LEGAL[page];
  const lang = await requestLang();
  const t = trFor(lang);
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 flex flex-col gap-4">
      <Link href="/" className="font-semibold">← Unchore</Link>
      <h1 className="text-2xl font-semibold">{t(p.title)}</h1>
      {lang !== "en" && <p className="text-sm rounded-lg bg-panel px-3 py-2 text-fg-2">{t("This page is in English. The English text is the official version.")}</p>}
      {p.updated && <p className="text-sm text-fg-2">{t("Last updated: {date}", { date: UPDATED })}</p>}
      {p.body.map((t, i) => <p key={i} className="leading-relaxed">{t}</p>)}
      {page !== "contact" && <p className="text-fg-2">{t("Questions?")} <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>}
      <footer className="mt-8 border-t border-line pt-4 text-sm text-fg-2 flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.map(([href, label]) => <Link key={href} href={`/${href}`} className="underline">{t(label)}</Link>)}
        <span className="w-full">© 2026 Unchore, Inc.</span>
      </footer>
    </main>
  );
}
