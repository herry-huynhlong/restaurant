import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  trialInput,
  TRIAL_MAX_LOGO_BYTES,
  type TrialResult,
  type TrialInput,
} from "@/lib/trial-contract";
import { createRestaurantRecords } from "./restaurant-provision-service";
import { saveOptimizedUploadImage } from "./image-upload-service";
import { trialProof, trialQuanpilotOrigin } from "./trial-google-service";
import {
  TrialError,
  assertTrialEnabled,
  trialHash,
  safeEqual,
  consumeTrialRate,
} from "./trial-security";
// Preserve the local time in Vietnam and clamp the day at the destination month's end.
export function addVietnamTrialMonth(now: Date) {
  const local = new Date(now.getTime() + 7 * 3600000),
    day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 1);
  const end = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  local.setUTCDate(Math.min(day, end));
  return new Date(local.getTime() - 7 * 3600000);
}
async function saveLogo(logo: TrialInput["logo"]) {
  if (!logo) return undefined;
  const bytes = Buffer.from(logo.base64, "base64");
  if (
    bytes.length > TRIAL_MAX_LOGO_BYTES ||
    bytes.toString("base64") !== logo.base64
  )
    throw new TrialError(422, "INVALID_LOGO");
  try {
    const meta = await sharp(bytes, {
      limitInputPixels: 16000000,
      failOn: "error",
    }).metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > 4000 ||
      meta.height > 4000 ||
      (meta.pages || 1) !== 1 ||
      { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[
        logo.type
      ] !== meta.format
    )
      throw Error();
  } catch {
    throw new TrialError(422, "INVALID_LOGO");
  }
  const saved = await saveOptimizedUploadImage(
    new File([bytes], "restaurant-logo", { type: logo.type }),
    "logos",
  );
  return saved?.imageUrl;
}
async function removeUncommittedLogo(url: string, slug: string) {
  try {
    if (
      (
        await prisma.restaurant.findUnique({
          where: { slug },
          select: { logoUrl: true },
        })
      )?.logoUrl === url
    )
      return;
    const filename = url.split("/").pop() || "";
    if (!/^\d+-[a-f0-9-]+\.webp$/.test(filename)) return;
    for (const name of [filename, filename.replace(".webp", "-thumb.webp")])
      await unlink(
        path.join(process.cwd(), "public", "uploads", "logos", name),
      ).catch(() => {});
  } catch {
    /* Retain on uncertain commit; never delete a committed restaurant's logo. */
  }
}
export async function registerTrial(
  raw: unknown,
  key: string | null,
  bucket: string,
): Promise<TrialResult> {
  assertTrialEnabled();
  const parsed = trialInput.safeParse(raw);
  if (!parsed.success) throw new TrialError(422, "TRIAL_VALIDATION_ERROR");
  if (
    !key ||
    !/^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
      key,
    )
  )
    throw new TrialError(400, "IDEMPOTENCY_KEY_REQUIRED");
  const input = parsed.data,
    keyHash = trialHash("registration:" + key),
    requestHash = trialHash(
      JSON.stringify({ ...input, verificationToken: undefined }),
    );
  let logoUrl: string | undefined;
  await consumeTrialRate("register:" + bucket, 15, 900000);
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${keyHash},0))`;
        const old = await tx.trialRegistration.findUnique({
          where: { keyHash },
        });
        if (old) {
          if (!safeEqual(old.requestHash, requestHash))
            throw new TrialError(409, "IDEMPOTENCY_CONFLICT");
          return old.result as unknown as TrialResult;
        }
        const id = input.verificationToken.split(".")[0],
          proof = await tx.trialIdentityChallenge.findUnique({ where: { id } });
        if (
          !proof ||
          !proof.verifiedAt ||
          proof.expiresAt <= new Date() ||
          proof.email !== input.email ||
          !proof.googleSubject ||
          !safeEqual(trialProof(proof), input.verificationToken)
        )
          throw new TrialError(403, "EMAIL_VERIFICATION_REQUIRED");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('qavio:trial:quota',0))`;
        const priorIdentityTrial = await tx.trialRegistration.findFirst({
          where: {
            OR: [
              { challengeId: proof.id },
              { googleSubject: proof.googleSubject },
            ],
          },
        });
        if (priorIdentityTrial) {
          if (safeEqual(priorIdentityTrial.requestHash, requestHash))
            return priorIdentityTrial.result as unknown as TrialResult;
          throw new TrialError(409, "TRIAL_ALREADY_USED");
        }
        const max = Number(process.env.QUANPILOT_TRIAL_MAX_TOTAL);
        if (!Number.isSafeInteger(max) || max < 1)
          throw new TrialError(503, "TRIAL_QUOTA_NOT_CONFIGURED");
        if ((await tx.trialRegistration.count()) >= max)
          throw new TrialError(503, "TRIAL_CAPACITY_REACHED");
        if (
          await tx.user.findFirst({
            where: { email: { equals: input.email, mode: "insensitive" } },
            select: { id: true },
          })
        )
          throw new TrialError(409, "EMAIL_ALREADY_REGISTERED");
        if (
          await tx.restaurant.findUnique({
            where: { slug: input.slug },
            select: { id: true },
          })
        )
          throw new TrialError(409, "SLUG_UNAVAILABLE");
        const startsAt = new Date(),
          expiresAt = addVietnamTrialMonth(startsAt);
        logoUrl = await saveLogo(input.logo);
        const { restaurant, owner } = await createRestaurantRecords(
          tx,
          {
            name: input.restaurantName,
            slug: input.slug,
            logoUrl,
            ownerName: input.ownerName,
            ownerEmail: input.email,
            timezone: input.timezone,
            primaryLanguage: input.language,
            currency: input.currency,
            businessType: "RESTAURANT",
            plan: "TRAIN",
            planEntitlement: "BASIC",
            status: "ACTIVE",
            subscriptionStatus: "ACTIVE",
            subscriptionStart: startsAt,
            subscriptionEnd: expiresAt,
          },
          passwordHash,
          null,
          "new",
        );
        const registrationId = randomUUID(),
          result: TrialResult = {
            registrationId,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            slug: restaurant.slug,
            ownerName: owner.name,
            email: owner.email,
            plan: "TRAIN",
            entitlement: "BASIC",
            startsAt: startsAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            loginUrl:
              trialQuanpilotOrigin() +
              "/" +
              encodeURIComponent(restaurant.slug) +
              "/login?role=OWNER",
          };
        await tx.trialRegistration.create({
          data: {
            id: registrationId,
            keyHash,
            requestHash,
            challengeId: proof.id,
            googleSubject: proof.googleSubject,
            restaurantId: restaurant.id,
            ownerUserId: owner.id,
            result: JSON.parse(JSON.stringify(result)),
          },
        });
        await tx.auditLog.create({
          data: {
            restaurantId: restaurant.id,
            userId: owner.id,
            action: "QAVIO_TRIAL_REGISTERED",
            entityType: "TrialRegistration",
            entityId: registrationId,
            metadataJson: {
              source: "QAVIO",
              plan: "TRAIN",
              entitlement: "BASIC",
              startsAt: result.startsAt,
              expiresAt: result.expiresAt,
            },
          },
        });
        return result;
      },
      { maxWait: 15000, timeout: 30000 },
    );
  } catch (error) {
    if (logoUrl) await removeUncommittedLogo(logoUrl, input.slug);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new TrialError(409, "REGISTRATION_CONFLICT");
    throw error;
  }
}
