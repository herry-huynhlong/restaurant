-- Preserve historical Google-verification data, but allow new self-serve
-- registrations to be created without an OAuth identity proof.
ALTER TABLE "TrialRegistration"
  ALTER COLUMN "challengeId" DROP NOT NULL,
  ALTER COLUMN "googleSubject" DROP NOT NULL;
