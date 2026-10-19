import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createSubscriptionVietQrImageUrl,
  getEffectiveSubscriptionPaymentOrderStatus,
  getSubscriptionBankConfig
} from "@/server/services/subscription-checkout-service";

const root = process.cwd();
const previousBankCode = process.env.SUBSCRIPTION_VIETQR_BANK_CODE;
const previousAccountNumber = process.env.SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER;
const previousAccountName = process.env.SUBSCRIPTION_VIETQR_ACCOUNT_NAME;

delete process.env.SUBSCRIPTION_VIETQR_BANK_CODE;
delete process.env.SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER;
assert.deepEqual(getSubscriptionBankConfig(), { ready: false }, "Missing platform bank settings must not create a fake QR.");

process.env.SUBSCRIPTION_VIETQR_BANK_CODE = "VCB";
process.env.SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER = "123 456 789";
process.env.SUBSCRIPTION_VIETQR_ACCOUNT_NAME = "QUANPILOT";
assert.deepEqual(getSubscriptionBankConfig(), {
  ready: true,
  bankCode: "VCB",
  accountNumber: "123456789",
  accountName: "QUANPILOT"
});

const vietQr = new URL(createSubscriptionVietQrImageUrl({
  bankCode: "VCB",
  accountNumber: "123456789",
  accountName: "QUANPILOT",
  amountVnd: 657000,
  transferCode: "QPABC123"
}));
assert.equal(vietQr.searchParams.get("amount"), "657000", "VietQR must use the snapshot amount.");
assert.equal(vietQr.searchParams.get("addInfo"), "QPABC123", "VietQR must use the unique transfer code.");
assert.equal(getEffectiveSubscriptionPaymentOrderStatus("PENDING", new Date("2026-10-20T00:00:00.000Z"), new Date("2026-10-19T00:00:00.000Z")), "PENDING");
assert.equal(getEffectiveSubscriptionPaymentOrderStatus("PENDING", new Date("2026-10-19T00:00:00.000Z"), new Date("2026-10-19T00:00:00.000Z")), "EXPIRED");
assert.equal(getEffectiveSubscriptionPaymentOrderStatus("PAID", new Date("2026-10-18T00:00:00.000Z"), new Date("2026-10-19T00:00:00.000Z")), "PAID");

restoreEnvironment("SUBSCRIPTION_VIETQR_BANK_CODE", previousBankCode);
restoreEnvironment("SUBSCRIPTION_VIETQR_ACCOUNT_NUMBER", previousAccountNumber);
restoreEnvironment("SUBSCRIPTION_VIETQR_ACCOUNT_NAME", previousAccountName);

const checkoutService = read("src/server/services/subscription-checkout-service.ts");
const route = read("src/app/api/restaurants/[rSlug]/admin/subscription/payment-orders/[paymentOrderId]/route.ts");
const client = read("src/components/admin/subscription-pricing-client.tsx");
const checkoutClient = read("src/components/admin/subscription-payment-checkout.tsx");

assert.ok(checkoutService.includes("SUBSCRIPTION_VIETQR_BANK_CODE"), "Bank details must come from server configuration.");
assert.ok(checkoutService.includes("img.vietqr.io"), "Checkout must generate a VietQR image from the server-side order.");
assert.ok(checkoutService.includes('status: "EXPIRED"'), "Stale payment orders must become expired.");
assert.ok(route.includes('requireRestaurantAccess(params.rSlug, ["OWNER"]'), "Checkout status API must require the restaurant owner.");
assert.ok(route.includes("restaurantId: access.restaurant.id"), "Checkout status API must scope an order to the current restaurant.");
assert.ok(client.includes("startSubscriptionCheckoutAction"), "Pricing UI must create checkout through a server action.");
assert.ok(!client.includes("calculateUpgradeQuote"), "Frontend must not calculate an upgrade price.");
assert.ok(checkoutClient.includes("15_000"), "Polling must use a bounded 15-second interval.");
assert.ok(checkoutClient.includes("Việc hiển thị QR hoặc chuyển khoản không tự kích hoạt gói"), "Checkout must not promise automatic activation.");

console.log("Subscription checkout checks passed.");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
