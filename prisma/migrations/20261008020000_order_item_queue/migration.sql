DO $$ BEGIN
  CREATE TYPE "OrderItemStatus" AS ENUM ('NEW', 'COOKING', 'READY', 'SERVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "status" "OrderItemStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "kitchenAssignedToUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "kitchenClaimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "waiterAssignedToUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "waiterClaimedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "servedAt" TIMESTAMP(3);

UPDATE "OrderItem" oi
SET
  "status" = CASE o."status"
    WHEN 'PREPARING' THEN 'COOKING'::"OrderItemStatus"
    WHEN 'READY' THEN 'READY'::"OrderItemStatus"
    WHEN 'SERVED' THEN 'SERVED'::"OrderItemStatus"
    ELSE oi."status"
  END,
  "readyAt" = CASE WHEN o."status" = 'READY' AND oi."readyAt" IS NULL THEN o."updatedAt" ELSE oi."readyAt" END,
  "servedAt" = CASE WHEN o."status" = 'SERVED' AND oi."servedAt" IS NULL THEN o."updatedAt" ELSE oi."servedAt" END
FROM "Order" o
WHERE oi."orderId" = o."id";

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_status_idx"
  ON "OrderItem"("restaurantId", "status");

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_kitchenAssignedToUserId_idx"
  ON "OrderItem"("restaurantId", "kitchenAssignedToUserId");

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_waiterAssignedToUserId_idx"
  ON "OrderItem"("restaurantId", "waiterAssignedToUserId");

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_readyAt_idx"
  ON "OrderItem"("restaurantId", "readyAt");
