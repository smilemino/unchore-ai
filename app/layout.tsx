import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isRtl } from "@/lib/i18n";
import { requestLang, trFor } from "@/lib/i18n-server";
import { SourceMark } from "@/components/SourceMark";

export async function generateMetadata(): Promise<Metadata> {
  const t = trFor(await requestLang());   // the browser tab and link previews in the visitor's language
  return {
    metadataBase: new URL("https://unchore.ai"),
    title: `Unchore — ${t("ask anything, automate what repeats")}`,
    description: t("Unchore answers like any AI, then offers to automate what you'll ask again — prices, fares, deadlines — and builds it for you."),
    openGraph: { title: "Unchore", description: "Humans do the creative work. AI does the chores.", url: "https://unchore.ai", siteName: "Unchore", type: "website", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Unchore — Humans do the creative work. AI does the chores." }] },
    twitter: { card: "summary_large_image", title: "Unchore", description: "Humans do the creative work. AI does the chores.", images: ["/og.png"] },
    // Not indexed until the service is finished and the public page is made (대표 결정 2026-09-29).
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f6f2" };

const themeScript = `try{var t=localStorage.getItem('uc_theme');var e=document.documentElement;if(t==='dark'||t==='night'||((!t||t==='auto')&&matchMedia('(prefers-color-scheme: dark)').matches))e.classList.add('dark');if(t==='night')e.classList.add('night')}catch(x){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The page's language and writing direction (Arabic, Hebrew, Persian and Urdu read right to left). Signed-in people
  // carry their account's language in the uc_lang cookie (set at sign-in and when they change it).
  const lang = await requestLang();
  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}<SourceMark /></body>
    </html>
  );
}
