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

const overlappingEntitlements = [
  {
    plan: "BASIC" as const,
    amountVnd: 657000,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2026-04-01T00:00:00.000Z")
  },
  {
    plan: "BASIC" as const,
    amountVnd: 1194000,
    startsAt: new Date("2026-01-15T00:00:00.000Z"),
    endsAt: new Date("2026-07-15T00:00:00.000Z")
  }
];

assert.equal(
  calculateUnusedBasicEntitlementCredit(overlappingEntitlements, new Date("2026-01-01T00:00:00.000Z")),
  1851000,
  "Kỳ chồng lấn chưa bắt đầu phải được giữ trọn giá trị đã thanh toán."
);
assert.equal(
  calculateUnusedBasicEntitlementCredit(overlappingEntitlements, new Date("2026-07-15T00:00:00.000Z")),
  0,
  "Ranh giới kết thúc kỳ không được tạo tín dụng âm hoặc còn dư."
);
const repeatedCredit = calculateUnusedBasicEntitlementCredit(overlappingEntitlements, new Date("2026-02-15T00:00:00.000Z"));
assert.equal(
  calculateUnusedBasicEntitlementCredit(overlappingEntitlements, new Date("2026-02-15T00:00:00.000Z")),
  repeatedCredit,
  "Cùng dữ liệu và thời điểm phải luôn cho cùng một tín dụng."
);
assert.ok(repeatedCredit >= 0 && repeatedCredit <= 1851000, "Tổng tín dụng phải nằm trong giá trị đã thanh toán.");

console.log("Subscription entitlement credit checks passed.");
