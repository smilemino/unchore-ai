import { asLang } from "@/lib/i18n";
import { Settings, type Tab } from "@/components/Settings";
import { currentUser } from "@/lib/session";

const TABS: Tab[] = ["status", "ai", "memory", "files", "screen", "device"];

// ?tab=ai·memory·files·screen·device opens that tab (AI Soul's settings, same idea).
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = (await currentUser())!;
  const want = (await searchParams).tab;
  const tab = TABS.find((x) => x === want) ?? "status";
  return <Settings lang={asLang(u.lang)} initialTab={tab} />;
}
