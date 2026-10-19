import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getSePayTransferCodeCandidates,
  isAuthorizedSePayWebhook,
  parseSePayWebhookPayload
} from "@/server/services/subscription-sepay-webhook-service";

const secret = "webhook-test-secret";
assert.equal(isAuthorizedSePayWebhook("Apikey webhook-test-secret", secret), true, "The configured SePay API key must be accepted.");
assert.equal(isAuthorizedSePayWebhook("Apikey wrong-secret", secret), false, "A wrong SePay API key must be rejected.");
assert.equal(isAuthorizedSePayWebhook(null, secret), false, "A missing SePay API key must be rejected.");

const payload = parseSePayWebhookPayload({
  id: 92704,
  accountNumber: "226633456",
  transactionDate: "2026-10-19 18:33:00",
  transferType: "in",
  transferAmount: 657000,
  code: "QP0123ABCDEF",
  content: "QP0123ABCDEF thanh toan goi"
});
assert.deepEqual(getSePayTransferCodeCandidates(payload), ["QP0123ABCDEF"], "The provider payment code must be normalized exactly.");

const legacyPayload = parseSePayWebhookPayload({
  id: "92705",
  accountNumber: "226633456",
  transferType: "in",
  transferAmount: 657000,
  content: "Thanh toan QP0123456789ABCDEF"
});
assert.deepEqual(getSePayTransferCodeCandidates(legacyPayload), ["QP0123456789ABCDEF"], "Older long transfer codes must remain matchable from transfer content.");
assert.throws(
  () => parseSePayWebhookPayload({ id: 1, accountNumber: "1", transferType: "in", transferAmount: 0 }),
  /greater than 0/i,
  "Zero-value callbacks must be rejected."
);

const root = process.cwd();
const webhookRoute = read("src/app/api/webhooks/sepay/subscription/route.ts");
const webhookService = read("src/server/services/subscription-sepay-webhook-service.ts");
const subscriptionService = read("src/server/services/subscription-service.ts");
const composeFile = read("docker-compose.yml");

assert.ok(webhookRoute.includes("isAuthorizedSePayWebhook"), "The webhook route must authenticate SePay before parsing the payload.");
assert.ok(webhookRoute.includes("maximumPayloadBytes"), "The webhook route must bound payload size.");
assert.ok(webhookService.includes("transferAmount !== order.amountVnd"), "The webhook must require an exact expected amount.");
assert.ok(webhookService.includes("RECEIVER_ACCOUNT_MISMATCH"), "The webhook must verify the snapshotted receiving account.");
assert.ok(webhookService.includes("providerEventId"), "The webhook must retain the provider event identity for idempotency.");
assert.ok(subscriptionService.includes("Giao dịch SePay chưa được xác minh"), "Platform confirmation must be blocked until a SePay order is paid.");
assert.ok(composeFile.includes("SEPAY_SUBSCRIPTION_WEBHOOK_API_KEY"), "The app service must receive the webhook secret at runtime.");

console.log("Subscription SePay webhook checks passed.");

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}
