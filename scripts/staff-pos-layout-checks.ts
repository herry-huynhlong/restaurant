import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/[rSlug]/staff/page.tsx", "utf8");
const tabs = readFileSync("src/components/staff/staff-workspace-tabs.tsx", "utf8");
const tables = readFileSync("src/components/admin/tables-live-panel.tsx", "utf8");
const orders = readFileSync("src/components/admin/orders-by-table-board.tsx", "utf8");
const notifications = readFileSync("src/components/app-shell/notification-bell.tsx", "utf8");
const loading = readFileSync("src/app/[rSlug]/staff/loading.tsx", "utf8");

assert.ok(tabs.includes("Món chờ đi") && tabs.includes("Yêu cầu khách") && tabs.includes("Khu vực & Bàn") && tabs.includes("Order theo bàn"), "Staff must retain all four work areas.");
assert.ok(tabs.includes("count.actionable") && tabs.includes("count.total"), "Tabs must distinguish actionable work from total work.");
assert.ok(tabs.includes("grid-cols-2") && tabs.includes("lg:grid-cols-4"), "Tabs must adapt between mobile and desktop layouts.");

assert.ok(page.includes('request.status === "NEW" ? "Chưa nhận" : "Đang xử lý"'), "Customer requests must expose their real workflow state.");
assert.ok(page.includes('"ACKNOWLEDGED"') && page.includes('"COMPLETED"'), "Customer request actions must preserve the existing state transitions.");
assert.ok(page.includes("formatWaitingTime"), "Ready food and customer requests must show waiting time.");
assert.ok(page.includes("lg:grid-cols-2"), "High-volume work lists must use available desktop width.");

assert.ok(tables.includes("compactForStaff") && tables.includes("Tìm số bàn"), "Staff table mode must provide compact search.");
assert.ok(tables.includes('StaffTableFilter = "ALL" | "ATTENTION" | "SERVING" | "AVAILABLE"'), "Staff tables must provide real-state filters.");
assert.ok(orders.includes("compactForStaff") && orders.includes("Tìm bàn hoặc khu vực"), "Staff order mode must provide compact search.");
assert.ok(orders.includes('StaffOrderFilter = "ALL" | "ATTENTION" | "PAYMENT"'), "Staff orders must provide operational filters.");
assert.ok(orders.includes("Đang kết nối lại"), "Order state failures must be visible without discarding existing data.");
assert.ok(loading.includes('aria-busy="true"'), "Staff must provide an accessible initial loading state.");

assert.ok(notifications.includes("6500"), "Foreground notifications must dismiss automatically.");
assert.ok(notifications.includes("line-clamp-2"), "Foreground notifications must remain compact.");

console.log("Staff POS layout checks passed.");
