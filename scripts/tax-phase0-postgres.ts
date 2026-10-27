import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { PrismaClient, type PaymentMethod } from "@prisma/client";
import { prisma as appDb } from "@/lib/db/prisma";
import { createCustomerSessionValue, customerSessionCookieName } from "@/lib/customer-session";
import { confirmDiningSessionPaid } from "@/server/services/payment-service";
import { POST as serviceRequest } from "@/app/api/restaurants/[rSlug]/customer/service-request/route";
import { POST as customerOrder } from "@/app/api/restaurants/[rSlug]/customer/order/route";
import { auditFinancialSource } from "@/server/services/financial-audit-service";
import { encode } from "next-auth/jwt";
import { getRestaurantPaymentReport } from "@/server/services/reporting-service";

const url = process.env.TAX_PHASE0_TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url) throw new Error("Explicit equal TAX_PHASE0_TEST_DATABASE_URL and DATABASE_URL required");
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.port !== "55432" || target.pathname !== "/tax_phase0_test") throw new Error("Isolated phase0 database only");
const db = new PrismaClient();
const runId = randomUUID();
let userId: string;
const tenants: string[] = [];
let checks = 0;
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const restaurant = await db.restaurant.create({ data: { name: "Phase0 test", slug: `phase0-${randomUUID()}`, plan: "PRO", planEntitlement: "PRO" } });
  tenants.push(restaurant.id);
  await db.restaurantSetting.create({ data: { restaurantId: restaurant.id, restaurantName: restaurant.name, taxEnabled: true, taxRate: 10 } });
  const area = await db.area.create({ data: { restaurantId: restaurant.id, name: "Test" } });
  const table = await db.restaurantTable.create({ data: { restaurantId: restaurant.id, areaId: area.id, name: "Test 1", qrToken: randomUUID(), status: "OCCUPIED" } });
  const session = await db.diningSession.create({ data: { restaurantId: restaurant.id, tableId: table.id } });
  const category = await db.category.create({ data: { restaurantId: restaurant.id, nameVi: "Test" } });
  const product = await db.product.create({ data: { restaurantId: restaurant.id, categoryId: category.id, nameVi: "Test item", price: 10000 } });
  return { restaurant, table, session, product };
}
function request(f: Fixture, body: unknown) {
  const cookie = createCustomerSessionValue({ restaurantId: f.restaurant.id, restaurantSlug: f.restaurant.slug, tableId: f.table.id, tableName: f.table.name, qrToken: f.table.qrToken, diningSessionId: f.session.id, customerName: "QA Phase0", createdAt: Date.now() });
  return new NextRequest("http://localhost/api/test", { method: "POST", headers: { "content-type": "application/json", cookie: `${customerSessionCookieName(f.restaurant.slug)}=${cookie}` }, body: JSON.stringify(body) });
}
function pay(f: Fixture, method: PaymentMethod = "CASH", expectedGrandTotal?: number) {
  return confirmDiningSessionPaid({ restaurantId: f.restaurant.id, diningSessionId: f.session.id, confirmedByUserId: userId, paymentMethod: method, expectedGrandTotal });
}
function send(f: Fixture) {
  return serviceRequest(request(f, { requestType: "REQUEST_PAYMENT" }), { params: { rSlug: f.restaurant.slug } });
}
function order(f: Fixture, key = randomUUID()) {
  return customerOrder(request(f, { items: [{ productId: f.product.id, quantity: 1 }], idempotencyKey: key }), { params: { rSlug: f.restaurant.slug } });
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function immutable(f: Fixture, before: unknown) {
  assert.deepEqual(await db.payment.findFirst({ where: { diningSessionId: f.session.id } }), before, "Confirmed financial snapshot must remain byte-for-byte unchanged");
  const session = await db.diningSession.findUniqueOrThrow({ where: { id: f.session.id } });
  assert.equal(session.status, "CLOSED"); assert.equal(session.paymentStatus, "PAID");
  assert.equal(await db.payment.count({ where: { diningSessionId: f.session.id, status: "PAID" } }), 1);
}
async function scenario(name: string, test: () => Promise<void>) { await test(); checks++; console.log(`PASS ${name}`); }
async function run() {
  userId = (await db.user.create({ data: { name: "Phase0 QA", email: `${runId}@example.test`, passwordHash: "not-a-login-password" } })).id;
  await scenario("stale customer context cannot downgrade PAID or reopen CLOSED", async () => {
    const f = await fixture(); await order(f);
    const entered = gate(), resume = gate();
    const req = request(f, { requestType: "REQUEST_PAYMENT" });
    // Real route has already read an OPEN session when JSON parsing is reached.
    req.json = async () => { entered.release(); await resume.promise; return { requestType: "REQUEST_PAYMENT" }; };
    const pending = serviceRequest(req, { params: { rSlug: f.restaurant.slug } });
    await entered.promise;
    try {
      assert.equal((await pay(f, "CARD")).ok, true);
    } finally { resume.release(); }
    const response = await pending;
    const paid = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
    assert.equal(paid.status, "PAID"); assert.equal(paid.paymentMethod, "CARD");
    assert.equal(response.status, 409, "An in-flight payment request must reject a session closed while it was parsing");
    await immutable(f, paid);
  });
  await scenario("parallel payment requests and API double-click create one request", async () => {
    const f = await fixture(); await order(f);
    const responses = await Promise.all([send(f), send(f), send(f), send(f)]);
    assert.ok(responses.every((r) => r.status === 200));
    assert.equal(await db.serviceRequest.count({ where: { diningSessionId: f.session.id } }), 1);
    assert.equal(await db.payment.count({ where: { diningSessionId: f.session.id } }), 1);
  });
  await scenario("two confirmations, method change and retry preserve original bill", async () => {
    const f = await fixture(); await order(f); await order(f); await send(f);
    const audit = await db.auditLog.create({ data: { restaurantId: f.restaurant.id, userId, action: "PHASE0_TEST", entityType: "DiningSession", entityId: f.session.id } });
    const results = await Promise.all([pay(f, "CARD"), pay(f, "BANK_TRANSFER")]);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results[0].ok && results[0].paymentId, results[1].ok && results[1].paymentId);
    const before = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
    assert.equal(before.grandTotal, 22000); assert.ok(before.paidAt); assert.equal(before.confirmedByUserId, userId);
    await pay(f, "QR", 999999);
    assert.equal((await send(f)).status, 401, "A fresh request after PAID has no active customer context");
    await immutable(f, before);
    assert.deepEqual(await db.auditLog.findUnique({ where: { id: audit.id } }), audit);
    assert.equal(await db.serviceRequest.count({ where: { diningSessionId: f.session.id, status: "COMPLETED" } }), 1);
  });
  await scenario("request and confirmation race serializes without lost paid amount", async () => {
    for (let n = 0; n < 5; n++) {
      const f = await fixture(); await order(f);
      const [response, result] = await Promise.all([send(f), pay(f, "BANK_TRANSFER")]);
      assert.ok([200, 401, 409].includes(response.status)); assert.equal(result.ok, true);
      const paid = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
      assert.equal(paid.grandTotal, 11000); assert.equal(paid.paymentMethod, "BANK_TRANSFER"); await immutable(f, paid);
    }
  });
  await scenario("order retry is idempotent; changed expected amount rejects before confirmation", async () => {
    const f = await fixture(); const key = randomUUID();
    const results = await Promise.all([order(f, key), order(f, key)]);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(await db.order.count({ where: { diningSessionId: f.session.id } }), 1);
    const changed = await pay(f, "CASH", 0);
    assert.deepEqual(changed, { ok: false, reason: "BILL_CHANGED", grandTotal: 11000 });
    assert.equal(await db.payment.count({ where: { diningSessionId: f.session.id, status: "PAID" } }), 0);
    assert.equal((await pay(f, "CASH", 11000)).ok, true);
  });
  await scenario("stale order after close is rejected; concurrent order is included or rejected", async () => {
    const f = await fixture(); await order(f);
    const entered = gate(), resume = gate(); const req = request(f, {});
    req.json = async () => { entered.release(); await resume.promise; return { items: [{ productId: f.product.id, quantity: 1 }], idempotencyKey: randomUUID() }; };
    const pending = customerOrder(req, { params: { rSlug: f.restaurant.slug } }); await entered.promise;
    try { await pay(f); } finally { resume.release(); }
    assert.equal((await pending).status, 409);
    for (let n = 0; n < 5; n++) {
      const g = await fixture(); await order(g);
      const [response, result] = await Promise.all([order(g), pay(g)]);
      assert.ok([200, 401, 409].includes(response.status)); assert.equal(result.ok, true);
      const count = await db.order.count({ where: { diningSessionId: g.session.id } });
      const paid = await db.payment.findFirstOrThrow({ where: { diningSessionId: g.session.id } });
      assert.equal(paid.grandTotal, count * 11000); await immutable(g, paid);
    }
  });
  await scenario("tenant isolation rejects cross-tenant session, product and cookie", async () => {
    const a = await fixture(), b = await fixture(); await order(a);
    assert.deepEqual(await confirmDiningSessionPaid({ restaurantId: b.restaurant.id, diningSessionId: a.session.id, confirmedByUserId: userId, paymentMethod: "CASH" }), { ok: false, reason: "SESSION_NOT_ACTIVE" });
    const req = request(a, { items: [{ productId: b.product.id, quantity: 1 }], idempotencyKey: randomUUID() });
    assert.equal((await customerOrder(req, { params: { rSlug: a.restaurant.slug } })).status, 409);
    assert.equal((await serviceRequest(request(a, { requestType: "REQUEST_PAYMENT" }), { params: { rSlug: b.restaurant.slug } })).status, 401);
    assert.equal(await db.payment.count({ where: { restaurantId: b.restaurant.id } }), 0);
  });
  await scenario("actual PostgreSQL monthly report includes start, excludes end and respects leap February", async () => {
    const f = await fixture();
    const times = ["2024-01-31T16:59:59.999Z", "2024-01-31T17:00:00.000Z", "2024-02-29T16:59:59.999Z", "2024-02-29T17:00:00.000Z"];
    for (let index = 0; index < times.length; index++) {
      const session = index === 0 ? f.session : await db.diningSession.create({ data: { restaurantId: f.restaurant.id, tableId: f.table.id } });
      const g = { ...f, session }; await order(g); const result = await pay(g);
      assert.ok(result.ok);
      await db.payment.update({ where: { id: result.paymentId }, data: { paidAt: new Date(times[index]) } });
    }
    const report = await getRestaurantPaymentReport(f.restaurant.id, "month", new Date("2024-02-15T12:00:00Z"));
    assert.equal(report.summary.revenue, 22000); assert.equal(report.summary.invoiceCount, 2);
    assert.equal(report.previousSummary.revenue, 11000); assert.equal(report.buckets.length, 29);
    assert.equal(report.buckets[0].amount, 11000); assert.equal(report.buckets[28].amount, 11000);
    assert.equal(report.buckets.reduce((sum, bucket) => sum + bucket.amount, 0), report.summary.revenue);
  });
  if (process.argv.includes("--http")) {
    await scenario("real staff-order HTTP API and confirmation do not deadlock or change a closed bill", async () => {
      const f = await fixture(); await order(f);
      await db.restaurantUser.create({ data: { restaurantId: f.restaurant.id, userId, role: "OWNER" } });
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: userId, sub: userId, name: "Phase0 QA", platformRole: "USER" }, maxAge: 600 });
      const staff = (body: unknown) => fetch(`http://127.0.0.1:3300/api/restaurants/${f.restaurant.slug}/admin/tables/${f.table.id}/order`, { method: "POST", headers: { "content-type": "application/json", cookie: `next-auth.session-token=${token}` }, body: JSON.stringify(body), redirect: "manual" });
      assert.equal((await staff({})).status, 400, "Warm the real authenticated route before introducing database gates");
      const key = `staff-lock-${runId}`;
      const held = gate(), unlock = gate();
      const holder = db.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(260026)::text`; held.release(); await unlock.promise; }, { timeout: 15000 });
      await held.promise;
      // Only this fixture's order pauses, solely in the isolated database.
      await db.$executeRawUnsafe(`CREATE FUNCTION phase0_pause_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(260026); RETURN NEW; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER phase0_order_gate BEFORE INSERT ON "Order" FOR EACH ROW WHEN (NEW."idempotencyKey"='${key}') EXECUTE FUNCTION phase0_pause_order()`);
      async function waitForWait(text: string) {
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE ${`%${text}%`} AND pid<>pg_backend_pid()`;
          if (Number(rows[0].count) > 0) return;
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error(`Database gate not reached: ${text}`);
      }
      let pending: Promise<Response> | undefined;
      let confirmation: ReturnType<typeof pay> | undefined;
      try {
        pending = staff({ items: [{ productId: f.product.id, quantity: 1 }], idempotencyKey: key });
        await waitForWait('INSERT INTO "public"."Order"');
        confirmation = pay(f);
        await waitForWait("RestaurantTable");
      } finally {
        unlock.release(); await holder;
        const results = await Promise.allSettled([pending, confirmation]);
        await db.$executeRawUnsafe('DROP TRIGGER phase0_order_gate ON "Order"');
        await db.$executeRawUnsafe('DROP FUNCTION phase0_pause_order()');
        for (const result of results) assert.equal(result.status, "fulfilled", "Both lock owners must complete without a deadlock");
      }
      assert.equal((await pending!).status, 200, "Staff order should finish before the waiting confirmation");
      assert.equal((await confirmation!).ok, true);
      const paid = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
      assert.equal(paid.grandTotal, 22000); await immutable(f, paid);
      assert.equal((await staff({ items: [{ productId: f.product.id, quantity: 1 }], idempotencyKey: key })).status, 200);
      assert.equal(await db.order.count({ where: { diningSessionId: f.session.id } }), 2);
      await immutable(f, paid);
    });
    await scenario("real confirmation HTTP double-click, retry, tenant guards and paid-bill/report APIs", async () => {
      const f = await fixture(); await order(f); await send(f);
      await db.restaurantUser.create({ data: { restaurantId: f.restaurant.id, userId, role: "OWNER" } });
      const token = await encode({ secret: process.env.NEXTAUTH_SECRET!, token: { id: userId, sub: userId, name: "Phase0 QA", platformRole: "USER" }, maxAge: 600 });
      const headers = { "content-type": "application/json", cookie: `next-auth.session-token=${token}` };
      const base = `http://127.0.0.1:3300/api/restaurants/${f.restaurant.slug}`;
      const post = (body: unknown) => fetch(`${base}/ops/pay-session`, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" });
      assert.equal((await post({ paymentMethod: "CARD" })).status, 400);
      assert.equal((await post({ diningSessionId: f.session.id, paymentMethod: "CARD", expectedGrandTotal: 0 })).status, 409);
      assert.equal(await db.payment.count({ where: { diningSessionId: f.session.id, status: "PAID" } }), 0);
      const responses = await Promise.all([post({ diningSessionId: f.session.id, paymentMethod: "CARD", expectedGrandTotal: 11000 }), post({ diningSessionId: f.session.id, paymentMethod: "BANK_TRANSFER", expectedGrandTotal: 11000 })]);
      assert.ok(responses.every((r) => r.status === 200));
      const bodies = await Promise.all(responses.map((r) => r.json()));
      assert.ok(bodies[0].payment.paymentId);
      assert.equal(bodies[0].payment.paymentId, bodies[1].payment.paymentId);
      const before = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
      assert.equal((await post({ diningSessionId: f.session.id, paymentMethod: "QR" })).status, 200);
      await immutable(f, before);
      assert.equal((await fetch(`${base}/reports/payments/${before.id}`, { headers, redirect: "manual" })).status, 200);
      assert.equal((await fetch(`${base}/reports/payments`, { headers, redirect: "manual" })).status, 200);
      for (const page of ["admin/tables", "cashier", "admin/reports"]) {
        assert.equal((await fetch(`http://127.0.0.1:3300/${f.restaurant.slug}/${page}`, { headers, redirect: "manual" })).status, 200, page);
      }
      assert.equal((await fetch(`http://127.0.0.1:3300/${f.restaurant.slug}/welcome?t=${f.table.qrToken}`, { redirect: "manual" })).status, 200);
      const other = await fixture();
      assert.equal((await post({ diningSessionId: other.session.id, paymentMethod: "CASH" })).status, 409);
      const denied = await fetch(`${base}/ops/pay-session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ diningSessionId: f.session.id, paymentMethod: "CASH" }), redirect: "manual" });
      assert.equal(denied.status, 307);
      await db.restaurantUser.update({ where: { restaurantId_userId: { restaurantId: f.restaurant.id, userId } }, data: { role: "WAITER" } });
      assert.equal((await post({ diningSessionId: f.session.id, paymentMethod: "CASH" })).status, 307);
      await immutable(f, before);
    });
  }
  await scenario("read-only audit detects corrupt fixtures without changing financial data", async () => {
    const clean = await auditFinancialSource(db);
    assert.ok(clean.findings.every((finding) => finding.count === 0), JSON.stringify(clean));
    const a = await fixture(), b = await fixture(); await order(a); await pay(a);
    const paid = await db.payment.findFirstOrThrow({ where: { diningSessionId: a.session.id } });
    await db.payment.update({ where: { id: paid.id }, data: { restaurantId: b.restaurant.id, paidAt: null, grandTotal: 42, tableNameSnapshot: null, confirmedByUserId: null } });
    await db.payment.create({ data: { restaurantId: a.restaurant.id, diningSessionId: a.session.id, status: "PAID", paymentMethod: "CASH", amount: 1, idempotencyKey: randomUUID() } });
    await db.order.updateMany({ where: { diningSessionId: a.session.id }, data: { restaurantId: b.restaurant.id } });
    await db.diningSession.update({ where: { id: a.session.id }, data: { status: "OPEN" } });
    const before = await db.payment.findMany({ orderBy: { id: "asc" } });
    const report = await auditFinancialSource(db);
    for (const code of ["PAID_WITHOUT_PAID_AT", "BILL_TOTAL_MISMATCH", "MISSING_BILL_SNAPSHOT", "MULTIPLE_PAID_PER_SESSION", "PAYMENT_TENANT_MISMATCH", "ORDER_TENANT_MISMATCH", "ITEM_TENANT_MISMATCH", "LEGACY_INCOMPLETE", "PAID_SOURCE_TOTAL_MISMATCH", "PAID_SESSION_STATE_MISMATCH"]) {
      assert.ok(report.findings.find((finding) => finding.code === code)!.count > 0, code);
    }
    assert.deepEqual(await db.payment.findMany({ orderBy: { id: "asc" } }), before);
    assert.equal(report.findings.find((f) => f.code === "DUPLICATE_INVOICE_NUMBER")!.count, 0);
    assert.equal(report.findings.find((f) => f.code === "DUPLICATE_IDEMPOTENCY_KEY")!.count, 0);
    await assert.rejects(db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`UPDATE "Payment" SET amount=0 WHERE id=${paid.id}`;
    }), /read.only transaction/i);
    await assert.rejects(db.payment.create({ data: { restaurantId: b.restaurant.id, diningSessionId: b.session.id, status: "PAID", paymentMethod: "CASH", amount: 1, invoiceNumber: paid.invoiceNumber, idempotencyKey: randomUUID() } }), /Unique constraint/);
    await assert.rejects(db.payment.create({ data: { restaurantId: b.restaurant.id, diningSessionId: b.session.id, status: "PAID", paymentMethod: "CASH", amount: 1, idempotencyKey: paid.idempotencyKey } }), /Unique constraint/);
  });
  await scenario("legacy inconsistent active session cannot overwrite an existing paid snapshot", async () => {
    const f = await fixture(); await order(f); await pay(f, "CARD");
    const before = await db.payment.findFirstOrThrow({ where: { diningSessionId: f.session.id } });
    await db.diningSession.update({ where: { id: f.session.id }, data: { status: "OPEN", paymentStatus: "PENDING" } });
    assert.equal((await send(f)).status, 409);
    const retry = await pay(f, "QR"); assert.ok(retry.ok); assert.equal(retry.paymentId, before.id);
    assert.deepEqual(await db.payment.findUnique({ where: { id: before.id } }), before);
    assert.equal((await db.diningSession.findUniqueOrThrow({ where: { id: f.session.id } })).status, "OPEN", "Do not silently repair historical session data");
  });
  await scenario("corrupt cross-tenant table reference cannot acquire a write lock or mutate another tenant", async () => {
    const a = await fixture(), b = await fixture();
    await db.diningSession.update({ where: { id: a.session.id }, data: { tableId: b.table.id } });
    const corrupt = { ...a, table: b.table };
    assert.equal((await send(corrupt)).status, 409);
    assert.equal((await order(corrupt)).status, 409);
    assert.deepEqual(await pay(corrupt), { ok: false, reason: "SESSION_NOT_ACTIVE" });
    assert.equal(await db.payment.count({ where: { diningSessionId: a.session.id } }), 0);
    assert.deepEqual(await db.restaurantTable.findUnique({ where: { id: b.table.id } }), b.table);
  });
  console.log(`Phase0 PostgreSQL integration passed: ${checks} scenarios (including repeated concurrent races).`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  // Only fixtures created by this invocation, never a reset or broad cleanup.
  await db.restaurant.deleteMany({ where: { id: { in: tenants } } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await Promise.all([db.$disconnect(), appDb.$disconnect()]);
});
