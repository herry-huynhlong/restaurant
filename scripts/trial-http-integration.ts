import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
const u = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  u.hostname !== "127.0.0.1" ||
  u.port !== "55432" ||
  u.pathname !== "/restaurant_trial_test"
)
  throw Error("ISOLATED_TEST_REQUIRED");
const qavioRepo = path.resolve(process.env.QAVIO_REPOSITORY_PATH || "../qavio");
const q = "http://127.0.0.1:3100",
  p = "http://127.0.0.1:3200",
  prefix = "trial-http-" + randomUUID(),
  email = prefix + "@example.test",
  password = "Trial-HTTP-QA-" + randomBytes(14).toString("hex");
const jar = new Map<string, string>();
function accept(r: Response, j = jar) {
  for (const c of r.headers.getSetCookie()) {
    const pair = c.split(";")[0],
      i = pair.indexOf("=");
    if (/max-age=0/i.test(c)) j.delete(pair.slice(0, i));
    else j.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
const cookie = (j = jar) => [...j].map(([k, v]) => k + "=" + v).join("; ");
async function post(path: string, body: unknown, key?: string, origin = q) {
  const r = await fetch(q + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: cookie(),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  accept(r);
  return r;
}
function counts() {
  const r = spawnSync(process.execPath, ["scripts/trial-test-counts.mjs"], {
    cwd: qavioRepo,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(r.status, 0);
  return JSON.parse(r.stdout);
}
async function main() {
  const before = counts();
  const start = await post("/api/trial/google/start", { website: "" });
  assert.equal(start.status, 200);
  const { url } = await start.json();
  assert.equal(new URL(url).hostname, "accounts.google.com");
  assert.match(start.headers.getSetCookie().join(";"), /HttpOnly/);
  assert.ok(!url.includes(process.env.QUANPILOT_TRIAL_GOOGLE_CLIENT_SECRET!));
  await writeFile(
    ".trial-runtime/identity-input.json",
    JSON.stringify({
      state: new URL(url).searchParams.get("state"),
      email,
      subject: prefix,
    }),
    { mode: 0o600 },
  );
  const fixture = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/trial-google-fixture.ts"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(fixture.status, 0);
  const verified = JSON.parse(
    await readFile(".trial-runtime/identity-result.json", "utf8"),
  );
  const callback = await fetch(verified.callback, {
    headers: { cookie: cookie() },
    redirect: "manual",
  });
  assert.equal(callback.status, 303);
  accept(callback);
  assert.equal(callback.headers.get("location"), q + "/trial");
  const session = await (
    await fetch(q + "/api/trial/session", { headers: { cookie: cookie() } })
  ).json();
  assert.equal(session.identity.email, email);
  assert.ok(!JSON.stringify(session).includes("verificationToken"));
  const input = {
      restaurantName: "HTTP QA Restaurant",
      slug: prefix,
      ownerName: "HTTP QA Owner",
      email,
      password,
      confirmPassword: password,
      timezone: "Asia/Ho_Chi_Minh",
      language: "vi",
      currency: "VND",
      website: "",
      startedAt: Date.now() - 5000,
    },
    key = randomUUID();
  assert.equal(
    (await post("/api/trial/register", input, key, "https://evil.example"))
      .status,
    403,
  );
  const controller = new AbortController();
  const interrupted = fetch(q + "/api/trial/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: q,
      cookie: cookie(),
      "idempotency-key": key,
    },
    body: JSON.stringify(input),
    signal: controller.signal,
  });
  const abortTimer = setTimeout(() => controller.abort(), 50);
  try {
    await assert.rejects(
      interrupted,
      (e) => e instanceof DOMException && e.name === "AbortError",
    );
  } finally {
    clearTimeout(abortTimer);
  }
  const responses = await Promise.all([
    post("/api/trial/register", input, key),
    post("/api/trial/register", input, key),
  ]);
  for (const r of responses) assert.equal(r.status, 200);
  const [a, b] = await Promise.all(responses.map((r) => r.json()));
  assert.deepEqual(a, b);
  assert.ok(a.ok);
  assert.ok(!JSON.stringify(a).includes(password));
  assert.equal(await prisma.restaurant.count({ where: { slug: prefix } }), 1);
  assert.equal(await prisma.user.count({ where: { email } }), 1);
  assert.equal(
    await prisma.trialRegistration.count({
      where: { restaurantId: a.result.restaurantId },
    }),
    1,
  );
  assert.equal((await fetch(a.result.loginUrl)).status, 200);
  assert.deepEqual(
    counts(),
    before,
    "Trial must not create QAVIO Lead/Outbox/User/Media",
  );
  const authJar = new Map<string, string>();
  const csrf = await fetch(p + "/api/auth/csrf");
  accept(csrf, authJar);
  const token = (await csrf.json()).csrfToken;
  const login = await fetch(p + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookie(authJar),
    },
    body: new URLSearchParams({
      csrfToken: token,
      restaurantSlug: prefix,
      username: email,
      password,
      callbackUrl: p + "/" + prefix + "/admin",
      json: "true",
    }),
    redirect: "manual",
  });
  accept(login, authJar);
  assert.equal(login.status, 200);
  assert.ok(!String((await login.json()).url).includes("error="));
  const admin = await fetch(p + "/" + prefix + "/admin", {
    headers: { cookie: cookie(authJar) },
  });
  assert.equal(admin.status, 200);
  const adminHtml = await admin.text();
  assert.match(adminHtml, /TRAIN/);
  assert.ok(!adminHtml.includes(password));
  const platform = await fetch(p + "/platform/restaurants", {
    headers: { cookie: cookie(authJar) },
    redirect: "manual",
  });
  assert.equal(platform.status, 307);
  assert.match(platform.headers.get("location") || "", /unauthorized/);
  const other = await prisma.restaurant.create({
    data: { name: "HTTP QA Other Tenant", slug: prefix + "-other" },
  });
  const denied = await fetch(p + "/" + other.slug + "/admin", {
    headers: { cookie: cookie(authJar) },
    redirect: "manual",
  });
  assert.equal(denied.status, 307);
  assert.match(denied.headers.get("location") || "", /unauthorized/);
  const anonymous = await fetch(p + "/api/integrations/qavio/trial/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(anonymous.status, 401);
  const contact = await post(
    "/api/contact",
    {
      fullName: prefix,
      phone: "+12025550188",
      message: "Synthetic local regression test",
      inquiryType: "CONTACT",
      consent: true,
      privacyPolicyVersion: "contact-consent-2026-10-21",
      sourcePage: "/contact",
      website: "",
      startedAt: Date.now() - 5000,
    },
    randomUUID(),
  );
  assert.equal(contact.status, 200);
  const after = counts();
  assert.equal(after.leads, before.leads + 1);
  assert.equal(after.outbox, before.outbox);
  assert.equal((await fetch(q + "/api/admin/leads/notifications")).status, 401);
  console.log(
    JSON.stringify({
      suite: "QAVIO to QuánPilot HTTP E2E",
      google: "mocked identity exchange; real app callbacks",
      googleFlowBinding: true,
      idempotency: true,
      networkAbortRetry: true,
      oneRestaurantOneOwner: true,
      noQavioTrialPII: true,
      ownerPasswordLogin: true,
      trainBasic: true,
      platformDenied: true,
      tenantIsolation: true,
      contactPreserved: true,
      noOutbox: true,
      result: "PASS",
    }),
  );
}
main()
  .catch((e) => {
    console.error(
      "TRIAL_HTTP_FAILED",
      e instanceof assert.AssertionError
        ? e.message
        : e instanceof Error
          ? e.name
          : "CHECK_FAILED",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    const rows = await prisma.restaurant.findMany({
      where: { slug: { startsWith: prefix } },
      select: { id: true },
    });
    await prisma.trialRegistration.deleteMany({
      where: { restaurantId: { in: rows.map((r) => r.id) } },
    });
    await prisma.restaurant.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.trialIdentityChallenge.deleteMany({
      where: { googleSubject: prefix },
    });
    await prisma.$disconnect();
    const cleanup = spawnSync(
      process.execPath,
      ["scripts/trial-test-counts.mjs", "cleanup", prefix],
      { cwd: qavioRepo, encoding: "utf8", windowsHide: true },
    );
    if (cleanup.status !== 0) process.exitCode = 1;
  });
