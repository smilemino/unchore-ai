import Link from "next/link";
import { asLang } from "@/lib/i18n";
import { trFor } from "@/lib/i18n-server";
import { currentUser } from "@/lib/session";
import { howToVideosNewestFirst } from "@/lib/how-to-videos";
import { HowToPlayer } from "@/components/HowToPlayer";

// Every short how-to video, newest first, each with a button to the screen it teaches (lib/how-to-videos.ts is the one list).
export default async function Page() {
  const u = (await currentUser())!, lang = asLang(u.lang), t = trFor(lang);
  return (
    <main className="mx-auto max-w-3xl w-full px-5 py-6 flex flex-col gap-5 overflow-y-auto" data-testid="how-to-videos">
      <h1 className="text-2xl font-semibold">{t("How-to videos")}</h1>
      {howToVideosNewestFirst().map((v) => (
        <section key={v.id} className="rounded-xl border border-line bg-panel p-3 flex flex-col gap-2">
          <h2 className="font-medium">{t(v.title)}</h2>
          <p className="text-sm text-fg-2">{t(v.what)}</p>
          <HowToPlayer v={v} lang={lang} className="w-full rounded-lg" />
          <Link href={v.screen} className="self-start rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sel">{t("Open that screen")}</Link>
        </section>))}
    </main>
  );
}
