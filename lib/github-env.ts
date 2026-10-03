// GitHub sign-in keys — UNCHORE_GITHUB_* like the Google ones (owner 2026-09-30: «add GitHub sign-in»).
export const githubClientId = () => process.env.UNCHORE_GITHUB_CLIENT_ID ?? "";
export const githubClientSecret = () => process.env.UNCHORE_GITHUB_CLIENT_SECRET ?? "";
export const githubOn = () => Boolean(githubClientId());

export type GithubEmail = { email?: string; primary?: boolean; verified?: boolean };

/** The account's e-mail: the primary one if GitHub has verified it, else any verified one; never an unverified address
 *  (accounts are matched by e-mail, so an unverified one could open someone else's account). */
export function pickGithubEmail(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const ok = (list as GithubEmail[]).filter((e) => e && e.verified === true && typeof e.email === "string" && e.email.includes("@") && !e.email.endsWith("@users.noreply.github.com"));
  return (ok.find((e) => e.primary) ?? ok[0])?.email ?? null;
}
