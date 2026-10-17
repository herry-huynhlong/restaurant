import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const deviceRoute = readFileSync("src/app/api/restaurants/[rSlug]/device-session/route.ts", "utf8");
const staffPage = readFileSync("src/app/[rSlug]/admin/staff/page.tsx", "utf8");

assert.ok(schema.includes("operatorName String?"), "Each staff device session must retain its own operator name.");
assert.ok(deviceRoute.includes("operatorName: parsed.data.operatorName"), "Device login must persist the submitted operator name.");
assert.ok(staffPage.includes("operatorName: session.operatorName ?? name"), "Legacy device sessions must fall back to the owning account name.");
assert.ok(staffPage.includes("Người dùng:") && staffPage.includes("{device.operatorName}"), "Every device row must display its own operator name.");
assert.ok(staffPage.includes("device.operatorName || staffName"), "Device revoke confirmation must identify the device operator.");

console.log("Staff device name checks passed.");
