ALTER TABLE "PushSubscription"
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "onShift" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastShiftStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastShiftEndedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PushSubscription_restaurantId_userId_deviceId_idx"
  ON "PushSubscription"("restaurantId", "userId", "deviceId");

CREATE INDEX IF NOT EXISTS "PushSubscription_restaurantId_isActive_onShift_idx"
  ON "PushSubscription"("restaurantId", "isActive", "onShift");

CREATE TABLE IF NOT EXISTS "StaffDeviceSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "role" "RestaurantRole" NOT NULL,
  "onShift" BOOLEAN NOT NULL DEFAULT true,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffDeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffDeviceSession_restaurantId_userId_deviceId_key"
  ON "StaffDeviceSession"("restaurantId", "userId", "deviceId");

CREATE INDEX IF NOT EXISTS "StaffDeviceSession_restaurantId_onShift_idx"
  ON "StaffDeviceSession"("restaurantId", "onShift");

CREATE INDEX IF NOT EXISTS "StaffDeviceSession_userId_onShift_idx"
  ON "StaffDeviceSession"("userId", "onShift");
