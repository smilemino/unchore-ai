import { asLang } from "@/lib/i18n";
import { Automations } from "@/components/Automations";
import { currentUser } from "@/lib/session";

export default async function Page() {
  const u = (await currentUser())!;
  return <Automations lang={asLang(u.lang)} tz={u.tz} />;
}
