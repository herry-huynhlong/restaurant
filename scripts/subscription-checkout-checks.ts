import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createSubscriptionVietQrImageUrl,
  getEffectiveSubscriptionPaymentOrderStatus
} from "@/server/services/subscription-checkout-service";
import { getPaymentReceiverSnapshot } from "@/server/services/platform-subscription-payment-config-service";

const root = process.cwd();

assert.equal(getPaymentReceiverSnapshot({ isEnabled: false, bankCode: "VCB", accountNumber: "123456789", accountName: "QUANPILOT", version: 1 }), null, "Disabled platform payment must not create a QR order.");
assert.equal(getPaymentReceiverSnapshot({ isEnabled: true, bankCode: null, accountNumber: null, accountName: null, version: 1 }), null, "Missing platform bank settings must not create a fake QR.");
assert.deepEqual(getPaymentReceiverSnapshot({
  isEnabled: true,
  bankCode: "VCB",
  accountNumber: "123 456 789",
  accountName: "QUANPILOT",
  version: 4
}), {
  bankCode: "VCB",
  accountNumber: "123456789",
  accountName: "QUANPILOT",
  configVersion: 4
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

const checkoutService = read("src/server/services/subscription-checkout-service.ts");
const paymentOrderService = read("src/server/services/subscription-payment-service.ts");
const route = read("src/app/api/restaurants/[rSlug]/admin/subscription/payment-orders/[paymentOrderId]/route.ts");
const client = read("src/components/admin/subscription-pricing-client.tsx");
const checkoutClient = read("src/components/admin/subscription-payment-checkout.tsx");
const platformSettingsActions = read("src/app/platform/settings/actions.ts");

assert.ok(!checkoutService.includes("SUBSCRIPTION_VIETQR_"), "Checkout must not read subscription bank details from environment variables.");
assert.ok(checkoutService.includes("img.vietqr.io"), "Checkout must generate a VietQR image from the server-side order.");
assert.ok(checkoutService.includes("receiverBankCode"), "Checkout must read the payment-order bank snapshot.");
assert.ok(!checkoutService.includes("restaurantSetting"), "Subscription checkout must not use a restaurant bill-payment bank account.");
assert.ok(paymentOrderService.includes("getPaymentReceiverSnapshot"), "New payment orders must validate the platform payment configuration.");
assert.ok(paymentOrderService.includes("receiverAccountNumber: receiver.accountNumber"), "New payment orders must snapshot the receiving account.");
assert.ok(checkoutService.includes('status: "EXPIRED"'), "Stale payment orders must become expired.");
assert.ok(route.includes('requireRestaurantAccess(params.rSlug, ["OWNER"]'), "Checkout status API must require the restaurant owner.");
assert.ok(route.includes("restaurantId: access.restaurant.id"), "Checkout status API must scope an order to the current restaurant.");
assert.ok(platformSettingsActions.includes("requirePlatformOwner()"), "Only a platform owner/admin may update the platform payment configuration.");
assert.ok(platformSettingsActions.includes("PLATFORM_SUBSCRIPTION_PAYMENT_CONFIG_UPDATED"), "Payment configuration changes require an audit log.");
assert.ok(client.includes("startSubscriptionCheckoutAction"), "Pricing UI must create checkout through a server action.");
assert.ok(!client.includes("calculateUpgradeQuote"), "Frontend must not calculate an upgrade price.");
assert.ok(checkoutClient.includes("15_000"), "Polling must use a bounded 15-second interval.");
assert.ok(checkoutClient.includes("Việc hiển thị QR hoặc chuyển khoản không tự kích hoạt gói"), "Checkout must not promise automatic activation.");

console.log("Subscription checkout checks passed.");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
