import { redirect } from "next/navigation";
import { asLang } from "@/lib/i18n";
import { dictFor } from "@/lib/i18n-server";
import { I18nProvider } from "@/components/I18n";
import { Suspense } from "react";
import { currentUser } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { PersonalUI } from "@/components/PersonalUI";
import { PullToRefresh } from "@/components/PullToRefresh";
import { NewVersion } from "@/components/NewVersion";
import { SessionRefresh } from "@/components/SessionRefresh";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const lang = asLang(u.lang);
  return (
    <I18nProvider lang={lang} dict={dictFor(lang)}>
      <Suspense><PersonalUI><Shell lang={lang} tz={u.tz || "UTC"}>{children}</Shell></PersonalUI></Suspense>
      <PullToRefresh /><NewVersion /><SessionRefresh />
    </I18nProvider>
  );
}
