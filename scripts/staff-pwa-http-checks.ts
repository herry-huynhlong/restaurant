import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, type RestaurantRole } from "@prisma/client";

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
    const csrf = await (await this.request("/api/auth/csrf")).json();
    return this.request("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, restaurantSlug: slug, username, password: secret, callbackUrl: base + `/${slug}/login`, json: "true" }) });
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
    const manifest = await (await c.request(`/${tenant.slug}/${context}/manifest.webmanifest`)).json();
    assert.equal(new URL(manifest.start_url, base).searchParams.get("role"), role);
    pass(role + " QR login advertises correct manifest/start URL");
    await c.login(tenant.slug, role.toLowerCase(), "wrong-password");
    assert.equal((await (await c.request("/api/auth/session")).json()).user, undefined);
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
    const home = await reopened.follow(manifest.start_url);
    assert.equal(home.status, 200); assert.equal(home.path, `/${tenant.slug}/${context}`);
    assert.ok(!home.text.includes("QR không hợp lệ."));
    if (role !== "MANAGER") assert.equal(await db.staffDeviceSession.count({ where: { restaurantId: tenant.id, userId: user.id } }), 1);
    pass(role + " login + close/reopen with valid session returns correct workspace");
    const wrongRole = await reopened.follow(`/${tenant.slug}/login?role=${role === "WAITER" ? "MANAGER" : "WAITER"}&pwa=1`);
    assert.equal(wrongRole.path, `/${tenant.slug}/${context}`);
    if (role !== "MANAGER") assert.equal((await reopened.follow(`/${tenant.slug}/admin`)).path, "/unauthorized");
    assert.equal((await reopened.follow(`/${other.slug}/login?role=${role}`)).path, `/${other.slug}/login?role=${role}`);
    assert.equal((await reopened.follow(`/${other.slug}/${context}`)).path, "/unauthorized");
    pass(role + " role tampering and other tenant do not grant access");
    await db.restaurantUser.update({ where: { id: member.id }, data: { isActive: false } });
    const disabled = await reopened.follow(manifest.start_url); assert.ok(disabled.path.includes("/login"));
    assert.equal((await reopened.follow(`/${tenant.slug}/${context}`)).path, "/unauthorized");
    await db.restaurantUser.update({ where: { id: member.id }, data: { isActive: true } });
    const expired = new Client();
    const login = await expired.follow(manifest.start_url);
    assert.ok(login.text.includes("Phiên đăng nhập chưa có hoặc đã hết hạn"));
    assert.ok(login.text.includes(`/${tenant.slug}/${context}/manifest.webmanifest`));
    const oldStart = await expired.follow(`/${tenant.slug}/${context}`);
    assert.ok(oldStart.path.startsWith(`/${tenant.slug}/login?`), JSON.stringify({ path: oldStart.path, refresh: oldStart.text.match(/<meta[^>]*refresh[^>]*>/gi) }));
    assert.ok(oldStart.text.includes("không cần quét lại QR"));
    pass(role + " expired/missing session shows tenant login; inactive membership blocked");
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
