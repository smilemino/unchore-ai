import { toolPage } from "@/components/free/ToolFrame";
import { ChoreType } from "@/components/free/ChoreType";
import { hlOf, toolPath } from "@/lib/free-tools";
import { isType } from "@/lib/free-tools/chore-type";

type SP = Promise<Record<string, string | string[] | undefined>>;
// A friend's shared result («?r=juggler») opens on that result; «take the test» starts fresh.
export default async function Page({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const shared = isType(sp.r) ? sp.r : null;
  const hl = hlOf(sp);
  const p = toolPage("chore-type", () => <ChoreType shared={shared} path={toolPath("chore-type", hl ?? "en")} />);
  return p.Page({ searchParams: Promise.resolve(sp) });
}
export const generateMetadata = toolPage("chore-type", () => null).meta;
