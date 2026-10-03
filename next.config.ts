import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,   // our own free security check marked unchore.ai down for «X-Powered-By: Next.js» (2026-10-01)
  // The PDF builder embeds this font (Korean glyphs); make sure it ships with the chat function.
  outputFileTracingIncludes: { "/api/chat": ["./lib/files/assets/NanumGothic.ttf"], "/api/cron/tick": ["./lib/files/assets/NanumGothic.ttf"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
