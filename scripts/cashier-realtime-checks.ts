import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync("src/components/cashier/cashier-workspace.tsx", "utf8");
const route = readFileSync("src/app/api/restaurants/[rSlug]/cashier/state/route.ts", "utf8");
const paymentRoute = readFileSync("src/app/api/restaurants/[rSlug]/ops/pay-session/route.ts", "utf8");
const notificationService = readFileSync("src/server/services/notification-service.ts", "utf8");

assert.ok(workspace.includes("new EventSource"), "Cashier must subscribe to the existing realtime stream.");
assert.ok(workspace.includes("/cashier/state"), "Cashier must fetch live business state instead of only notifications.");
assert.ok(workspace.includes("setLiveSessions(data.sessions)"), "Live session data must update in place.");
assert.ok(workspace.includes("setSummary(data.summary)"), "Cashier KPIs must update in place.");
assert.ok(workspace.includes("15000"), "A lightweight polling fallback must remain available.");
assert.ok(workspace.includes("150);"), "Bursts of realtime events must be coalesced before fetching state.");
assert.ok(!workspace.includes("router.refresh()"), "Cashier realtime must not refresh the entire RSC page.");

assert.ok(route.includes("requireRestaurantAccess"), "Cashier state must require authenticated restaurant access.");
assert.ok(route.includes("requireRestaurantFeature"), "Cashier state must preserve plan-feature authorization.");
assert.ok(route.includes("getActiveStaffDeviceSession"), "Cashier state must validate staff devices.");
assert.ok(route.includes('"Cache-Control": "no-store, max-age=0"'), "Cashier state must not be cached.");

assert.ok(notificationService.includes("publishNotificationRefresh(restaurantId)"), "Order and request notifications must publish refresh events.");
assert.ok(paymentRoute.includes("publishNotificationRefresh(access.restaurant.id)"), "Completed payments must publish refresh events.");

console.log("Cashier realtime checks passed.");
