// Stand-in for lib/i18n-server.ts inside the exported skill: no Next.js, English lines only.
import type { Vars } from "@/lib/i18n";

export const tr = (_lang: string, en: string, vars?: Vars): string =>
  en.replace(/\{(\w+)\}/g, (m, key: string) => (vars && key in vars ? String(vars[key]) : m));
