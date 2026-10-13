CREATE TABLE "PlatformDataPolicy" (
  "id" TEXT NOT NULL,
  "singletonKey" TEXT NOT NULL DEFAULT 'default',
  "backupEnabled" BOOLEAN NOT NULL DEFAULT true,
  "backupTime" TEXT NOT NULL DEFAULT '02:00',
  "backupRetentionCount" INTEGER NOT NULL DEFAULT 3,
  "notificationRetentionDays" INTEGER NOT NULL DEFAULT 3,
  "temporaryDataRetentionDays" INTEGER NOT NULL DEFAULT 60,
  "backupStorageKind" TEXT NOT NULL DEFAULT 'LOCAL',
  "lastCleanupAt" TIMESTAMP(3),
  "nextCleanupAt" TIMESTAMP(3),
  "lastTaskStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformDataPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformDataPolicy_singletonKey_key" ON "PlatformDataPolicy"("singletonKey");

CREATE TABLE "PlatformBackupRun" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
  "storageKind" TEXT NOT NULL DEFAULT 'LOCAL',
  "locationLabel" TEXT,
  "databaseDumpName" TEXT,
  "uploadsArchiveName" TEXT,
  "sizeBytes" BIGINT NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformBackupRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformBackupRun_status_queuedAt_idx" ON "PlatformBackupRun"("status", "queuedAt");
CREATE INDEX "PlatformBackupRun_createdAt_idx" ON "PlatformBackupRun"("createdAt");

CREATE TABLE "PlatformMaintenanceRun" (
  "id" TEXT NOT NULL,
  "taskType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "deletedNotifications" INTEGER NOT NULL DEFAULT 0,
  "deletedDeviceSessions" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformMaintenanceRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformMaintenanceRun_taskType_status_queuedAt_idx" ON "PlatformMaintenanceRun"("taskType", "status", "queuedAt");
CREATE INDEX "PlatformMaintenanceRun_createdAt_idx" ON "PlatformMaintenanceRun"("createdAt");

CREATE TABLE "PlatformWorkerHeartbeat" (
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

CREATE UNIQUE INDEX "PlatformWorkerHeartbeat_singletonKey_key" ON "PlatformWorkerHeartbeat"("singletonKey");
CREATE INDEX "PlatformWorkerHeartbeat_serviceName_lastSeenAt_idx" ON "PlatformWorkerHeartbeat"("serviceName", "lastSeenAt");

CREATE TABLE "RestaurantStorageUsage" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "estimatedBytes" BIGINT NOT NULL DEFAULT 0,
  "dataBytes" BIGINT NOT NULL DEFAULT 0,
  "uploadBytes" BIGINT NOT NULL DEFAULT 0,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "RestaurantStorageUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantStorageUsage_restaurantId_key" ON "RestaurantStorageUsage"("restaurantId");
CREATE INDEX "RestaurantStorageUsage_estimatedBytes_idx" ON "RestaurantStorageUsage"("estimatedBytes");
CREATE INDEX "RestaurantStorageUsage_calculatedAt_idx" ON "RestaurantStorageUsage"("calculatedAt");

ALTER TABLE "RestaurantStorageUsage"
  ADD CONSTRAINT "RestaurantStorageUsage_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
