import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
export class TrialError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function trialSecret() {
  const s = process.env.QUANPILOT_QAVIO_TRIAL_SECRET;
  if (!s || s.length < 32) throw new TrialError(503, "TRIAL_NOT_CONFIGURED");
  return s;
}
export const trialHash = (s: string) =>
  createHmac("sha256", trialSecret()).update(s).digest("hex");
export const bodyDigest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function trialEnabled() {
  return process.env.QUANPILOT_TRIAL_REGISTRATION_ENABLED === "true";
}
export function assertTrialEnabled() {
  if (!trialEnabled()) throw new TrialError(503, "TRIAL_DISABLED");
  trialSecret();
}
export async function consumeTrialRate(
  key: string,
  max: number,
  windowMs: number,
) {
  const keyHash = trialHash("rate:" + key),
    now = new Date();
  const accepted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${keyHash},0))`;
    const row = await tx.trialRateBucket.findUnique({ where: { keyHash } });
    if (row && row.expiresAt > now) {
      if (row.count >= max) return false;
      await tx.trialRateBucket.update({
        where: { keyHash },
        data: { count: { increment: 1 } },
      });
    } else
      await tx.trialRateBucket.upsert({
        where: { keyHash },
        create: {
          keyHash,
          count: 1,
          expiresAt: new Date(now.getTime() + windowMs),
        },
        update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) },
      });
    return true;
  });
  if (!accepted) throw new TrialError(429, "TRIAL_RATE_LIMITED");
}
let cleanupCounter = 0;
export async function authenticateTrial(request: Request, body: string) {
  assertTrialEnabled();
  const stamp = request.headers.get("x-qavio-timestamp") || "",
    nonce = request.headers.get("x-qavio-nonce") || "",
    bucket = request.headers.get("x-qavio-client-bucket") || "",
    key = request.headers.get("idempotency-key") || "",
    signature = request.headers.get("x-qavio-signature") || "";
  if (
    !/^\d{13}$/.test(stamp) ||
    Math.abs(Date.now() - Number(stamp)) > 180000 ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(bucket) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new TrialError(401, "SERVICE_AUTH_REQUIRED");
  const canonical = [
    request.method,
    new URL(request.url).pathname,
    stamp,
    nonce,
    bucket,
    key,
    bodyDigest(body),
  ].join("\n");
  if (!safeEqual(trialHash(canonical), signature))
    throw new TrialError(401, "SERVICE_AUTH_REQUIRED");
  const added = await prisma.trialServiceNonce.createMany({
    data: [
      {
        keyHash: trialHash("nonce:" + nonce),
        expiresAt: new Date(Date.now() + 180000),
      },
    ],
    skipDuplicates: true,
  });
  if (added.count !== 1) throw new TrialError(401, "SERVICE_REPLAY_REJECTED");
  await consumeTrialRate("envelope:" + bucket, 80, 60000);
  if (cleanupCounter++ % 100 === 0) {
    const now = new Date();
    await prisma.trialServiceNonce.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await prisma.trialRateBucket.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    await prisma.trialIdentityChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
  return bucket;
}
export function trialReply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...(status === 429 ? { "Retry-After": "900" } : {}),
    },
  });
}
export async function readTrialBody(request: Request) {
  const max = 3 * 1024 * 1024;
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new TrialError(413, "BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new TrialError(400, "INVALID_JSON");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new TrialError(413, "BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
