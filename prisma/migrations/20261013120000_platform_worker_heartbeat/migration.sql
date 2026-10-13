CREATE TABLE IF NOT EXISTS "PlatformWorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "singletonKey" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OK',
  "message" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformWorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformWorkerHeartbeat_singletonKey_key" ON "PlatformWorkerHeartbeat"("singletonKey");
CREATE INDEX IF NOT EXISTS "PlatformWorkerHeartbeat_serviceName_lastSeenAt_idx" ON "PlatformWorkerHeartbeat"("serviceName", "lastSeenAt");
