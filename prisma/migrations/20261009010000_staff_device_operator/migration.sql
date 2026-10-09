ALTER TABLE "StaffDeviceSession"
  ADD COLUMN IF NOT EXISTS "deviceName" TEXT,
  ADD COLUMN IF NOT EXISTS "operatorName" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "StaffDeviceSession_restaurantId_isActive_onShift_idx"
  ON "StaffDeviceSession"("restaurantId", "isActive", "onShift");

CREATE INDEX IF NOT EXISTS "StaffDeviceSession_restaurantId_userId_isActive_idx"
  ON "StaffDeviceSession"("restaurantId", "userId", "isActive");

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "kitchenAssignedDeviceSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "waiterAssignedDeviceSessionId" TEXT;

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_kitchenAssignedDeviceSessionId_idx"
  ON "OrderItem"("restaurantId", "kitchenAssignedDeviceSessionId");

CREATE INDEX IF NOT EXISTS "OrderItem_restaurantId_waiterAssignedDeviceSessionId_idx"
  ON "OrderItem"("restaurantId", "waiterAssignedDeviceSessionId");
