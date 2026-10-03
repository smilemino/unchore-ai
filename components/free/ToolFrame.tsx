// One frame for every free tool page: the tool first (no sign-up, no pitch above it), then one line about Unchore,
// the other tools, and a language switch. Server component; the tool itself is a client component inside.
import Link from "next/link";
import type { ReactNode } from "react";
import { k, langInfo, type Lang } from "@/lib/i18n";
import { dictFor, requestLang, trFor } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/I18n";
import { LogoMark } from "@/components/LogoMark";
import { TOOLS, hlOf, toolBySlug, toolMeta, toolPath } from "@/lib/free-tools";
import { ToolCta, ToolSource } from "./ToolCta";

type SP = Promise<Record<string, string | string[] | undefined>>;

async function langOf(sp: Record<string, string | string[] | undefined>): Promise<{ lang: Lang; hl: Lang | null }> {
  const hl = hlOf(sp);
  return { lang: hl ?? (await requestLang()), hl };
}

/** generateMetadata + the page for one tool (or the tools list when slug is null). */
export function toolPage(slug: string | null, body: (lang: Lang) => ReactNode | Promise<ReactNode>) {
  const meta = async ({ searchParams }: { searchParams: SP }) => {
    const { lang, hl } = await langOf(await searchParams);
    const t = trFor(lang);
    const tool = slug ? toolBySlug(slug)! : null;
    return toolMeta(slug, lang, hl, tool ? t(tool.title) : t("Free tools that do one job"), tool ? t(tool.blurb) : t("Small free tools — no sign-up. When a chore repeats, Unchore can do it for you every time."));
  };
  async function Page({ searchParams }: { searchParams: SP }) {
    const { lang } = await langOf(await searchParams);
    const t = trFor(lang);
    const tool = slug ? toolBySlug(slug)! : null;
    const inner = await body(lang);
    const ld = tool ? { "@context": "https://schema.org", "@type": "WebApplication", name: t(tool.title), description: t(tool.blurb), url: `https://unchore.ai${toolPath(slug, lang)}`, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, inLanguage: lang } : null;
    return (
      <I18nProvider lang={lang} dict={dictFor(lang)}>
        <main className="mx-auto max-w-3xl px-5 py-6 flex flex-col gap-5" data-testid="free-tool">
          <ToolSource slug={slug ?? "list"} />
          <header className="flex items-center gap-3 text-sm">
            <Link href={toolPath(null, lang)} className="flex items-center gap-1.5 font-semibold"><LogoMark /> Unchore</Link>
            <span className="text-fg-2">{t("Free tools")}</span>
          </header>
          {tool ? <div className="flex flex-col gap-1"><h1 className="text-2xl font-semibold">{tool.emoji} {t(tool.title)}</h1><p className="text-fg-2">{t(tool.blurb)}</p></div>
            : <div className="flex flex-col gap-1"><h1 className="text-2xl font-semibold">{t("Free tools that do one job")}</h1><p className="text-fg-2">{t("No sign-up. Each one does a single job, right here.")}</p></div>}
          {inner}
          {tool && <ToolCta ask={t(tool.ask)} />}
          <nav className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="text-sm font-medium text-fg-2">{tool ? t("More free tools") : t("All tools")}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {TOOLS.filter((x) => x.slug !== slug).map((x) => (
                <Link key={x.slug} href={toolPath(x.slug, lang)} className="rounded-lg border border-line-soft bg-surface px-3 py-2 hover:bg-hover">
                  <div className="font-medium">{x.emoji} {t(x.title)}</div><div className="text-sm text-fg-2">{t(x.blurb)}</div>
                </Link>))}
            </div>
          </nav>
          <footer className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-2">
            <Link href={toolPath(slug, "en")} className="underline">{langInfo("en").name}</Link>
            <Link href={toolPath(slug, "ko")} className="underline">{langInfo("ko").name}</Link>
            <Link href="/changes" className="underline">{t("What's new")}</Link>
            {([["pricing", k("Pricing")], ["privacy", k("Privacy")], ["terms", k("Terms")]] as const).map(([h, l]) => <Link key={h} href={`/${h}`} className="underline">{t(l)}</Link>)}
            <span className="w-full">© 2026 Unchore, Inc. · {t("No ads. Nothing you type here is saved.")}</span>
          </footer>
          {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />}
        </main>
      </I18nProvider>
    );
  }
  return { meta, Page };
}
