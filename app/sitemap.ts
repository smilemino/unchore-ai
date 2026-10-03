import type { MetadataRoute } from "next";
import { INDEXED, TOOLS, toolPath } from "@/lib/free-tools";

const BASE = "https://unchore.ai";
// The indexed pages in English and Korean, each with its other language as an alternate.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [null, ...TOOLS.map((t) => t.slug)];
  const out: MetadataRoute.Sitemap = [];
  for (const slug of pages) for (const lang of INDEXED) {
    out.push({ url: `${BASE}${toolPath(slug, lang)}`, changeFrequency: slug === "ai-cost" ? "daily" : "weekly", priority: slug ? 0.8 : 0.9,
      alternates: { languages: Object.fromEntries(INDEXED.map((l) => [l, `${BASE}${toolPath(slug, l)}`])) } });
  }
  for (const lang of INDEXED) out.push({ url: `${BASE}/changes${lang === "en" ? "" : `?hl=${lang}`}`, changeFrequency: "daily", priority: 0.5 });
  return out;
}
