"use client";
// The screen's language: the server picks it and hands over only that language's dictionary (lib/i18n-server.ts).
import { createContext, useContext, useMemo } from "react";
import { makeT, type Dict, type Lang, type TFn } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: TFn }>({ lang: "en", t: makeT(null) });

export function I18nProvider({ lang, dict, children }: { lang: Lang; dict: Dict; children: React.ReactNode }) {
  const v = useMemo(() => ({ lang, t: makeT(dict) }), [lang, dict]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
/** t("Sign out") → the screen's language (English when a line isn't translated yet). */
export const useT = (): TFn => useContext(Ctx).t;
export const useLang = (): Lang => useContext(Ctx).lang;
