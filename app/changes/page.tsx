import Link from "next/link";
import { langInfo } from "@/lib/i18n";
import { requestLang, trFor } from "@/lib/i18n-server";
import { CHANGES } from "@/lib/changelog";
import { INDEXED, hlOf } from "@/lib/free-tools";
import { LogoMark } from "@/components/LogoMark";

type SP = Promise<Record<string, string | string[] | undefined>>;
const path = (hl: string | null) => `/changes${hl && hl !== "en" ? `?hl=${hl}` : ""}`;

export async function generateMetadata({ searchParams }: { searchParams: SP }) {
  const hl = hlOf(await searchParams), lang = hl ?? (await requestLang()), t = trFor(lang);
  return { title: `${t("What's new")} — Unchore`, description: t("Everything that changed in Unchore, newest first."),
    alternates: { canonical: path(hl), languages: { en: path("en"), ko: path("ko"), "x-default": path("en") } },
    robots: { index: INDEXED.includes(hl ?? "en") && (hl ?? "en") === lang, follow: true } };
}

// Public build log — newest first, dates as written (UTC+9 days, when the change went live).
export default async function Changes({ searchParams }: { searchParams: SP }) {
  const hl = hlOf(await searchParams), lang = hl ?? (await requestLang()), t = trFor(lang);
  return (
    <main className="mx-auto max-w-3xl px-5 py-6 flex flex-col gap-5">
      <header className="flex items-center gap-3 text-sm"><Link href="/" className="flex items-center gap-1.5 font-semibold"><LogoMark /> Unchore</Link><Link href={`/tools${hl && hl !== "en" ? `?hl=${hl}` : ""}`} className="text-fg-2 underline">{t("Free tools")}</Link></header>
      <h1 className="text-2xl font-semibold">{t("What's new")}</h1>
      {CHANGES.map((d) => (
        <section key={d.date} className="flex flex-col gap-2">
          <h2 className="font-medium text-fg-2">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" })}</h2>
          <ul className="list-disc pl-5 flex flex-col gap-1">{d.items.map((x) => <li key={x}>{t(x)}</li>)}</ul>
        </section>))}
      <footer className="flex gap-4 text-xs text-fg-2"><Link href={path("en")} className="underline">{langInfo("en").name}</Link><Link href={path("ko")} className="underline">{langInfo("ko").name}</Link><span>© 2026 Unchore, Inc.</span></footer>
    </main>
  );
}
