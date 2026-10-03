import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM box for users' AI keys and saved passwords. Key = UNCHORE_SECRET_KEY (32 bytes, base64).
function key(): Buffer {
  const raw = process.env.UNCHORE_SECRET_KEY ?? "";
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("UNCHORE_SECRET_KEY must be 32 bytes (base64)");
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function open(box: string): string {
  const [v, iv, tag, body] = box.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("bad box");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Show only the last 4 characters of a secret. */
export function hint(secret: string): string {
  const t = secret.trim();
  return t.length <= 4 ? "••••" : `••••${t.slice(-4)}`;
}
