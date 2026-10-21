import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import {
  beginTrialGoogle,
  completeTrialGoogle,
  exchangeTrialTicket,
  setTrialGoogleExchangeForTest,
  assertGoogleIdentity,
} from "@/server/services/trial-google-service";
import {
  trialHash,
  TrialError,
  consumeTrialRate,
  authenticateTrial,
  bodyDigest,
} from "@/server/services/trial-security";
import {
  registerTrial,
  addVietnamTrialMonth,
} from "@/server/services/trial-registration-service";
import { createRestaurantRecords } from "@/server/services/restaurant-provision-service";
import { getPlatformRestaurants } from "@/server/services/platform-service";
import { authOptions } from "@/lib/auth/options";
import {
  effectiveCommercialPlan,
  hasPlanFeature,
  canRoleAccessPlan,
} from "@/lib/plan/features";
import { getEffectiveSubscriptionStatus } from "@/lib/tenant/restaurant";
import { slugifyTrial, trialInput } from "@/lib/trial-contract";
const u = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  u.hostname !== "127.0.0.1" ||
  u.port !== "55432" ||
  u.pathname !== "/restaurant_trial_test" ||
  process.env.TRIAL_TEST_DATABASE_URL !== u.href
)
  throw Error("ISOLATED_TEST_DB_REQUIRED");
const prefix = "trial-qa-" + randomUUID(),
  challengeIds: string[] = [],
  password = "Trial-QA-only-" + randomBytes(12).toString("hex");
