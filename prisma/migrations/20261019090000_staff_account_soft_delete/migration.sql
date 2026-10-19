-- Give employee memberships a distinct soft-delete lifecycle while preserving history.
ALTER TABLE "RestaurantUser"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT;

-- Migrate only memberships whose latest lifecycle audit is an account deletion.
WITH "latestMembershipAudit" AS (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "userId",
    "action",
    "createdAt"
  FROM "AuditLog"
  WHERE "entityType" = 'RestaurantUser'
    AND "entityId" IS NOT NULL
  ORDER BY "entityId", "createdAt" DESC
)
UPDATE "RestaurantUser" AS membership
SET
  "deletedAt" = audit."createdAt",
  "deletedByUserId" = audit."userId",
  "isActive" = false
FROM "latestMembershipAudit" AS audit
WHERE membership."id" = audit."entityId"
  AND membership."isActive" = false
  AND audit."action" = 'STAFF_ACCOUNT_DELETED';

-- Deleted standalone employee users must not pass credential authentication.
UPDATE "User" AS account
SET "isActive" = false
WHERE account."platformRole" = 'USER'
  AND EXISTS (
    SELECT 1
    FROM "RestaurantUser" AS deleted_membership
    WHERE deleted_membership."userId" = account."id"
      AND deleted_membership."deletedAt" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "RestaurantUser" AS active_membership
    WHERE active_membership."userId" = account."id"
      AND active_membership."deletedAt" IS NULL
      AND active_membership."isActive" = true
  );

DROP INDEX IF EXISTS "RestaurantUser_restaurantId_username_key";

CREATE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_username_idx"
  ON "RestaurantUser"("restaurantId", "username");

CREATE INDEX IF NOT EXISTS "RestaurantUser_deletedAt_idx"
  ON "RestaurantUser"("deletedAt");

-- Historical rows retain their username; only non-deleted memberships reserve it.
CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantUser_active_restaurantId_username_key"
  ON "RestaurantUser"("restaurantId", "username")
  WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;
