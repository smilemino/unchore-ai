import type { MetadataRoute } from "next";

// Crawlers may read every page; pages that aren't ready say «noindex» themselves (app/layout.tsx). Only the free tools and
// «What's new» are indexed for now (owner «yes» 2026-10-01 00:19). Signed-in screens and the API stay out.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/app$", "/app/"] }], sitemap: "https://unchore.ai/sitemap.xml" };
}
