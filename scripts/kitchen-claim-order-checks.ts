import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const kitchenPage = readFileSync("src/app/[rSlug]/kitchen/page.tsx", "utf8");
const actions = readFileSync("src/app/[rSlug]/ops/actions.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

assert.ok(schema.includes("kitchenClaimedAt"), "Kitchen items must persist the time they were claimed.");
assert.ok(actions.includes("kitchenClaimedAt: now"), "Claiming a kitchen item must update its claimed time.");
assert.ok(actions.includes('status: "COOKING"'), "Claiming an item must preserve the existing cooking transition.");
assert.ok(actions.includes("publishNotificationRefresh(access.restaurant.id)"), "Kitchen claim changes must reach other active devices.");
assert.ok(kitchenPage.includes('{ kitchenClaimedAt: "desc" }'), "The server query must return recently claimed items first.");
assert.ok(kitchenPage.includes("(b.kitchenClaimedAt?.getTime() ?? 0) - (a.kitchenClaimedAt?.getTime() ?? 0)"), "The cooking list must keep recently claimed items first after rendering.");
assert.ok(!kitchenPage.includes("mineA - mineB"), "Per-user grouping must not override the global claim order.");
assert.ok(kitchenPage.indexOf('title="Đang làm"') < kitchenPage.indexOf('title="Chờ làm"'), "The cooking queue must render before the waiting queue on every viewport.");

console.log("Kitchen claim order checks passed.");
