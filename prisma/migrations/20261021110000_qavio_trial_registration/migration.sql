CREATE TABLE "TrialRegistration" ("id" TEXT NOT NULL PRIMARY KEY,"keyHash" TEXT NOT NULL UNIQUE,"requestHash" TEXT NOT NULL,"challengeId" TEXT NOT NULL UNIQUE,"googleSubject" TEXT NOT NULL UNIQUE,"restaurantId" TEXT NOT NULL UNIQUE,"ownerUserId" TEXT NOT NULL UNIQUE,"result" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "TrialIdentityChallenge" ("id" TEXT NOT NULL PRIMARY KEY,"stateHash" TEXT NOT NULL UNIQUE,"flowHash" TEXT NOT NULL,"pkceVerifier" TEXT NOT NULL,"nonce" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"verifiedAt" TIMESTAMP(3),"email" TEXT,"ownerName" TEXT,"googleSubject" TEXT,"ticketHash" TEXT UNIQUE,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "TrialIdentityChallenge_expiresAt_idx" ON "TrialIdentityChallenge"("expiresAt");
CREATE TABLE "TrialRateBucket" ("keyHash" TEXT NOT NULL PRIMARY KEY,"count" INTEGER NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "TrialRateBucket_expiresAt_idx" ON "TrialRateBucket"("expiresAt");
CREATE TABLE "TrialServiceNonce" ("keyHash" TEXT NOT NULL PRIMARY KEY,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "TrialServiceNonce_expiresAt_idx" ON "TrialServiceNonce"("expiresAt");
