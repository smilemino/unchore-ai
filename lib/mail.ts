// E-mail through Resend's HTTP API (no SDK). Returns false instead of throwing so callers can fall back.
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const keyv = process.env.RESEND_API_KEY;
  if (!keyv) return false;
  const from = process.env.MAIL_FROM ?? "Unchore <hello@unchore.ai>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${keyv}`, "Content-Type": "application/json", "User-Agent": "unchore/0.1" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  }).catch(() => null);
  return Boolean(r && r.ok);
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
