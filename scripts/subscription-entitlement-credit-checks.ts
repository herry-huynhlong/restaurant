import assert from "node:assert/strict";
import { calculateUnusedBasicEntitlementCredit } from "@/server/services/subscription-entitlement-service";

const at = new Date("2026-02-15T00:00:00.000Z");
const credit = calculateUnusedBasicEntitlementCredit([
  {
    plan: "BASIC",
    amountVnd: 657000,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2026-04-01T00:00:00.000Z")
  },
  {
    // Renewed early at the discounted 12-month price. This period has not
    // started yet, so its own paid amount must remain fully credited.
    plan: "BASIC",
    amountVnd: 2148000,
    startsAt: new Date("2026-04-01T00:00:00.000Z"),
    endsAt: new Date("2027-04-01T00:00:00.000Z")
  },
  {
    plan: "PRO",
    amountVnd: 3948000,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z")
  }
], at);

assert.equal(credit, 2476500, "Mỗi kỳ BASIC phải được tính theo đúng giá đã trả, không theo đơn giá bình quân.");
assert.equal(calculateUnusedBasicEntitlementCredit([
  {
    plan: "BASIC",
    amountVnd: 657000,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2026-04-01T00:00:00.000Z")
  }
], new Date("2026-05-01T00:00:00.000Z")), 0, "Tín dụng không được âm sau khi hết hạn.");

console.log("Subscription entitlement credit checks passed.");
