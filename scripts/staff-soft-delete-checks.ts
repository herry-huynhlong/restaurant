import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeInternalStaffEmail } from "../src/lib/username";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261019090000_staff_account_soft_delete/migration.sql");
const actions = read("src/app/[rSlug]/admin/actions.ts");
const staffPage = read("src/app/[rSlug]/admin/staff/page.tsx");
const auth = read("src/lib/auth/options.ts");
const guards = read("src/lib/rbac/guards.ts");

assert.match(schema, /model RestaurantUser[\s\S]*deletedAt\s+DateTime\?[\s\S]*deletedByUserId\s+String\?/);
assert.ok(!schema.includes("@@unique([restaurantId, username])"), "Deleted usernames must not remain occupied by Prisma's unconditional unique constraint.");
assert.ok(migration.includes('WHERE "deletedAt" IS NULL AND "username" IS NOT NULL'), "Active usernames need a database-enforced partial unique index.");
assert.ok(migration.includes("latestMembershipAudit"), "Legacy delete audit records must be migrated conservatively.");
assert.ok(actions.includes("deletedAt: now") && actions.includes("deletedByUserId: access.user.id"), "Delete must retain an explicit lifecycle marker and actor.");
assert.ok(actions.includes("deletedAt: null"), "Staff management actions must reject deleted memberships.");
assert.ok(staffPage.includes("deletedAt: null"), "Deleted memberships must be hidden from the normal employee directory and totals.");
assert.ok(auth.includes("deletedAt: null"), "Deleted usernames must never be selected during authentication.");
assert.ok(guards.includes("membership.deletedAt"), "Old JWTs must be rejected by restaurant authorization guards.");

const firstEmail = makeInternalStaffEmail("restaurant-123", "thungan", "first-account-id");
const secondEmail = makeInternalStaffEmail("restaurant-123", "thungan", "second-account-id");
assert.notEqual(firstEmail, secondEmail, "Recreated usernames must receive a distinct User identity/email.");
assert.ok(firstEmail.endsWith("@staff.local") && secondEmail.endsWith("@staff.local"));

console.log("Staff soft-delete checks passed.");
