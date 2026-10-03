/** Public base URL. Uses APP_URL, else the request origin (preview deployments). */
export function appUrl(req?: Request): string {
  const env = process.env.APP_URL?.replace(/\/$/, "");
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "http://localhost:3500";
}
