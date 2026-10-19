import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { addCalendarMonths } from "../src/server/services/subscription-service";
import { getEffectiveSubscriptionStatus } from "../src/lib/tenant/restaurant";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file: string, expected: string, message: string) {
  assert.ok(read(file).includes(expected), message);
}

function checkSubscriptionGracePeriod() {
  const subscriptionEnd = new Date("2026-10-10T00:00:00.000Z");

  assert.equal(
    getEffectiveSubscriptionStatus(subscriptionEnd, "ACTIVE", 3, new Date("2026-10-12T23:59:59.000Z")),
    "ACTIVE",
    "A restaurant must remain operational during its configured grace period."
  );
  assert.equal(
    getEffectiveSubscriptionStatus(subscriptionEnd, "ACTIVE", 3, new Date("2026-10-13T00:00:01.000Z")),
    "EXPIRED",
    "A restaurant must be blocked after its configured grace period."
  );
  assert.equal(
    getEffectiveSubscriptionStatus(subscriptionEnd, "SUSPENDED", 3, new Date("2026-10-11T00:00:00.000Z")),
    "SUSPENDED",
    "An explicit suspension must never be hidden by a grace period."
  );
}

function checkCalendarRenewalBoundaries() {
  assert.equal(
    addCalendarMonths(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString(),
    "2026-02-28T00:00:00.000Z",
    "Renewal dates must clamp to the final day of shorter months."
  );
  assert.equal(
    addCalendarMonths(new Date("2024-01-31T00:00:00.000Z"), 1).toISOString(),
    "2024-02-29T00:00:00.000Z",
    "Renewal dates must retain leap-day correctness."
  );
}

function checkSubscriptionRaceGuards() {
  const service = "src/server/services/subscription-service.ts";
  assertIncludes(service, 'FROM "Restaurant"', "Subscription creation and confirmation must lock the restaurant row.");
  assertIncludes(service, 'FOR UPDATE', "Subscription state changes must use PostgreSQL row locks.");
  assertIncludes(service, "activeSubscriptionRequestWhere(restaurantId, now)", "Only one unexpired pending request may block a restaurant.");
  assertIncludes(service, "expireStaleSubscriptionRequests", "Expired quotes must be transitioned out of PENDING.");
  assertIncludes(service, 'status: "EXPIRED"', "Expired quotes must receive an explicit terminal status.");
  assertIncludes(service, 'status: "SUPERSEDED"', "Confirming one request must invalidate older concurrent requests.");
  assertIncludes("scripts/platform-maintenance-worker.ts", "await expireStaleSubscriptionRequests(now)", "The maintenance worker must expire stale subscription quotes.");
}

function checkUnifiedEnforcement() {
  assertIncludes("src/lib/rbac/guards.ts", "await canRestaurantOperate", "Staff routes must use the shared subscription operation guard.");
  assertIncludes("src/server/services/customer-context.ts", "await canRestaurantOperate", "Customer API routes must use the shared subscription operation guard.");
  assertIncludes("src/server/services/customer-page-context.ts", "await canRestaurantOperate", "Customer pages must use the shared subscription operation guard.");
  assertIncludes("src/app/[rSlug]/admin/subscription/page.tsx", "allowExpiredSubscription: true", "Owners must retain access to renew an expired subscription.");
}

checkSubscriptionGracePeriod();
checkCalendarRenewalBoundaries();
checkSubscriptionRaceGuards();
checkUnifiedEnforcement();

console.log("Subscription lifecycle checks passed.");
