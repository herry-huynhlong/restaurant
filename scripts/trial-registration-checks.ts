import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { slugifyTrial, trialInput } from "@/lib/trial-contract";
import {
  addVietnamTrialMonth,
  registerTrial,
} from "@/server/services/trial-registration-service";
import {
  authenticateTrial,
  bodyDigest,
  trialHash,
  TrialError,
} from "@/server/services/trial-security";

const database = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  database.hostname !== "127.0.0.1" ||
  database.port !== "55432" ||
  database.pathname !== "/restaurant_trial_test" ||
  process.env.TRIAL_TEST_DATABASE_URL !== database.href
)
  throw Error("ISOLATED_TEST_DB_REQUIRED");

const prefix = "trial-qa-" + randomUUID();
const password = "Trial-QA-only-" + randomBytes(12).toString("hex");
let checks = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  console.log("PASS " + name);
  checks++;
}

async function rejected(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (error) =>
    error instanceof TrialError && error.code === code,
  );
}

function input(label: string) {
  return {
    restaurantName: "QA Restaurant " + label,
    slug: prefix + "-" + label,
    ownerName: "QA Trial Owner",
    email: prefix + "-" + label + "@example.test",
    password,
  };
}

async function main() {
  await check("Vietnamese slugs normalize and reserved paths are rejected", () => {
    assert.equal(
      slugifyTrial("Quán Cà Phê Sài Gòn"),
      "quan-ca-phe-sai-gon",
    );
    assert.equal(slugifyTrial("Nhà Hàng Phố Xưa"), "nha-hang-pho-xua");
    assert.equal(slugifyTrial("Bún Bò Huế 123"), "bun-bo-hue-123");
    assert.equal(trialInput.shape.slug.safeParse("platform").success, false);
  });

  await check("signed service authentication binds request body and rejects replay", async () => {
    const body = "{}";
    const pathname = "/api/integrations/qavio/trial/register";
    const stamp = String(Date.now());
    const nonce = randomBytes(16).toString("hex");
    const bucket = trialHash(prefix);
    const signature = trialHash(
      ["POST", pathname, stamp, nonce, bucket, "", bodyDigest(body)].join("\n"),
    );
    const request = () =>
      new Request("http://127.0.0.1:3200" + pathname, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-qavio-timestamp": stamp,
          "x-qavio-nonce": nonce,
          "x-qavio-client-bucket": bucket,
          "x-qavio-signature": signature,
        },
        body,
      });
    assert.equal(await authenticateTrial(request(), body), bucket);
    await rejected(
      () => authenticateTrial(request(), body),
      "SERVICE_REPLAY_REJECTED",
    );
  });

  const primary = input("primary");
  const key = randomUUID();
  let result: Awaited<ReturnType<typeof registerTrial>>;

  await check("concurrent retry creates one TRAIN/BASIC restaurant and owner", async () => {
    const rows = await Promise.all([
      registerTrial(primary, key, prefix + "-ip"),
      registerTrial(primary, key, prefix + "-ip"),
    ]);
    assert.deepEqual(rows[0], rows[1]);
    result = rows[0];
    assert.equal(
      await prisma.restaurant.count({ where: { slug: primary.slug } }),
      1,
    );
    assert.equal(
      await prisma.user.count({ where: { email: primary.email } }),
      1,
    );
  });

  await check("server assigns Vietnam defaults, hashes password, and returns no password", async () => {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: result.restaurantId },
      include: { settings: true, users: { include: { user: true } } },
    });
    assert.equal(restaurant.plan, "TRAIN");
    assert.equal(restaurant.planEntitlement, "BASIC");
    assert.equal(restaurant.settings?.timezone, "Asia/Ho_Chi_Minh");
    assert.equal(restaurant.settings?.primaryLanguage, "vi");
    assert.equal(restaurant.settings?.currency, "VND");
    assert.equal(
      await bcrypt.compare(password, restaurant.users[0].user.passwordHash),
      true,
    );
    assert.ok(!JSON.stringify(result).includes(password));
    assert.equal(
      result.expiresAt,
      addVietnamTrialMonth(new Date(result.startsAt)).toISOString(),
    );
  });

  await check("same key returns the original result, altered data conflicts", async () => {
    assert.deepEqual(
      await registerTrial(primary, key, prefix + "-retry"),
      result,
    );
    await rejected(
      () =>
        registerTrial(
          { ...primary, restaurantName: "Changed request" },
          key,
          prefix + "-retry",
        ),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  await check("email and slug duplicates are rejected without extra records", async () => {
    const duplicateSlug = input("duplicate-slug");
    await rejected(
      () =>
        registerTrial(
          { ...duplicateSlug, slug: primary.slug },
          randomUUID(),
          prefix + "-duplicate",
        ),
      "SLUG_UNAVAILABLE",
    );
    const duplicateEmail = input("duplicate-email");
    await rejected(
      () =>
        registerTrial(
          { ...duplicateEmail, email: primary.email },
          randomUUID(),
          prefix + "-duplicate",
        ),
      "EMAIL_ALREADY_REGISTERED",
    );
    assert.equal(
      await prisma.restaurant.count({ where: { slug: primary.slug } }),
      1,
    );
  });

  await check("caller cannot supply locale, plan, entitlement, or expiry", async () => {
    for (const extra of [
      { timezone: "UTC" },
      { language: "en" },
      { currency: "USD" },
      { plan: "PRO" },
      { planEntitlement: "PRO" },
      { subscriptionEnd: "2099-01-01" },
    ])
      await rejected(
        () =>
          registerTrial(
            { ...input("injection-" + Object.keys(extra)[0]), ...extra },
            randomUUID(),
            prefix + "-injection",
          ),
        "TRIAL_VALIDATION_ERROR",
      );
  });

  console.log(JSON.stringify({ suite: "trial-registration-without-google", checks }));
}

main()
  .catch((error) => {
    console.error(
      "TRIAL_REGISTRATION_FAILED",
      error instanceof Error ? error.message : "CHECK_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { startsWith: prefix } },
      select: { id: true },
    });
    const restaurantIds = restaurants.map((restaurant) => restaurant.id);
    await prisma.trialRegistration.deleteMany({
      where: { restaurantId: { in: restaurantIds } },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  });
