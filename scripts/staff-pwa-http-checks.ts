import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type RestaurantRole } from "@prisma/client";
import { staffDeviceBrowser } from "./helpers/staff-device-browser";
import { encode } from "next-auth/jwt";

const target = new URL(process.env.DATABASE_URL || "http://invalid");
if (target.hostname !== "127.0.0.1" || target.port !== "55432" || target.pathname !== "/staff_pwa_test") throw Error("ISOLATED_DB_REQUIRED");
const base = "http://127.0.0.1:3450";
const db = new PrismaClient();
const run = randomUUID();
const password = randomUUID();
const users: string[] = [], restaurants: string[] = [];
let passed = 0;
function pass(message: string) { passed++; console.log("PASS " + message); }
class Client {
  jar = new Map<string, string>();
  successfulLogins = 0;
  credentialSubmissions = 0;
  async request(path: string, init: RequestInit = {}) {
    const response = await fetch(base + path, { ...init, redirect: "manual", headers: { ...init.headers, cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    for (const value of response.headers.getSetCookie()) { const [key, ...rest] = value.split(";")[0].split("="); this.jar.set(key, rest.join("=")); }
    return response;
  }
  async follow(path: string) {
    for (let i = 0; i < 15; i++) {
      const response = await this.request(path);
      const location = response.headers.get("location");
      if (location && response.status >= 300 && response.status < 400) {
        const next = new URL(location, base); assert.equal(next.origin, base); path = next.pathname + next.search; continue;
      }
      const text = await response.text();
      // Next may stream a redirect after sending headers (HTTP 200 + refresh).
      const refresh = text.match(/<meta[^>]*http-equiv="refresh"[^>]*content="[^"]*?url=([^"]+)"[^>]*>/i);
      if (refresh) {
        const next = new URL(refresh[1].replaceAll("&amp;", "&"), base);
        assert.equal(next.origin, base); path = next.pathname + next.search; continue;
      }
      return { path, status: response.status, text };
    }
    throw Error("REDIRECT_LOOP");
  }
  async login(slug: string, username: string, secret: string = password) {
    this.credentialSubmissions++;
    const csrf = await (await this.request("/api/auth/csrf")).json();
    const response = await this.request("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, restaurantSlug: slug, username, password: secret, callbackUrl: base + `/${slug}/login`, json: "true" }) });
    if (response.ok) this.successfulLogins++;
    return response;
  }
}
async function main() {
try {
  const tenant = await db.restaurant.create({ data: { name: "Staff PWA QA", slug: `staff-pwa-${run}`, plan: "PRO", planEntitlement: "PRO" } }); restaurants.push(tenant.id);
  const other = await db.restaurant.create({ data: { name: "Other isolated QA", slug: `staff-pwa-other-${run}`, plan: "PRO", planEntitlement: "PRO" } }); restaurants.push(other.id);
  const roles = { MANAGER: "admin", WAITER: "staff", KITCHEN: "kitchen", CASHIER: "cashier" } as const;
  for (const [role, context] of Object.entries(roles)) {
    const user = await db.user.create({ data: { name: "QA " + role, email: `${role}-${run}@example.invalid`, passwordHash: await bcrypt.hash(password, 4) } }); users.push(user.id);
    const member = await db.restaurantUser.create({ data: { restaurantId: tenant.id, userId: user.id, username: role.toLowerCase(), role: role as RestaurantRole } });
    const c = new Client();
    const entry = await c.follow(`/${tenant.slug}/login?role=${role}`);
    assert.equal(entry.status, 200); assert.ok(entry.text.includes(`/${tenant.slug}/${context}/manifest.webmanifest`));
    assert.ok(!entry.text.includes(">Cài App<"), "SSR must not flash an install button before standalone detection; browser E2E checks the hydrated browser option");
    const firstStatus = await c.request(`/api/restaurants/${tenant.slug}/pwa/status`);
    assert.equal(firstStatus.status, 401); assert.equal((await firstStatus.json()).state, "NO_SESSION");
    const manifest = await (await c.request(`/${tenant.slug}/${context}/manifest.webmanifest`)).json();
    assert.equal(new URL(manifest.start_url, base).searchParams.get("role"), role);
    pass(role + " QR login advertises correct manifest/start URL");
    const badCredentials = new Client();
    await badCredentials.login(tenant.slug, role.toLowerCase(), "wrong-password");
    assert.equal((await (await badCredentials.request("/api/auth/session")).json()).user, undefined);
    await c.login(tenant.slug, role.toLowerCase());
    assert.equal((await (await c.request("/api/auth/session")).json()).user.id, user.id);
    if (role !== "MANAGER") {
      const setup = await c.follow(`/${tenant.slug}/device-setup`);
      assert.ok(setup.text.includes(`/${tenant.slug}/${context}/manifest.webmanifest`));
      const device = randomUUID(); c.jar.set("staffDeviceId", device);
      const response = await c.request(`/api/restaurants/${tenant.slug}/device-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: device, operatorName: "QA operator" }) });
      assert.equal(response.status, 200);
    }
    // A fresh app process with the same cookie store: no sessionStorage/localStorage token.
    const reopened = new Client(); reopened.jar = new Map(c.jar);
    if (role !== "MANAGER") {
      const originalId = reopened.jar.get("staffDeviceId");
      assert.equal(staffDeviceBrowser(reopened.jar).getId(), originalId, "Flow A: copied cookie survives missing localStorage");
      assert.equal(staffDeviceBrowser(reopened.jar, { storage: new Map([["staffDeviceId", "stale-device-12345"]]) }).getId(), originalId);
      await db.staffDeviceSession.updateMany({ where: { restaurantId: tenant.id, userId: user.id }, data: { onShift: false } });
    }
    const deviceBeforeStatus = await db.staffDeviceSession.findMany({ where: { restaurantId: tenant.id, userId: user.id }, orderBy: { id: "asc" } });
    const auditBeforeStatus = await db.auditLog.count({ where: { restaurantId: tenant.id } });
    const ready = await reopened.request(`/api/restaurants/${tenant.slug}/pwa/status`);
    assert.match(ready.headers.get("cache-control")!, /no-store/);
    assert.equal((await ready.json()).state, "READY");
    assert.deepEqual(await db.staffDeviceSession.findMany({ where: { restaurantId: tenant.id, userId: user.id }, orderBy: { id: "asc" } }), deviceBeforeStatus);
    assert.equal(await db.auditLog.count({ where: { restaurantId: tenant.id } }), auditBeforeStatus);
    const home = await reopened.follow(manifest.start_url);
    assert.equal(home.status, 200); assert.equal(home.path, `/${tenant.slug}/${context}`);
    assert.ok(!home.text.includes("QR không hợp lệ."));
    if (role !== "MANAGER") assert.equal(await db.staffDeviceSession.count({ where: { restaurantId: tenant.id, userId: user.id } }), 1);
    pass(role + " login + close/reopen with valid session returns correct workspace");
    assert.equal(c.successfulLogins, 1, "Flow A has one successful credential submission");
    assert.equal(c.credentialSubmissions, 1);

    // Flow B: new install, no shared cookies, sign in once within that context.
    const installed = new Client();
    assert.ok((await installed.follow(manifest.start_url)).text.includes("Tên đăng nhập / Email"));
    await installed.login(tenant.slug, role.toLowerCase());
    if (role !== "MANAGER") {
      const needsSetup = await installed.request(`/api/restaurants/${tenant.slug}/pwa/status`);
      assert.equal((await needsSetup.json()).state, "DEVICE_SETUP_REQUIRED");
      const device = staffDeviceBrowser(installed.jar).getId();
      assert.equal((await installed.request(`/api/restaurants/${tenant.slug}/device-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: device, operatorName: "QA PWA operator" }) })).status, 200);
    }
    const installedReopened = new Client(); installedReopened.jar = new Map(installed.jar);
    assert.equal((await installedReopened.follow(manifest.start_url)).path, `/${tenant.slug}/${context}`);
    assert.equal(installed.successfulLogins, 1);
    assert.equal(installed.credentialSubmissions, 1);
    assert.equal(installedReopened.successfulLogins, 0);
    pass(role + " flow B: install before auth, one login in app, reopen without login");
    const wrongRole = await reopened.follow(`/${tenant.slug}/login?role=${role === "WAITER" ? "MANAGER" : "WAITER"}&pwa=1`);
    assert.equal(wrongRole.path, `/${tenant.slug}/${context}`);
    if (role !== "MANAGER") assert.equal((await reopened.follow(`/${tenant.slug}/admin`)).path, "/unauthorized");
    assert.equal((await reopened.follow(`/${other.slug}/login?role=${role}`)).path, "/unauthorized");
    assert.equal((await reopened.follow(`/${other.slug}/${context}`)).path, "/unauthorized");
    pass(role + " role tampering and other tenant do not grant access");
    await db.restaurantUser.update({ where: { id: member.id }, data: { isActive: false } });
    const disabled = await reopened.follow(manifest.start_url); assert.equal(disabled.path, "/unauthorized");
    assert.equal((await reopened.follow(`/${tenant.slug}/${context}`)).path, "/unauthorized");
    await db.restaurantUser.update({ where: { id: member.id }, data: { isActive: true } });
    await db.user.update({ where: { id: user.id }, data: { isActive: false } });
    assert.equal((await (await reopened.request(`/api/restaurants/${tenant.slug}/pwa/status`)).json()).state, "FORBIDDEN");
    await db.user.update({ where: { id: user.id }, data: { isActive: true } });
    await db.restaurant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
    assert.equal((await (await reopened.request(`/api/restaurants/${tenant.slug}/pwa/status`)).json()).state, "TENANT_UNAVAILABLE");
    await db.restaurant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
    if (role !== "WAITER") {
      await db.restaurant.update({ where: { id: tenant.id }, data: { plan: "BASIC", planEntitlement: "BASIC" } });
      assert.equal((await (await reopened.request(`/api/restaurants/${tenant.slug}/pwa/status`)).json()).state, "FORBIDDEN");
      await db.restaurant.update({ where: { id: tenant.id }, data: { plan: "PRO", planEntitlement: "PRO" } });
    }
    const expired = new Client();
    const login = await expired.follow(manifest.start_url);
    assert.ok(login.text.includes("Phiên đăng nhập chưa có hoặc đã hết hạn"));
    assert.ok(login.text.includes(`/${tenant.slug}/${context}/manifest.webmanifest`));
    const oldStart = await expired.follow(`/${tenant.slug}/${context}`);
    assert.ok(oldStart.path.startsWith(`/${tenant.slug}/login?`), JSON.stringify({ path: oldStart.path, refresh: oldStart.text.match(/<meta[^>]*refresh[^>]*>/gi) }));
    assert.ok(oldStart.text.includes("không cần quét lại QR"));
    pass(role + " expired/missing session shows tenant login; inactive membership blocked");
    const jwtName = [...c.jar.keys()].find(key => key.includes("session-token"))!;
    const expiredJwt = new Client(); expiredJwt.jar.set(jwtName, await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: user.id, platformRole: "USER" }, maxAge: -120 }));
    assert.equal((await (await expiredJwt.request(`/api/restaurants/${tenant.slug}/pwa/status`)).json()).state, "NO_SESSION");
    if (role !== "MANAGER") {
      const deviceId = reopened.jar.get("staffDeviceId")!;
      await db.staffDeviceSession.update({ where: { restaurantId_userId_deviceId: { restaurantId: tenant.id, userId: user.id, deviceId } }, data: { isActive: false, revokedAt: new Date() } });
      assert.equal((await (await reopened.request(`/api/restaurants/${tenant.slug}/pwa/status`)).json()).state, "DEVICE_REVOKED");
      const revokedPage = await reopened.follow(manifest.start_url);
      assert.ok(revokedPage.text.includes("Thiết bị này đã bị quản lý khóa"));
      assert.ok(!revokedPage.text.includes('name="password"'), "Revocation is not an invitation to re-enter a password");
      const reenroll = await reopened.request(`/api/restaurants/${tenant.slug}/device-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, operatorName: "QA retry" }) });
      assert.equal(reenroll.status, 403);
      assert.equal((await db.staffDeviceSession.findUnique({ where: { restaurantId_userId_deviceId: { restaurantId: tenant.id, userId: user.id, deviceId } } }))!.isActive, false);
    }
    pass(role + " expired JWT and revoked device cannot be resumed or automatically reactivated");
  }
  const customer = await (await new Client().request(`/${tenant.slug}/manifest.webmanifest`)).json();
  assert.equal(customer.start_url, `/${tenant.slug}/welcome`);
  pass("customer manifest and QR validation remain separate");
  console.log(`RESULT ${passed} checks passed; isolated PostgreSQL only`);
} finally {
  await db.auditLog.deleteMany({ where: { restaurantId: { in: restaurants } } });
  await db.staffDeviceSession.deleteMany({ where: { restaurantId: { in: restaurants } } });
  await db.restaurant.deleteMany({ where: { id: { in: restaurants } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
