import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasPlanFeature } from "../src/lib/plan/features";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file: string, expected: string, message: string) {
  assert.ok(read(file).includes(expected), message);
}

function assertNotIncludes(file: string, unexpected: string, message: string) {
  assert.ok(!read(file).includes(unexpected), message);
}

function assertRegex(file: string, pattern: RegExp, message: string) {
  assert.match(read(file), pattern, message);
}

function checkReportsPermission() {
  assert.equal(hasPlanFeature("BASIC", "REPORTS"), true, "BASIC must be allowed to view reports.");
  assert.equal(hasPlanFeature("PRO", "REPORTS"), true, "PRO must be allowed to view reports.");
  assert.equal(hasPlanFeature("TRAIN", "REPORTS", "RESTAURANT", "BASIC"), true, "TRAIN BASIC must be allowed to view reports.");
  assert.equal(hasPlanFeature("TRAIN", "REPORTS", "RESTAURANT", "PRO"), true, "TRAIN PRO must be allowed to view reports.");
  assertNotIncludes("src/lib/plan/features.ts", "ADVANCED_REPORTS", "ADVANCED_REPORTS must not return to the public plan matrix.");
}

function checkIdempotencyAndLocks() {
  assertRegex("prisma/schema.prisma", /model Order[\s\S]*@@unique\(\[restaurantId, idempotencyKey\]\)/, "Order must keep restaurant-scoped idempotency.");
  assertRegex("prisma/schema.prisma", /model Payment[\s\S]*@@unique\(\[restaurantId, idempotencyKey\]\)/, "Payment must keep restaurant-scoped idempotency.");

  assertIncludes("src/server/services/payment-service.ts", "FOR UPDATE", "Payment confirmation must lock the active dining session.");
  assertIncludes("src/server/services/payment-service.ts", "payment-request-${diningSessionId}", "Payment must use a stable session-scoped idempotency key.");
  assertIncludes("src/server/services/payment-service.ts", "status: \"PAID\"", "Payment confirmation must create or return a PAID payment.");

  assertIncludes("src/app/api/restaurants/[rSlug]/customer/order/route.ts", "FOR UPDATE", "Customer order creation must lock the active dining session.");
  assertIncludes("src/app/api/restaurants/[rSlug]/customer/order/route.ts", "P2002", "Customer order creation must handle duplicate idempotency keys.");
  assertIncludes("src/app/api/restaurants/[rSlug]/admin/tables/[tableId]/order/route.ts", "P2002", "Staff order creation must handle duplicate idempotency keys.");

  assertIncludes("src/server/services/subscription-service.ts", "FROM \"RestaurantSubscriptionRequest\"", "Subscription confirmation must lock the request row.");
  assertIncludes("src/server/services/subscription-service.ts", "FOR UPDATE", "Subscription confirmation must prevent double confirmation races.");
}

function checkTenantGuards() {
  assertIncludes("src/app/api/restaurants/[rSlug]/admin/tables/[tableId]/order/route.ts", "requireRestaurantAccess(params.rSlug, [\"OWNER\", \"MANAGER\", \"WAITER\"])", "Staff add-order API must use the shared restaurant guard.");
  assertIncludes("src/app/api/restaurants/[rSlug]/admin/tables/[tableId]/order/route.ts", "assertActiveStaffDeviceForAction", "Staff add-order API must enforce staff device state for staff roles.");
  assertIncludes("src/app/[rSlug]/admin/top-items/page.tsx", "requireRestaurantFeature(access, \"REPORTS\")", "Top items must be guarded by the unified REPORTS feature.");
  assertIncludes("src/app/platform/plans/actions.ts", "requirePlatformOwner", "Plan price changes must require platform owner access.");
  assertIncludes("src/app/platform/restaurants/actions.ts", "requirePlatformOwner", "Platform owner-only restaurant lifecycle actions must keep owner guard available.");
}

function checkBackupAndRestoreSafety() {
  assertIncludes("Dockerfile", "postgresql-client-16", "Maintenance image must include pg_dump 16 for PostgreSQL 16.");
  assertIncludes("scripts/platform-maintenance-worker.ts", "verifyPostgresBackupCompatibility", "Backup worker must verify pg_dump/server compatibility.");
  assertIncludes("scripts/platform-maintenance-worker.ts", "checksumFiles", "Backup worker must checksum backup artifacts.");
  assertIncludes("scripts/platform-maintenance-worker.ts", "expireOldSuccessfulBackups", "Backup worker must retain a bounded number of successful backups.");
  assertIncludes("src/server/services/platform-storage-service.ts", "checkBackupRestoreReadiness", "Storage service must verify backup files before restore is considered.");
  assertIncludes("src/server/services/platform-storage-service.ts", "Checksum không khớp", "Restore readiness must reject checksum mismatches.");
  assertIncludes("src/app/platform/storage/actions.ts", "requirePlatformOwner", "Backup restore checks must require platform owner access.");
  assertIncludes("src/components/platform/backup-history-card.tsx", "Khôi phục production đang khóa", "Production restore button must remain locked until restore safeguards exist.");
  assertIncludes("docs/BACKUP_AND_DATA_LIFECYCLE.md", "Không có nút khôi phục một chạm", "Restore documentation must warn against production one-click restore.");
}

function checkProductionLogging() {
  const sourceFiles = [
    "src/lib/auth/options.ts",
    "src/server/services/payment-service.ts",
    "src/app/api/restaurants/[rSlug]/ops/pay-session/route.ts",
    "src/app/api/restaurants/[rSlug]/admin/menu/route.ts",
    "src/app/[rSlug]/admin/actions.ts",
    "src/components/admin/simple-menu-manager.tsx",
    "src/components/admin/tables-live-panel.tsx"
  ];

  for (const file of sourceFiles) {
    assertNotIncludes(file, "console.log", `${file} must not use raw console.log in production paths.`);
  }

  assertIncludes("src/lib/debug-log.ts", "APP_DEBUG_LOGS", "Debug logging must be opt-in.");
  assertIncludes("src/lib/debug-log.ts", "[redacted]", "Debug logger must redact sensitive fields.");
}

checkReportsPermission();
checkIdempotencyAndLocks();
checkTenantGuards();
checkBackupAndRestoreSafety();
checkProductionLogging();

console.log("Production hardening checks passed.");
