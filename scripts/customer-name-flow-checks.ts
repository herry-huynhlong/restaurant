import assert from "node:assert/strict";
import { customerDisplayName, customerGreeting, normalizeCustomerName } from "../src/lib/customer-name";
import {
  createCustomerSessionValue,
  customerSessionCookieName,
  verifyCustomerSessionValue,
  type CustomerSessionPayload
} from "../src/lib/customer-session";

process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "customer-name-flow-test-secret";

assert.equal(normalizeCustomerName("  Minh   Anh  "), "Minh Anh");
assert.equal(normalizeCustomerName("Nguyễn Văn An"), "Nguyễn Văn An");
assert.equal(normalizeCustomerName("order"), null);
assert.equal(normalizeCustomerName(" GUEST "), null);
assert.equal(normalizeCustomerName("anonymous"), null);
assert.equal(customerGreeting("Minh Anh", "vi"), "Xin chào, Minh Anh");
assert.equal(customerGreeting("Minh Anh", "en"), "Hello, Minh Anh");
assert.equal(customerGreeting("order", "vi"), "Xin chào!");
assert.equal(customerDisplayName("customer"), "Chưa có tên");
assert.equal(customerDisplayName("Minh Anh"), "Minh Anh");
assert.notEqual(customerSessionCookieName("hongtra"), customerSessionCookieName("longphung"));

const baseSession: Omit<CustomerSessionPayload, "customerName"> = {
  restaurantId: "restaurant-a",
  restaurantSlug: "hongtra",
  tableId: "table-1",
  tableName: "1",
  qrToken: "valid-qr-token-1234",
  diningSessionId: "dining-session-1",
  createdAt: Date.now()
};

const minhAnh = verifyCustomerSessionValue(createCustomerSessionValue({ ...baseSession, customerName: "Minh Anh" }));
const nguyenVanAn = verifyCustomerSessionValue(createCustomerSessionValue({ ...baseSession, customerName: "Nguyễn Văn An" }));
assert.equal(minhAnh?.customerName, "Minh Anh");
assert.equal(nguyenVanAn?.customerName, "Nguyễn Văn An");
assert.notEqual(minhAnh?.customerName, nguyenVanAn?.customerName);

const legacyTechnicalName = verifyCustomerSessionValue(createCustomerSessionValue({ ...baseSession, customerName: "order" }));
assert.equal(legacyTechnicalName?.customerName, "");

const validValue = createCustomerSessionValue({ ...baseSession, customerName: "Minh Anh" });
assert.equal(verifyCustomerSessionValue(`${validValue.slice(0, -1)}x`), null);

console.log("Customer name flow checks passed.");
