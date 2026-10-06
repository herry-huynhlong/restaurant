import crypto from "node:crypto";

export function generateQrToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function getTableQrUrl(baseUrl: string, slug: string, qrToken: string) {
  return `${baseUrl.replace(/\/$/, "")}/${slug}/welcome?t=${encodeURIComponent(qrToken)}`;
}