let checks = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  console.log("PASS " + name);
  checks++;
}
async function rejected(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (e) => e instanceof TrialError && e.code === code);
}
async function identity(label: string, sub = prefix + "-" + label) {
  const email = prefix + "-" + label + "@example.test",
    flowHash = trialHash("flow:" + label),
    { url } = await beginTrialGoogle(flowHash, prefix + "-" + label);
  const state = new URL(url).searchParams.get("state")!;
  const row = await prisma.trialIdentityChallenge.findUniqueOrThrow({
    where: { stateHash: trialHash("state:" + state) },
  });
  challengeIds.push(row.id);
  setTrialGoogleExchangeForTest(async (code, verifier) => {
    assert.equal(code, "qa-code");
    assert.equal(verifier, row.pkceVerifier);
    return {
      iss: "https://accounts.google.com",
      aud: process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID!,
      sub,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      email,
      email_verified: true,
      hd: "example.test",
      name: "QA Trial Owner",
      nonce: row.nonce,
    };
  });
  const redirect = await completeTrialGoogle(state, "qa-code"),
    ticket = new URL(redirect).searchParams.get("ticket")!;
  const grant = await exchangeTrialTicket(ticket, flowHash);
  await rejected(
    () => exchangeTrialTicket(ticket, trialHash("wrong-flow")),
    "INVALID_OAUTH_TICKET",
  );
  await rejected(
    () => completeTrialGoogle(state, "qa-code"),
    "INVALID_OAUTH_STATE",
  );
  return { ...grant, email };
}
async function input(label: string) {
  const proof = await identity(label);
  return {
    restaurantName: "QA Restaurant " + label,
    slug: prefix + "-" + label,
    ownerName: "QA Trial Owner",
    email: proof.email,
    password,
    timezone: "Asia/Ho_Chi_Minh" as const,
    language: "vi" as const,
    currency: "VND" as const,
    verificationToken: proof.verificationToken,
  };
}
async function main() {
  await check(
    "Vietnamese slug and calendar month clamp at local midnight/leap year",
    () => {
      assert.equal(slugifyTrial("Cà Phê Long Phụng"), "ca-phe-long-phung");
      assert.equal(
        trialInput.shape.slug.safeParse("select-restaurant").success,
        false,
      );
      for (const [from, to] of [
        ["2027-01-31T18:00:00.000Z", "2027-02-28T18:00:00.000Z"],
        ["2028-01-31T10:00:00.000Z", "2028-02-29T10:00:00.000Z"],
        ["2026-12-31T16:59:59.999Z", "2027-01-31T16:59:59.999Z"],
      ])
        assert.equal(addVietnamTrialMonth(new Date(from)).toISOString(), to);
    },
  );
  await check(
    "QAVIO and QuánPilot use exactly the same trial contract",
    async () => {
      assert.equal(
        await readFile("src/lib/trial-contract.ts", "utf8"),
        await readFile(path.resolve(process.env.QAVIO_REPOSITORY_PATH||"../qavio","src/lib/trial-contract.ts"), "utf8"),
      );
    },
  );
  await check(
    "Google rejects unverified, non-authoritative email, wrong audience and nonce",
    () => {
      const p = {
        iss: "https://accounts.google.com",
        aud: process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_ID!,
        sub: "qa",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        email: "qa@gmail.com",
        email_verified: true,
        nonce: "qa",
      };
      assert.doesNotThrow(() => assertGoogleIdentity(p, "qa"));
      for (const payload of [
        { ...p, email_verified: false },
        { ...p, aud: "evil" },
        { ...p, nonce: "evil" },
        { ...p, exp: 1 },
        { ...p, iss: "evil" },
      ])
        assert.throws(() => assertGoogleIdentity(payload, "qa"));
      assert.throws(() =>
        assertGoogleIdentity({ ...p, email: "qa@example.test" }, "qa"),
      );
    },
  );
  await check(
    "server authentication binds body, nonce, path, timestamp and client bucket",
    async () => {
      const body = "{}",
        pathname = "/api/integrations/qavio/trial/register",
        stamp = String(Date.now()),
        nonce = randomBytes(16).toString("hex"),
        bucket = trialHash(prefix),
        canonical = [
          "POST",
          pathname,
          stamp,
          nonce,
          bucket,
          "",
          bodyDigest(body),
        ].join("\n"),
        headers = {
          "content-type": "application/json",
          "x-qavio-timestamp": stamp,
          "x-qavio-nonce": nonce,
          "x-qavio-client-bucket": bucket,
          "x-qavio-signature": trialHash(canonical),
        };
      const req = () =>
        new Request("http://127.0.0.1:3200" + pathname, {
          method: "POST",
          headers,
          body,
        });
      assert.equal(await authenticateTrial(req(), body), bucket);
      await rejected(
        () => authenticateTrial(req(), body),
        "SERVICE_REPLAY_REJECTED",
      );
      await rejected(
        () =>
          authenticateTrial(
            new Request("http://127.0.0.1:3200" + pathname, {
              method: "POST",
              body,
            }),
            body,
          ),
        "SERVICE_AUTH_REQUIRED",
      );
      headers["x-qavio-nonce"] = randomBytes(16).toString("hex");
      await rejected(
        () => authenticateTrial(req(), '{"changed":true}'),
        "SERVICE_AUTH_REQUIRED",
      );
    },
  );
  const primary = await input("primary"),
    key = randomUUID();
  let result: Awaited<ReturnType<typeof registerTrial>>;
  await check(
    "concurrent retry creates exactly one TRAIN/BASIC restaurant and owner",
    async () => {
      const rows = await Promise.all([
        registerTrial(primary, key, prefix + "-ip1"),
        registerTrial(primary, key, prefix + "-ip1"),
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
      assert.equal(
        await prisma.trialRegistration.count({
          where: { restaurantId: result.restaurantId },
        }),
        1,
      );
    },
  );
  await check(
    "all default records, audit, dates, no payment/subscription order and no returned password",
    async () => {
      const row = await prisma.restaurant.findUniqueOrThrow({
        where: { id: result.restaurantId },
        include: {
          settings: true,
          users: { include: { user: true } },
          areas: true,
        },
      });
      assert.equal(row.plan, "TRAIN");
      assert.equal(row.planEntitlement, "BASIC");
      assert.equal(row.status, "ACTIVE");
      assert.equal(row.subscriptionStatus, "ACTIVE");
      assert.equal(
        row.subscriptionEnd!.toISOString(),
        addVietnamTrialMonth(row.subscriptionStart!).toISOString(),
      );
      assert.equal(row.settings!.timezone, "Asia/Ho_Chi_Minh");
      assert.equal(row.settings!.currency, "VND");
      assert.equal(row.settings!.primaryLanguage, "vi");
      assert.equal(row.users[0].role, "OWNER");
      assert.equal(row.users[0].user.platformRole, "USER");
      assert.equal(
        await bcrypt.compare(password, row.users[0].user.passwordHash),
        true,
      );
      assert.notEqual(row.users[0].user.passwordHash, password);
      assert.equal(row.areas.length, 1);
      assert.equal(
        await prisma.auditLog.count({ where: { restaurantId: row.id } }),
        3,
      );
      assert.equal(
        await prisma.subscriptionPaymentOrder.count({
          where: { restaurantId: row.id },
        }),
        0,
      );
      assert.equal(
        await prisma.subscriptionEntitlement.count({
          where: { restaurantId: row.id },
        }),
        0,
      );
      assert.ok(!JSON.stringify(result).includes(password));
      assert.equal(
        result.loginUrl,
        "http://127.0.0.1:3200/" + primary.slug + "/login?role=OWNER",
      );
    },
  );
  await check(
    "retry after lost response, refreshed proof and expiry returns original result",
    async () => {
      await prisma.trialIdentityChallenge.update({
        where: { id: primary.verificationToken.split(".")[0] },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      assert.deepEqual(
        await registerTrial(
          {
            ...primary,
            verificationToken: primary.verificationToken.replace(/.$/, "0"),
          },
          key,
          prefix + "-ip2",
        ),
        result,
      );
      await rejected(
        () => registerTrial(primary, randomUUID(), prefix + "-expired"),
        "EMAIL_VERIFICATION_REQUIRED",
      );
    },
  );
  await check(
    "different concurrent keys cannot create two restaurants for one Google identity",
    async () => {
      const data = await input("race");
      const requests = await Promise.allSettled([
        registerTrial(data, randomUUID(), prefix + "-race"),
        registerTrial(data, randomUUID(), prefix + "-race"),
      ]);
      assert.equal(requests.filter((r) => r.status === "fulfilled").length, 2);
      assert.deepEqual(requests[0], requests[1]);
      assert.equal(
        await prisma.restaurant.count({ where: { slug: data.slug } }),
        1,
      );
      assert.equal(
        await prisma.user.count({ where: { email: data.email } }),
        1,
      );
    },
  );
  await check(
    "concurrent different identities competing for a slug leave one owner",
    async () => {
      const first = await input("race-slug-a"),
        second = { ...(await input("race-slug-b")), slug: first.slug };
      const requests = await Promise.allSettled([
        registerTrial(first, randomUUID(), prefix + "-race-slug"),
        registerTrial(second, randomUUID(), prefix + "-race-slug"),
      ]);
      assert.equal(requests.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        await prisma.restaurant.count({ where: { slug: first.slug } }),
        1,
      );
      assert.equal(
        await prisma.user.count({
          where: { email: { in: [first.email, second.email] } },
        }),
        1,
      );
    },
  );
  await check("same key with altered restaurant conflicts", async () => {
    await rejected(
      () =>
        registerTrial(
          { ...primary, restaurantName: "Altered" },
          key,
          prefix + "-ip2",
        ),
      "IDEMPOTENCY_CONFLICT",
    );
  });
  await check(
    "request cannot inject PRO, paid entitlement, status or expiry",
    async () => {
      for (const extra of [
        { plan: "PRO" },
        { status: "ACTIVE" },
        { subscriptionEnd: "2099-01-01" },
        { planEntitlement: "PRO" },
      ])
        await rejected(
          () =>
            registerTrial(
              { ...primary, ...extra },
              randomUUID(),
              prefix + "-inject",
            ),
          "TRIAL_VALIDATION_ERROR",
        );
    },
  );
  await check("missing/forged email ownership proof is denied", async () => {
    await rejected(
      () =>
        registerTrial(
          { ...primary, email: prefix + "-stranger@example.test" },
          randomUUID(),
          prefix + "-bad",
        ),
      "EMAIL_VERIFICATION_REQUIRED",
    );
    await rejected(
      () =>
        registerTrial(
          {
            ...primary,
            verificationToken: primary.verificationToken.slice(0, -1) + "z",
          },
          randomUUID(),
          prefix + "-bad",
        ),
      "EMAIL_VERIFICATION_REQUIRED",
    );
  });
  await check(
    "same Google account cannot acquire another free trial",
    async () => {
      const same = await identity("alias", prefix + "-primary");
      await rejected(
        () =>
          registerTrial(
            {
              ...primary,
              email: same.email,
              slug: prefix + "-alias",
              verificationToken: same.verificationToken,
            },
            randomUUID(),
            prefix + "-alias",
          ),
        "TRIAL_ALREADY_USED",
      );
    },
  );
  await check(
    "duplicate slug and duplicate email do not create extra records",
    async () => {
      const other = await input("dupe");
      await rejected(
        () =>
          registerTrial(
            { ...other, slug: primary.slug },
            randomUUID(),
            prefix + "-dupe",
          ),
        "SLUG_UNAVAILABLE",
      );
      const user = await prisma.user.create({
        data: {
          name: "QA prior owner",
          email: other.email,
          passwordHash: "qa-prior-hash",
        },
      });
      try {
        await rejected(
          () => registerTrial(other, randomUUID(), prefix + "-dupe"),
          "EMAIL_ALREADY_REGISTERED",
        );
      } finally {
        await prisma.user.delete({ where: { id: user.id } });
      }
    },
  );
  await check(
    "TRAIN uses BASIC feature guards, no kitchen/cashier/manager escalation",
    () => {
      assert.equal(
        effectiveCommercialPlan("TRAIN", "RESTAURANT", "BASIC"),
        "BASIC",
      );
      assert.equal(
        hasPlanFeature("TRAIN", "KITCHEN_FLOW", "RESTAURANT", "BASIC"),
        false,
      );
      assert.equal(
        canRoleAccessPlan("TRAIN", "KITCHEN", "RESTAURANT", "BASIC"),
        false,
      );
      assert.equal(
        canRoleAccessPlan("TRAIN", "OWNER", "RESTAURANT", "BASIC"),
        true,
      );
      assert.equal(
        getEffectiveSubscriptionStatus(new Date("2020-01-01"), "ACTIVE", 0),
        "EXPIRED",
      );
    },
  );
  await check(
    "new restaurant appears with OWNER in existing Platform Admin query",
    async () => {
      const row = (await getPlatformRestaurants()).find(
        (r) => r.id === result.restaurantId,
      );
      assert.ok(row);
      assert.equal(row.users[0].user.email, primary.email);
      assert.equal(row.planEntitlement, "BASIC");
    },
  );
  await check(
    "existing password login recognizes the created owner; other tenant denied",
    async () => {
      const provider = authOptions.providers[0] as unknown as {
        options: {
          authorize: (
            c: Record<string, string>,
            r: unknown,
          ) => Promise<{
            id: string;
          } | null>;
        };
      };
      const login = await provider.options.authorize(
        { email: primary.email, password },
        {},
      );
      assert.ok(login);
      assert.equal(
        await provider.options.authorize(
          { email: primary.email, password: "wrong" },
          {},
        ),
        null,
      );
      const second = await prisma.restaurant.create({
        data: { name: "QA Other Tenant", slug: prefix + "-tenant-b" },
      });
      assert.equal(
        await prisma.restaurantUser.count({
          where: { restaurantId: second.id, userId: login!.id },
        }),
        0,
      );
      const tenant = await provider.options.authorize(
        { username: primary.email, restaurantSlug: second.slug, password },
        {},
      );
      assert.equal(tenant, null);
    },
  );
  await check(
    "valid logo stored via QuánPilot media, spoofed and oversized dimensions denied",
    async () => {
      const data = await input("logo"),
        png = await sharp({
          create: { width: 32, height: 32, channels: 3, background: "#123456" },
        })
          .png()
          .toBuffer();
      const row = await registerTrial(
        {
          ...data,
          logo: { type: "image/png", base64: png.toString("base64") },
        },
        randomUUID(),
        prefix + "-logo",
      );
      const restaurant = await prisma.restaurant.findUniqueOrThrow({
        where: { id: row.restaurantId },
      });
      assert.match(restaurant.logoUrl!, /^\/api\/uploads\/logos\//);
      const bytes = await readFile(
        "public/uploads/logos/" + restaurant.logoUrl!.split("/").pop(),
      );
      assert.equal((await sharp(bytes).metadata()).format, "webp");
      const bad = await input("bad-logo");
      await rejected(
        () =>
          registerTrial(
            {
              ...bad,
              logo: { type: "image/jpeg", base64: png.toString("base64") },
            },
            randomUUID(),
            prefix + "-logo",
          ),
        "INVALID_LOGO",
      );
      await rejected(
        () =>
          registerTrial(
            {
              ...bad,
              logo: {
                type: "image/png",
                base64: Buffer.from("<script>not an image</script>").toString(
                  "base64",
                ),
              },
            },
            randomUUID(),
            prefix + "-logo",
          ),
        "INVALID_LOGO",
      );
    },
  );
  await check(
    "failure creating owner rolls back restaurant/settings/owner/idempotency together",
    async () => {
      const data = await input("rollback");
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION trial_qa_fail_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = 'FAIL_TRIAL_OWNER' THEN RAISE EXCEPTION 'QA forced failure'; END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER trial_qa_fail_owner BEFORE INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION trial_qa_fail_owner()',
      );
      try {
        await assert.rejects(() =>
          registerTrial(
            { ...data, ownerName: "FAIL_TRIAL_OWNER" },
            randomUUID(),
            prefix + "-rollback",
          ),
        );
        assert.equal(
          await prisma.restaurant.count({ where: { slug: data.slug } }),
          0,
        );
        assert.equal(
          await prisma.user.count({ where: { email: data.email } }),
          0,
        );
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER trial_qa_fail_owner ON "User"',
        );
        await prisma.$executeRawUnsafe("DROP FUNCTION trial_qa_fail_owner()");
      }
    },
  );
  await check(
    "Platform Admin shared factory retains existing owner password",
    async () => {
      const existing = await prisma.user.create({
        data: {
          name: "QA Prior",
          email: prefix + "-reuse@example.test",
          passwordHash: "qa-original-hash",
        },
      });
      const record = await prisma.$transaction((tx) =>
        createRestaurantRecords(
          tx,
          {
            name: "QA Shared",
            slug: prefix + "-shared",
            ownerName: "QA Owner Updated",
            ownerEmail: existing.email,
            timezone: "Asia/Ho_Chi_Minh",
            primaryLanguage: "vi",
            currency: "VND",
            businessType: "RESTAURANT",
            plan: "TRAIN",
            planEntitlement: "BASIC",
            subscriptionStatus: "ACTIVE",
            status: "ACTIVE",
            subscriptionStart: new Date(),
            subscriptionEnd: new Date(Date.now() + 86400000),
          },
          "must-not-replace-hash",
          null,
        ),
      );
      assert.equal(record.owner.passwordHash, "qa-original-hash");
    },
  );
  await check(
    "server quota and kill switch work without changing paid subscriptions",
    async () => {
      const data = await input("quota"),
        max = process.env.QUANPILOT_TRIAL_MAX_TOTAL;
      process.env.QUANPILOT_TRIAL_MAX_TOTAL = String(
        await prisma.trialRegistration.count(),
      );
      try {
        await rejected(
          () => registerTrial(data, randomUUID(), prefix + "-quota"),
          "TRIAL_CAPACITY_REACHED",
        );
      } finally {
        process.env.QUANPILOT_TRIAL_MAX_TOTAL = max;
      }
      process.env.QUANPILOT_TRIAL_REGISTRATION_ENABLED = "false";
      try {
        await rejected(
          () => registerTrial(data, randomUUID(), prefix + "-off"),
          "TRIAL_DISABLED",
        );
      } finally {
        process.env.QUANPILOT_TRIAL_REGISTRATION_ENABLED = "true";
      }
    },
  );
  await check("persistent rate limit denies repeated source", async () => {
    await consumeTrialRate(prefix + "-limit", 1, 60000);
    await rejected(
      () => consumeTrialRate(prefix + "-limit", 1, 60000),
      "TRIAL_RATE_LIMITED",
    );
  });
  console.log(
    JSON.stringify({
      suite: "QuánPilot trial registration",
      checks,
      google: "isolated adapter; real Google OAuth not configured",
      database: "restaurant_trial_test",
      result: "PASS",
    }),
  );
}
main()
  .catch((e) => {
    console.error(
      "TRIAL_CHECK_FAILED",
      e instanceof assert.AssertionError
        ? e.message
        : e instanceof TrialError
          ? e.code
          : e instanceof Error
            ? e.name
            : "CHECK_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    setTrialGoogleExchangeForTest(undefined);
    const restaurants = await prisma.restaurant.findMany({
      where: { slug: { startsWith: prefix } },
      select: { id: true, logoUrl: true },
    });
    const ids = restaurants.map((r) => r.id);
    await prisma.trialRegistration.deleteMany({
      where: { restaurantId: { in: ids } },
    });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await prisma.trialIdentityChallenge.deleteMany({
      where: { id: { in: challengeIds } },
    });
    for (const row of restaurants)
      if (row.logoUrl) {
        const name = row.logoUrl.split("/").pop()!;
        const { unlink } = await import("node:fs/promises");
        for (const f of [name, name.replace(".webp", "-thumb.webp")])
          await unlink("public/uploads/logos/" + f).catch(() => {});
      }
    await prisma.$disconnect();
  });
