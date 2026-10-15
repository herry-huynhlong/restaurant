CREATE TABLE "RestaurantBackupRun" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "restaurantNameSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
    "backupDate" TEXT,
    "snapshotName" TEXT,
    "uploadsArchiveName" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestaurantBackupRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantRestoreRun" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "backupRunId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "publicMessage" TEXT,
    "rollbackReady" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestaurantRestoreRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantBackupRun_restaurantId_triggerType_backupDate_key" ON "RestaurantBackupRun"("restaurantId", "triggerType", "backupDate");
CREATE INDEX "RestaurantBackupRun_restaurantId_status_queuedAt_idx" ON "RestaurantBackupRun"("restaurantId", "status", "queuedAt");
CREATE INDEX "RestaurantBackupRun_status_queuedAt_idx" ON "RestaurantBackupRun"("status", "queuedAt");
CREATE INDEX "RestaurantBackupRun_createdAt_idx" ON "RestaurantBackupRun"("createdAt");
CREATE INDEX "RestaurantRestoreRun_restaurantId_status_queuedAt_idx" ON "RestaurantRestoreRun"("restaurantId", "status", "queuedAt");
CREATE INDEX "RestaurantRestoreRun_status_queuedAt_idx" ON "RestaurantRestoreRun"("status", "queuedAt");
CREATE INDEX "RestaurantRestoreRun_backupRunId_idx" ON "RestaurantRestoreRun"("backupRunId");

ALTER TABLE "RestaurantBackupRun" ADD CONSTRAINT "RestaurantBackupRun_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantRestoreRun" ADD CONSTRAINT "RestaurantRestoreRun_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantRestoreRun" ADD CONSTRAINT "RestaurantRestoreRun_backupRunId_fkey" FOREIGN KEY ("backupRunId") REFERENCES "RestaurantBackupRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
