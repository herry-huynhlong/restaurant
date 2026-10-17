import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const actions = readFileSync(resolve(root, "src/app/[rSlug]/ops/actions.ts"), "utf8");
const staffPage = readFileSync(resolve(root, "src/app/[rSlug]/staff/page.tsx"), "utf8");
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");

assert.match(schema, /waiterClaimedAt\s+DateTime\?/);
assert.match(actions, /export async function claimWaiterItemAction/);
assert.match(actions, /prisma\.\$transaction/);
assert.match(actions, /isolationLevel:\s*"Serializable"/);
assert.match(actions, /waiterAssignedDeviceSessionId:\s*deviceSession\.id/);
assert.match(actions, /waiterClaimedAt:\s*now/);
assert.match(actions, /isPrismaTransactionConflict/);
assert.match(actions, /publishNotificationRefresh\(access\.restaurant\.id\)/);
assert.match(actions, /revalidatePath\(restaurantRoutes\.staff\(slug\)\)/);

assert.match(staffPage, /const isAssignedToCurrentDevice/);
assert.match(staffPage, /isAssignedToCurrentDevice\(item\) \? 0/);
assert.match(staffPage, /b\.waiterClaimedAt\?\.getTime\(\)/);
assert.match(staffPage, /const hasCurrentAssignment/);
assert.match(staffPage, /canClaimNewItem=\{!hasCurrentAssignment\}/);
assert.match(staffPage, /Hoàn thành món đã nhận trước/);
assert.match(staffPage, /Món đã nhận ở trên cùng; phục vụ xong trước khi nhận món khác/);

console.log("Waiter claim ordering checks passed.");
